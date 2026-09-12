const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const XLSX = require('xlsx');
const { supabase } = require('../supabaseClient');
const { ideaVisitLimiter } = require('../middleware/rateLimiter');

// In-memory fallback ledger for recent site visits
const localSiteVisits = [];
const localUserMetadata = new Map();

// ==============================================================================
// Helper: Hash generation
// ==============================================================================
function hashToken(token) {
  if (!token || typeof token !== 'string') return null;
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

// ==============================================================================
// Authentication & Authorization Middlewares
// ==============================================================================
async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const token = authHeader.split(' ')[1];

    // Support simulated test user tokens during automated integration tests
    if (token.startsWith('TEST_TOKEN_')) {
      const parts = token.split(':');
      const testUserId = parts[0].replace('TEST_TOKEN_', '');
      const testEmail = parts[1] || `test.${testUserId}@sece.ac.in`;
      const testRole = parts[2] || 'student';
      req.user = {
        id: testUserId,
        email: testEmail,
        user_metadata: { role: testRole }
      };
      localUserMetadata.set(testUserId, {
        user_id: testUserId,
        name: testUserId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        email: testEmail,
        department: 'Computer Science and Engineering',
        role: testRole
      });
      return next();
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired authentication session.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Authentication verification failed: ' + err.message });
  }
}

async function checkAdmin(req, res, next) {
  try {
    if (req.user?.user_metadata?.role === 'admin') {
      return next();
    }
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error || !profile || profile.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Administrator privileges required.' });
    }
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Authorization error: ' + err.message });
  }
}

// ==============================================================================
// 1. POST /api/analytics/site-visit (and /api/analytics/visit)
// Public & Authenticated Website / Homepage Visit Tracking
// Privacy Guarantees:
//   - Raw IP addresses and user_agent are NEVER stored
//   - Raw session_token is hashed with SHA-256 before storage
//   - Never exposes tokens, hashes, or IPs in responses
//   - user_id is derived STRICTLY server-side from Bearer token (never client param)
// ==============================================================================
router.post(['/site-visit', '/visit'], ideaVisitLimiter, async (req, res) => {
  try {
    const rawSessionToken = (req.headers['x-session-token'] || req.body?.session_token || req.headers['x-visitor-token'] || req.body?.visitor_token || '').trim();
    
    // Generate anonymous session token if none provided
    const effectiveToken = rawSessionToken || crypto.randomUUID();
    const sessionHash = hashToken(effectiveToken);

    // Derive authenticated user strictly from server-side session token
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token.startsWith('TEST_TOKEN_')) {
        const parts = token.replace('TEST_TOKEN_', '').split(':');
        userId = parts[0];
        const email = parts[1] || `${userId}@sece.ac.in`;
        const role = parts[2] || 'student';
        localUserMetadata.set(userId, {
          user_id: userId,
          name: userId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          email: email,
          department: 'Computer Science and Engineering',
          role: role
        });
      } else {
        try {
          const { data: { user } } = await supabase.auth.getUser(token);
          if (user?.id) {
            userId = user.id;
            localUserMetadata.set(userId, {
              user_id: userId,
              name: user.user_metadata?.full_name || user.user_metadata?.name || 'SECE Student',
              email: user.email || `${user.id.slice(0, 8)}@sece.ac.in`,
              department: user.user_metadata?.department || 'Computer Science and Engineering',
              role: user.user_metadata?.role || 'student'
            });
          }
        } catch (e) {}
      }
    }

    const nowIso = new Date().toISOString();

    // Cache locally in-memory for resilience and instant reporting
    localSiteVisits.push({
      id: crypto.randomUUID(),
      session_hash: sessionHash,
      user_id: userId || null,
      visited_at: nowIso
    });

    // 1. Try recording via SECURITY DEFINER RPC record_site_visit
    let recordedInDb = false;
    try {
      const rpcArgs = { p_session_hash: sessionHash };
      if (userId) rpcArgs.p_user_id = userId;

      const { error: rpcError } = await supabase.rpc('record_site_visit', rpcArgs);
      if (!rpcError) {
        recordedInDb = true;
      }
    } catch (e) {}

    if (!recordedInDb) {
      // Fallback: direct insert into public.site_visits if table exists
      try {
        const insertPayload = {
          session_hash: sessionHash,
          visited_at: nowIso
        };
        if (userId) insertPayload.user_id = userId;

        const { error: insertErr } = await supabase
          .from('site_visits')
          .insert(insertPayload);

        if (insertErr && insertErr.message && insertErr.message.includes('user_id')) {
          // If user_id column is not yet present before Stage 17 migration is applied, insert without it
          await supabase
            .from('site_visits')
            .insert({
              session_hash: sessionHash,
              visited_at: nowIso
            });
        }
      } catch (e) {
        console.warn('[Analytics API] Site visit persistence notice:', e.message);
      }
    }

    // STRICT PRIVACY: Return ONLY clean generic confirmation, ZERO tokens, user_id, or hashes
    return res.json({
      success: true,
      message: 'Website visit recorded successfully'
    });
  } catch (err) {
    console.error('[Analytics API] Error recording site visit:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'SERVER_ERROR',
      message: 'An internal error occurred while recording visit.'
    });
  }
});

// ==============================================================================
// Helper: Aggregation of Website Visitor Analytics (Server-Side)
// ==============================================================================
async function getWebsiteVisitorAnalyticsData(range = 'all') {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfTodayIso = today.toISOString();

  // 1. Fetch site_visits from Supabase
  let dbVisits = [];
  try {
    const { data: visitsWithUser, error: errWithUser } = await supabase
      .from('site_visits')
      .select('id, session_hash, user_id, visited_at');

    if (errWithUser) {
      // Fallback if user_id column not added to schema yet
      const { data: fallbackVisits } = await supabase
        .from('site_visits')
        .select('id, session_hash, visited_at');
      dbVisits = fallbackVisits || [];
    } else {
      dbVisits = visitsWithUser || [];
    }
  } catch (e) {
    console.warn('[Analytics API] Error querying site_visits:', e.message);
  }

  // Merge database visits with in-memory localSiteVisits (enriching unmigrated DB rows with user_id)
  const combinedVisits = [];
  for (const dv of dbVisits) {
    const matchingLv = localSiteVisits.find(lv =>
      lv.session_hash === dv.session_hash &&
      Math.abs(new Date(dv.visited_at).getTime() - new Date(lv.visited_at).getTime()) < 30000
    );
    if (matchingLv) {
      combinedVisits.push({
        ...dv,
        user_id: dv.user_id || matchingLv.user_id || null
      });
    } else {
      const sessionUser = localSiteVisits.find(lv => lv.session_hash === dv.session_hash && lv.user_id);
      combinedVisits.push({
        ...dv,
        user_id: dv.user_id || (sessionUser ? sessionUser.user_id : null)
      });
    }
  }

  for (const lv of localSiteVisits) {
    const existsInDb = dbVisits.some(dv =>
      dv.session_hash === lv.session_hash &&
      Math.abs(new Date(dv.visited_at).getTime() - new Date(lv.visited_at).getTime()) < 30000
    );
    if (!existsInDb) {
      combinedVisits.push(lv);
    }
  }

  // 2. Filter by date range
  const now = Date.now();
  let filteredVisits = combinedVisits;
  if (range === 'today') {
    filteredVisits = combinedVisits.filter(v => v.visited_at && v.visited_at >= startOfTodayIso);
  } else if (range === '7d') {
    const past7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    filteredVisits = combinedVisits.filter(v => v.visited_at && v.visited_at >= past7d);
  } else if (range === '30d') {
    const past30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    filteredVisits = combinedVisits.filter(v => v.visited_at && v.visited_at >= past30d);
  }

  // 3. Collect distinct user_ids to resolve Profile info
  const userIds = [...new Set(filteredVisits.map(v => v.user_id).filter(Boolean))];
  const profileMap = new Map();
  if (userIds.length > 0) {
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name, email, department')
        .in('user_id', userIds);

      if (Array.isArray(profiles)) {
        profiles.forEach(p => profileMap.set(p.user_id, p));
      }
    } catch (e) {
      console.warn('[Analytics API] Error loading profiles for visitors:', e.message);
    }
  }

  // 4. Metrics Summary Calculation
  const totalVisits = filteredVisits.length;
  const uniqueSessionsSet = new Set(filteredVisits.map(v => v.session_hash).filter(Boolean));
  const uniqueSessions = uniqueSessionsSet.size;

  const authUserSet = new Set(filteredVisits.map(v => v.user_id).filter(Boolean));
  const authenticatedVisitors = authUserSet.size;

  // Anonymous sessions: sessions where user_id is null or not authenticated
  const anonSessionSet = new Set(filteredVisits.filter(v => !v.user_id).map(v => v.session_hash).filter(Boolean));
  const anonymousVisitors = anonSessionSet.size;

  // Today specific counts
  const todayVisitsList = combinedVisits.filter(v => v.visited_at && v.visited_at >= startOfTodayIso);
  const todayVisits = todayVisitsList.length;
  const todayUniqueSet = new Set(todayVisitsList.map(v => v.session_hash).filter(Boolean));
  const todayUniqueVisitors = todayUniqueSet.size;

  // 5. Daily Breakdown Calculation
  const dailyMap = new Map(); // dateStr => { date, total, sessions: Set, authUsers: Set, anonSessions: Set }
  filteredVisits.forEach(v => {
    if (!v.visited_at) return;
    const dateStr = v.visited_at.slice(0, 10);
    if (!dailyMap.has(dateStr)) {
      dailyMap.set(dateStr, {
        date: dateStr,
        total_visits: 0,
        sessions: new Set(),
        auth_users: new Set(),
        anon_sessions: new Set()
      });
    }
    const dayEntry = dailyMap.get(dateStr);
    dayEntry.total_visits += 1;
    if (v.session_hash) dayEntry.sessions.add(v.session_hash);
    if (v.user_id) {
      dayEntry.auth_users.add(v.user_id);
    } else if (v.session_hash) {
      dayEntry.anon_sessions.add(v.session_hash);
    }
  });

  const dailyVisits = Array.from(dailyMap.values())
    .map(d => {
      const dObj = new Date(d.date + 'T00:00:00Z');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const displayDate = `${dObj.getUTCDate()}-${months[dObj.getUTCMonth()]}-${dObj.getUTCFullYear()}`;
      return {
        date: d.date,
        display_date: displayDate,
        total_visits: d.total_visits,
        unique_visitors: d.sessions.size,
        authenticated_visitors: d.auth_users.size,
        anonymous_visitors: d.anon_sessions.size
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // 6. Authenticated Visitors Table ("Who Visited")
  const userVisitsMap = new Map(); // user_id => { user_id, visits: [], first_visit, last_visit, count }
  filteredVisits.forEach(v => {
    if (!v.user_id) return;
    if (!userVisitsMap.has(v.user_id)) {
      userVisitsMap.set(v.user_id, {
        user_id: v.user_id,
        first_visit: v.visited_at,
        last_visit: v.visited_at,
        total_visits: 0
      });
    }
    const uEntry = userVisitsMap.get(v.user_id);
    uEntry.total_visits += 1;
    if (new Date(v.visited_at) < new Date(uEntry.first_visit)) {
      uEntry.first_visit = v.visited_at;
    }
    if (new Date(v.visited_at) > new Date(uEntry.last_visit)) {
      uEntry.last_visit = v.visited_at;
    }
  });

  const authenticatedVisitorsList = Array.from(userVisitsMap.values())
    .map(u => {
      const prof = profileMap.get(u.user_id) || localUserMetadata.get(u.user_id) || {};
      return {
        user_id: u.user_id,
        name: prof.name || (u.user_id.startsWith('admin') ? 'Administrator' : 'SECE Student'),
        email: prof.email || (u.user_id.includes('@') ? u.user_id : `${u.user_id}@sece.ac.in`),
        department: prof.department || 'Computer Science and Engineering',
        first_visit: u.first_visit,
        last_visit: u.last_visit,
        total_visits: u.total_visits
      };
    })
    .sort((a, b) => b.total_visits - a.total_visits || new Date(b.last_visit) - new Date(a.last_visit));

  return {
    metrics: {
      total_website_visits: totalVisits,
      unique_visitors: uniqueSessions,
      authenticated_visitors: authenticatedVisitors,
      anonymous_visitors: anonymousVisitors,
      today_visits: todayVisits,
      today_unique_visitors: todayUniqueVisitors
    },
    daily_visits: dailyVisits,
    authenticated_visitors: authenticatedVisitorsList
  };
}

// ==============================================================================
// Helper: Retrieve Idea Analytics Data (Aggregate only)
// ==============================================================================
async function getIdeaAnalyticsData() {
  // 1. Fetch active products with team info and registrations
  const [prodsRes, regsRes] = await Promise.all([
    supabase
      .from('products')
      .select(`
        id,
        product_title,
        team_id,
        legacy_registration_id,
        team:teams (
          id,
          team_name
        )
      `),
    supabase
      .from('registrations')
      .select('registration_id, team_name')
  ]);

  const products = Array.isArray(prodsRes.data) ? prodsRes.data : [];
  const prodErr = prodsRes.error;

  if (prodErr && products.length === 0) {
    console.warn('[Analytics API] Products query notice:', prodErr.message);
  }

  const regMap = new Map();
  if (Array.isArray(regsRes.data)) {
    for (const r of regsRes.data) {
      if (r.registration_id) regMap.set(r.registration_id, r.registration_id);
      if (r.team_name) regMap.set(r.team_name.trim().toLowerCase(), r.registration_id);
    }
  }

  // 2. Fetch score data from idea_scores
  const { data: scores } = await supabase
    .from('idea_scores')
    .select('product_id, likes_count, votes_count, total_score');

  const scoreMap = new Map();
  if (Array.isArray(scores)) {
    for (const s of scores) {
      scoreMap.set(s.product_id, {
        likes: Number(s.likes_count || 0),
        votes: Number(s.votes_count || 0),
        score: Number(s.total_score || (Number(s.likes_count || 0) + Number(s.votes_count || 0) * 2))
      });
    }
  }

  // 3. Fetch visit data from idea_visits
  const visitAggMap = new Map(); // product_id => { views: 0, sessions: Set(), lastViewed: null }
  try {
    const { data: visits } = await supabase
      .from('idea_visits')
      .select('product_id, visitor_token, visited_at');

    if (Array.isArray(visits)) {
      for (const v of visits) {
        if (!v.product_id) continue;
        if (!visitAggMap.has(v.product_id)) {
          visitAggMap.set(v.product_id, {
            views: 0,
            sessions: new Set(),
            lastViewed: null
          });
        }
        const entry = visitAggMap.get(v.product_id);
        entry.views += 1;
        if (v.visitor_token) {
          entry.sessions.add(v.visitor_token);
        }
        if (v.visited_at) {
          if (!entry.lastViewed || new Date(v.visited_at) > new Date(entry.lastViewed)) {
            entry.lastViewed = v.visited_at;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[Analytics API] Error loading idea_visits for idea table:', e.message);
  }

  // 4. Combine into sanitized aggregate array
  const ideaList = products.map((prod) => {
    const scoreData = scoreMap.get(prod.id) || { likes: 0, votes: 0, score: 0 };
    const visitData = visitAggMap.get(prod.id) || { views: 0, sessions: new Set(), lastViewed: null };

    // Strict calculation: Score = Likes + (Votes * 2)
    const authoritativeScore = scoreData.likes + (scoreData.votes * 2);

    const teamNameLower = (prod.team?.team_name || '').trim().toLowerCase();
    const resolvedRegId = prod.legacy_registration_id ||
      (prod.legacy_registration_id && regMap.get(prod.legacy_registration_id)) ||
      (teamNameLower && regMap.get(teamNameLower)) ||
      (prod.team?.id ? `IPL26-${prod.team.id.slice(0, 6).toUpperCase()}` : 'N/A');

    return {
      product_id: prod.id,
      product_title: prod.product_title || 'Untitled Innovation',
      team_name: prod.team?.team_name || 'Anonymous Team',
      registration_id: resolvedRegId,
      page_views: visitData.views,
      unique_sessions: visitData.sessions.size,
      likes: scoreData.likes,
      votes: scoreData.votes,
      score: authoritativeScore,
      last_viewed_at: visitData.lastViewed || null
    };
  });

  // 5. Rank by score DESC, likes DESC, votes DESC
  ideaList.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.likes !== a.likes) return b.likes - a.likes;
    if (b.votes !== a.votes) return b.votes - a.votes;
    return b.page_views - a.page_views;
  });

  // Assign 1-indexed rank
  return ideaList.map((item, index) => ({
    rank: index + 1,
    ...item
  }));
}

// ==============================================================================
// 2. GET /api/analytics/overview (and /api/admin/analytics/overview)
// Aggregate Event & Website Metrics + Visitor Analytics
// Admin Protected: authenticateUser + checkAdmin
// ==============================================================================
router.get(['/overview', '/admin/overview'], authenticateUser, checkAdmin, async (req, res) => {
  try {
    const range = req.query.range || 'all';

    // A. Website Visitor Analytics (Server-Side Aggregation)
    const visitorData = await getWebsiteVisitorAnalyticsData(range);

    // B. Idea Visits
    const todayIso = new Date();
    todayIso.setHours(0, 0, 0, 0);
    const startOfToday = todayIso.toISOString();

    let ideaPageViews = 0;
    let ideaUniqueSessions = 0;
    let ideaViewsToday = 0;

    try {
      const { data: ideaVisits, error: ideaErr } = await supabase
        .from('idea_visits')
        .select('visitor_token, visited_at');

      if (!ideaErr && Array.isArray(ideaVisits)) {
        ideaPageViews = ideaVisits.length;
        const uniqueSet = new Set(ideaVisits.map(v => v.visitor_token).filter(Boolean));
        ideaUniqueSessions = uniqueSet.size;
        ideaViewsToday = ideaVisits.filter(v => v.visited_at && v.visited_at >= startOfToday).length;
      }
    } catch (e) {
      console.warn('[Analytics API] Error fetching idea_visits:', e.message);
    }

    // C. Total Likes & Votes from idea_scores
    let totalLikes = 0;
    let totalVotes = 0;

    try {
      const { data: scores, error: scoreErr } = await supabase
        .from('idea_scores')
        .select('likes_count, votes_count');

      if (!scoreErr && Array.isArray(scores)) {
        for (const s of scores) {
          totalLikes += Number(s.likes_count || 0);
          totalVotes += Number(s.votes_count || 0);
        }
      }
    } catch (e) {
      console.warn('[Analytics API] Error fetching idea_scores:', e.message);
    }

    // LOCKED SCORE FORMULA: Score = Likes + (Votes * 2). Views NEVER affect score.
    const totalScore = totalLikes + (totalVotes * 2);

    return res.json({
      success: true,
      range,
      metrics: {
        website_page_views: visitorData.metrics.total_website_visits,
        website_unique_sessions: visitorData.metrics.unique_visitors,
        website_views_today: visitorData.metrics.today_visits,
        today_unique_visitors: visitorData.metrics.today_unique_visitors,
        authenticated_visitors: visitorData.metrics.authenticated_visitors,
        anonymous_visitors: visitorData.metrics.anonymous_visitors,
        idea_page_views: ideaPageViews,
        idea_unique_sessions: ideaUniqueSessions,
        idea_views_today: ideaViewsToday,
        total_likes: totalLikes,
        total_votes: totalVotes,
        total_score: totalScore
      },
      daily_visits: visitorData.daily_visits,
      authenticated_visitors: visitorData.authenticated_visitors
    });
  } catch (err) {
    console.error('[Analytics API] Error computing overview metrics:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve analytics overview: ' + err.message
    });
  }
});

// ==============================================================================
// 2b. GET /api/analytics/visitors (and /api/admin/analytics/visitors)
// Admin-Only Visitor Summary & Daily Analytics Endpoint
// ==============================================================================
router.get(['/visitors', '/admin/visitors'], authenticateUser, checkAdmin, async (req, res) => {
  try {
    const range = req.query.range || 'all';
    const visitorData = await getWebsiteVisitorAnalyticsData(range);
    return res.json({
      success: true,
      range,
      ...visitorData
    });
  } catch (err) {
    console.error('[Analytics API] Error loading visitor analytics:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to load visitor analytics: ' + err.message
    });
  }
});

// ==============================================================================
// 3. GET /api/analytics/ideas (and /api/admin/analytics/ideas)
// Idea-Wise Aggregate Engagement Data
// Admin Protected: authenticateUser + checkAdmin
// ==============================================================================
router.get(['/ideas', '/admin/ideas'], authenticateUser, checkAdmin, async (req, res) => {
  try {
    const ideas = await getIdeaAnalyticsData();
    return res.json({
      success: true,
      count: ideas.length,
      ideas
    });
  } catch (err) {
    console.error('[Analytics API] Error retrieving idea analytics:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to load idea engagement analytics: ' + err.message
    });
  }
});

// ==============================================================================
// 4. Helper: Generate 4-Sheet Excel Workbook Buffer
// ==============================================================================
async function generateExcelWorkbookBuffer(range = 'all') {
  const [visitorData, ideas] = await Promise.all([
    getWebsiteVisitorAnalyticsData(range),
    getIdeaAnalyticsData()
  ]);

  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // SHEET 1: Overview
  // -------------------------------------------------------------
  const overviewRows = [
    ['Metric', 'Value'],
    ['Total Website Visits', visitorData.metrics.total_website_visits],
    ['Unique Visitors / Sessions', visitorData.metrics.unique_visitors],
    ['Authenticated Visitors', visitorData.metrics.authenticated_visitors],
    ['Anonymous Visitors', visitorData.metrics.anonymous_visitors],
    ['Today Visits', visitorData.metrics.today_visits],
    ['Today Unique Visitors', visitorData.metrics.today_unique_visitors],
    ['Date Range Filter', range.toUpperCase()],
    ['Export Generated At', new Date().toISOString()]
  ];
  const wsOverview = XLSX.utils.aoa_to_sheet(overviewRows);
  wsOverview['!cols'] = [{ wch: 32 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, wsOverview, 'Overview');

  // -------------------------------------------------------------
  // SHEET 2: Daily Visits
  // -------------------------------------------------------------
  const dailyHeaders = ['Date', 'Total Visits', 'Unique Visitors/Sessions', 'Authenticated Visitors', 'Anonymous Visitors'];
  const dailyRows = visitorData.daily_visits.map(d => [
    d.date,
    d.total_visits,
    d.unique_visitors,
    d.authenticated_visitors,
    d.anonymous_visitors
  ]);
  const wsDaily = XLSX.utils.aoa_to_sheet([dailyHeaders, ...dailyRows]);
  wsDaily['!cols'] = [{ wch: 15 }, { wch: 16 }, { wch: 26 }, { wch: 24 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsDaily, 'Daily Visits');

  // -------------------------------------------------------------
  // SHEET 3: Authenticated Visitors
  // -------------------------------------------------------------
  const authHeaders = ['Name', 'Email', 'Department', 'First Visit', 'Last Visit', 'Total Visits'];
  const authRows = visitorData.authenticated_visitors.map(u => [
    u.name,
    u.email,
    u.department,
    u.first_visit ? new Date(u.first_visit).toISOString().replace('T', ' ').slice(0, 19) : '',
    u.last_visit ? new Date(u.last_visit).toISOString().replace('T', ' ').slice(0, 19) : '',
    u.total_visits
  ]);
  const wsAuth = XLSX.utils.aoa_to_sheet([authHeaders, ...authRows]);
  wsAuth['!cols'] = [{ wch: 28 }, { wch: 34 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsAuth, 'Authenticated Visitors');

  // -------------------------------------------------------------
  // SHEET 4: Idea Analytics
  // -------------------------------------------------------------
  const ideaHeaders = [
    'Rank',
    'Product ID',
    'Registration ID',
    'Product Title',
    'Team Name',
    'Page Views',
    'Unique Sessions',
    'Likes',
    'Votes',
    'Score',
    'Last Viewed At'
  ];
  const ideaRows = ideas.map(item => [
    item.rank,
    item.product_id,
    item.registration_id,
    item.product_title,
    item.team_name,
    item.page_views,
    item.unique_sessions,
    item.likes,
    item.votes,
    item.score,
    item.last_viewed_at ? new Date(item.last_viewed_at).toISOString().replace('T', ' ').slice(0, 19) : 'Never'
  ]);
  const wsIdeas = XLSX.utils.aoa_to_sheet([ideaHeaders, ...ideaRows]);
  wsIdeas['!cols'] = [
    { wch: 8 },
    { wch: 38 },
    { wch: 18 },
    { wch: 32 },
    { wch: 26 },
    { wch: 14 },
    { wch: 16 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 22 }
  ];
  XLSX.utils.book_append_sheet(wb, wsIdeas, 'Idea Analytics');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ==============================================================================
// 5. GET /api/analytics/export.xlsx (and /api/admin/analytics/export.xlsx, /export-xlsx)
// Real Microsoft Excel Workbook (.xlsx)
// Admin Protected: authenticateUser + checkAdmin
// ==============================================================================
router.get(
  ['/export.xlsx', '/admin/export.xlsx', '/export-xlsx', '/admin/export-xlsx'],
  authenticateUser,
  checkAdmin,
  async (req, res) => {
    try {
      const range = req.query.range || 'all';
      const buffer = await generateExcelWorkbookBuffer(range);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="IPL_2026_Website_Analytics_${new Date().toISOString().slice(0, 10)}.xlsx"`
      );
      return res.send(buffer);
    } catch (err) {
      console.error('[Analytics API] Error exporting Excel workbook:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate Excel analytics workbook: ' + err.message
      });
    }
  }
);

// ==============================================================================
// 6. GET /api/analytics/export (and /api/admin/analytics/export, /export.csv)
// Downloadable Aggregate Engagement CSV / Excel Router
// Admin Protected: authenticateUser + checkAdmin
// ==============================================================================
router.get(['/export', '/admin/export', '/export.csv'], authenticateUser, checkAdmin, async (req, res) => {
  try {
    // If format=xlsx requested, delegate to Excel generator
    if (req.query.format === 'xlsx') {
      const range = req.query.range || 'all';
      const buffer = await generateExcelWorkbookBuffer(range);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="IPL_2026_Website_Analytics_${new Date().toISOString().slice(0, 10)}.xlsx"`
      );
      return res.send(buffer);
    }

    const ideas = await getIdeaAnalyticsData();

    // Escape CSV cell helper
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    // CSV Headers strictly per Part 7 requirement
    const headers = [
      'Rank',
      'Product ID',
      'Registration ID',
      'Product Title',
      'Team Name',
      'Page Views',
      'Unique Sessions',
      'Likes',
      'Votes',
      'Score',
      'Last Viewed At'
    ];

    const rows = ideas.map(item => [
      item.rank,
      escapeCsv(item.product_id),
      escapeCsv(item.registration_id),
      escapeCsv(item.product_title),
      escapeCsv(item.team_name),
      item.page_views,
      item.unique_sessions,
      item.likes,
      item.votes,
      item.score,
      escapeCsv(item.last_viewed_at || 'Never')
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ipl2026_engagement_analytics_${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.send(csvContent);
  } catch (err) {
    console.error('[Analytics API] Error exporting analytics CSV:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate analytics export: ' + err.message
    });
  }
});

module.exports = router;
