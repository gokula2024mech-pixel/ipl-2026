// backend/routes/ideaRoutes.js
// Authoritative Public Idea & Product System Backend API
// IPL-2026 Platform
//
// Endpoints:
// - GET  /api/ideas                     : Public discovery list with search, domain, pagination, and sorting
// - GET  /api/ideas/resolve/:identifier : Additive resolution for Product UUID, Team UUID (single/multi), or QR Token
// - GET  /api/ideas/:productId          : Public Idea details with sanitized public-safe member info and stats
// - POST /api/ideas/:productId/like     : Public like submission via record_idea_like RPC (anonymous or authenticated)
// - POST /api/ideas/:productId/visit    : Public visit logging via record_idea_visit RPC (decoupled analytics)
//
// IMPORTANT SAFETY RULES:
// - All like and visit writes are routed strictly through SECURITY DEFINER RPCs (record_idea_like / record_idea_visit).
// - Direct table INSERT into public.idea_likes or public.idea_visits is strictly prohibited.
// - All student contact details (emails, mobile numbers) and private tokens are stripped.
// - Voting remains outside this public router.

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { supabase } = require('../supabaseClient');
const { getVotingControls } = require('./votingRoutes');
const {
  ideaLookupLimiter,
  ideaLikeLimiter,
  ideaVisitLimiter
} = require('../middleware/rateLimiter');

/**
 * Validates whether a string is a valid UUID format (8-4-4-4-12 hex).
 */
function isValidUUID(str) {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

/**
 * Computes a one-way SHA-256 hash of client IP for rate-limiting and abuse deterrence.
 * Raw IP is NEVER exposed or stored in the database.
 */
function getClientIpHash(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : (req.socket.remoteAddress || 'unknown');
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY || 'ipl2026_salt';
  return crypto.createHash('sha256').update(ip + salt).digest('hex');
}

/**
 * Extracts optional authenticated user from Authorization header if present.
 * Uses existing Supabase authentication verification mechanism.
 */
async function getOptionalUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  if (!token) return null;

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * Extracts visitor token from request headers/body or generates a secure random UUID.
 */
function getOrGenerateVisitorToken(req) {
  const headerToken = req.headers['x-visitor-token'];
  const bodyToken = req.body && req.body.visitor_token;
  const candidate = (headerToken || bodyToken || '').trim();

  if (candidate && candidate.length <= 128) {
    return { token: candidate, generated: false };
  }
  return { token: crypto.randomUUID(), generated: true };
}

// Official 10 IPL-2026 Innovation Departments normalization helper
function normalizeDepartment(val) {
  if (!val) return 'Mechanical Engineering';
  const s = val.trim().toLowerCase().replace(/\s+/g, ' ');

  if (s.includes('aiml') || s.includes('machine learning') || s.includes('machine language') || s.includes('ai&ml') || s.includes('ai & ml') || s.includes('ai/ml') || s.includes('ai and ml')) {
    return 'Artificial Intelligence and Machine Learning';
  }
  if (s.includes('aids') || s.includes('data science') || s.includes('ai&ds') || s.includes('ai & ds') || s.includes('ai/ds') || s.includes('ai and ds')) {
    return 'Artificial Intelligence and Data Science';
  }
  if (s.includes('csbs') || s.includes('business system')) {
    return 'Computer Science and Business System';
  }
  if (s.includes('cyber security') || s.includes('cybersecurity') || s.includes('cyber')) {
    return 'Cyber Security';
  }
  if (s.includes('cce') || s.includes('computer and communication') || s.includes('computer & communication')) {
    return 'Computer and Communication Engineering';
  }
  if (s.includes('ece') || s.includes('electronics and communication') || s.includes('electronics & communication') || s.includes('electrical and communication')) {
    return 'Electronics and Communication Engineering';
  }
  if (s.includes('eee') || s.includes('electrical and electronics') || s.includes('electrical and electronic') || s.includes('electrical & electronics') || s.includes('electrical & electronic')) {
    return 'Electrical and Electronics Engineering';
  }
  if (s.includes('cse') || s.includes('computer science') || s.includes('computer scinece') || s.includes('computer and science')) {
    return 'Computer Science and Engineering';
  }
  if (s.includes('information technology') || /\bit\b/.test(s)) {
    return 'Information Technology';
  }
  if (s.includes('mech') || s.includes('mechanical')) {
    return 'Mechanical Engineering';
  }

  return 'Mechanical Engineering';
}

// In-Memory Idea Leaderboard Cache (3-second TTL to withstand burst traffic)
let ideaLeaderboardCache = {
  data: null,
  cachedAt: 0,
  ttlMs: 3000
};

// ==============================================================================
// 1. GET /api/ideas
// Public Idea Discovery & List Endpoint
// ==============================================================================
router.get('/', ideaLookupLimiter, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const search = (req.query.search || '').trim();
    const domain = (req.query.domain || '').trim();
    const sort = (req.query.sort || 'score').toLowerCase();

    // Base query on public.idea_scores view
    let query = supabase
      .from('idea_scores')
      .select('product_id, team_id, product_title, team_name, voting_round, likes_count, votes_count, total_score', { count: 'exact' });

    // Search filter across product title and team name
    if (search) {
      query = query.or(`product_title.ilike.%${search}%,team_name.ilike.%${search}%`);
    }

    // Sorting
    switch (sort) {
      case 'likes':
        query = query.order('likes_count', { ascending: false }).order('product_title', { ascending: true });
        break;
      case 'votes':
        query = query.order('votes_count', { ascending: false }).order('product_title', { ascending: true });
        break;
      case 'recent':
        query = query.order('created_at', { ascending: false });
        break;
      case 'score':
      default:
        query = query.order('total_score', { ascending: false }).order('likes_count', { ascending: false }).order('product_title', { ascending: true });
        break;
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data: scoreRows, count, error: scoreErr } = await query;

    if (scoreErr) {
      console.error('[Idea API] Error querying idea_scores:', scoreErr.message);
      return res.status(500).json({
        success: false,
        error_code: 'DATABASE_ERROR',
        message: 'Failed to retrieve innovation ideas.'
      });
    }

    // Fetch innovation domain & trl_level from public.products for this page slice
    const productIds = (scoreRows || []).map(r => r.product_id);
    let productDetailsMap = new Map();

    if (productIds.length > 0) {
      let prodQuery = supabase
        .from('products')
        .select('id, innovation_domain, trl_level')
        .in('id', productIds);

      if (domain) {
        prodQuery = prodQuery.ilike('innovation_domain', `%${domain}%`);
      }

      const { data: prodData } = await prodQuery;
      productDetailsMap = new Map((prodData || []).map(p => [p.id, p]));
    }

    // If domain filter was applied, filter the page slice to matching domain items
    const ideas = [];
    for (const row of (scoreRows || [])) {
      const pDetail = productDetailsMap.get(row.product_id);
      if (domain && !pDetail) {
        continue; // Excluded by domain filter
      }
      ideas.push({
        product_id: row.product_id,
        team_id: row.team_id,
        team_name: row.team_name,
        product_title: row.product_title,
        innovation_domain: pDetail?.innovation_domain || null,
        trl_level: pDetail?.trl_level || null,
        likes_count: row.likes_count || 0,
        votes_count: row.votes_count || 0,
        total_score: row.total_score || 0
      });
    }

    return res.json({
      success: true,
      page,
      limit,
      total: count || 0,
      total_pages: count ? Math.ceil(count / limit) : 0,
      ideas
    });
  } catch (err) {
    console.error('[Idea API] Unhandled error in GET /api/ideas:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'SERVER_ERROR',
      message: 'An internal error occurred while fetching ideas.'
    });
  }
});

// ==============================================================================
// 2. GET /api/ideas/resolve/:identifier
// Additive Resolution Endpoint: Product UUID, Team UUID (single/multi), or QR Token
// CRITICAL: Must be registered BEFORE GET /:productId to avoid route hijacking.
// ==============================================================================
router.get('/resolve/:identifier', ideaLookupLimiter, async (req, res) => {
  try {
    let rawIdentifier = (req.params.identifier || '').trim();
    if (!rawIdentifier) {
      return res.status(400).json({
        success: false,
        error_code: 'IDENTIFIER_REQUIRED',
        message: 'Identifier parameter is required.'
      });
    }

    // URL unwrapping: if client passed a full URL, extract id or token
    if (rawIdentifier.includes('://') || rawIdentifier.includes('?') || rawIdentifier.includes('#')) {
      const ideaMatch = rawIdentifier.match(/[#?&](?:id|productId)=([a-f0-9-]{36})/i);
      if (ideaMatch && ideaMatch[1]) {
        rawIdentifier = ideaMatch[1];
      } else {
        const tokenMatch = rawIdentifier.match(/[?&#]token=([a-zA-Z0-9_-]+)/i);
        if (tokenMatch && tokenMatch[1]) {
          rawIdentifier = tokenMatch[1];
        }
      }
    }

    // --------------------------------------------------------------------------
    // BRANCH A: Try Product UUID
    // --------------------------------------------------------------------------
    if (isValidUUID(rawIdentifier)) {
      const { data: prod } = await supabase
        .from('products')
        .select(`
          id,
          team_id,
          product_number,
          product_title,
          innovation_domain,
          trl_level,
          status,
          team:teams (
            id,
            team_name
          )
        `)
        .eq('id', rawIdentifier)
        .maybeSingle();

      if (prod && (prod.status === 'active' || !prod.status)) {
        // Fetch current score stats from view
        const { data: scoreRow } = await supabase
          .from('idea_scores')
          .select('likes_count, votes_count, total_score')
          .eq('product_id', prod.id)
          .maybeSingle();

        return res.json({
          success: true,
          resolution_type: 'direct_product',
          product_id: prod.id,
          team_id: prod.team_id,
          team_name: prod.team?.team_name || null,
          product: {
            product_id: prod.id,
            product_number: prod.product_number,
            product_title: prod.product_title,
            innovation_domain: prod.innovation_domain,
            trl_level: prod.trl_level,
            likes_count: scoreRow?.likes_count || 0,
            votes_count: scoreRow?.votes_count || 0,
            total_score: scoreRow?.total_score || 0
          }
        });
      }

      // ------------------------------------------------------------------------
      // BRANCH B: Try Team UUID
      // ------------------------------------------------------------------------
      const { data: team } = await supabase
        .from('teams')
        .select('id, team_name')
        .eq('id', rawIdentifier)
        .maybeSingle();

      if (team) {
        const { data: teamProducts } = await supabase
          .from('products')
          .select('id, product_number, product_title, innovation_domain, trl_level, status')
          .eq('team_id', team.id)
          .or('status.eq.active,status.is.null')
          .order('product_number', { ascending: true });

        if (!teamProducts || teamProducts.length === 0) {
          return res.status(404).json({
            success: false,
            error_code: 'NO_ACTIVE_PRODUCTS',
            message: 'No active innovation ideas found for this team.'
          });
        }

        // Fetch scores for the team's products
        const pids = teamProducts.map(p => p.id);
        const { data: scoreData } = await supabase
          .from('idea_scores')
          .select('product_id, likes_count, votes_count, total_score')
          .in('product_id', pids);

        const scoreMap = new Map((scoreData || []).map(s => [s.product_id, s]));

        const mappedProducts = teamProducts.map(p => {
          const s = scoreMap.get(p.id);
          return {
            product_id: p.id,
            product_number: p.product_number,
            product_title: p.product_title,
            innovation_domain: p.innovation_domain,
            trl_level: p.trl_level,
            likes_count: s?.likes_count || 0,
            votes_count: s?.votes_count || 0,
            total_score: s?.total_score || 0
          };
        });

        // Single-Product Team
        if (mappedProducts.length === 1) {
          return res.json({
            success: true,
            resolution_type: 'team_single',
            team_id: team.id,
            team_name: team.team_name,
            product_id: mappedProducts[0].product_id,
            product: mappedProducts[0]
          });
        }

        // Multi-Product Team (e.g. ChameleX with 2 products)
        return res.json({
          success: true,
          resolution_type: 'team_multi',
          team_id: team.id,
          team_name: team.team_name,
          total_products: mappedProducts.length,
          products: mappedProducts
        });
      }
    }

    // --------------------------------------------------------------------------
    // BRANCH C: Try QR Token Lookup
    // --------------------------------------------------------------------------
    const { data: qrRow } = await supabase
      .from('team_qr_codes')
      .select('id, team_id, product_id, token, qr_token, is_active')
      .or(`token.eq.${rawIdentifier},qr_token.eq.${rawIdentifier}`)
      .maybeSingle();

    if (qrRow) {
      if (!qrRow.is_active) {
        return res.status(403).json({
          success: false,
          error_code: 'QR_INACTIVE',
          message: 'This QR code is currently inactive.'
        });
      }

      // Case C1: Product-specific QR (product_id is populated)
      if (qrRow.product_id) {
        const { data: pData } = await supabase
          .from('products')
          .select(`
            id,
            team_id,
            product_number,
            product_title,
            innovation_domain,
            trl_level,
            team:teams (
              id,
              team_name
            )
          `)
          .eq('id', qrRow.product_id)
          .maybeSingle();

        if (pData) {
          const { data: scoreRow } = await supabase
            .from('idea_scores')
            .select('likes_count, votes_count, total_score')
            .eq('product_id', pData.id)
            .maybeSingle();

          return res.json({
            success: true,
            resolution_type: 'qr_product',
            product_id: pData.id,
            team_id: pData.team_id,
            team_name: pData.team?.team_name || null,
            product: {
              product_id: pData.id,
              product_number: pData.product_number,
              product_title: pData.product_title,
              innovation_domain: pData.innovation_domain,
              trl_level: pData.trl_level,
              likes_count: scoreRow?.likes_count || 0,
              votes_count: scoreRow?.votes_count || 0,
              total_score: scoreRow?.total_score || 0
            }
          });
        }
      }

      // Case C2: Team-based QR (product_id is NULL)
      // Look up team and all active products
      const { data: teamData } = await supabase
        .from('teams')
        .select('id, team_name')
        .eq('id', qrRow.team_id)
        .maybeSingle();

      const { data: teamProducts } = await supabase
        .from('products')
        .select('id, product_number, product_title, innovation_domain, trl_level, status')
        .eq('team_id', qrRow.team_id)
        .or('status.eq.active,status.is.null')
        .order('product_number', { ascending: true });

      if (!teamProducts || teamProducts.length === 0) {
        return res.status(404).json({
          success: false,
          error_code: 'NO_ACTIVE_PRODUCTS',
          message: 'No active innovation ideas found for this QR code.'
        });
      }

      const pids = teamProducts.map(p => p.id);
      const { data: scoreData } = await supabase
        .from('idea_scores')
        .select('product_id, likes_count, votes_count, total_score')
        .in('product_id', pids);

      const scoreMap = new Map((scoreData || []).map(s => [s.product_id, s]));
      const mappedProducts = teamProducts.map(p => {
        const s = scoreMap.get(p.id);
        return {
          product_id: p.id,
          product_number: p.product_number,
          product_title: p.product_title,
          innovation_domain: p.innovation_domain,
          trl_level: p.trl_level,
          likes_count: s?.likes_count || 0,
          votes_count: s?.votes_count || 0,
          total_score: s?.total_score || 0
        };
      });

      if (mappedProducts.length === 1) {
        return res.json({
          success: true,
          resolution_type: 'qr_team_single',
          team_id: qrRow.team_id,
          team_name: teamData?.team_name || null,
          product_id: mappedProducts[0].product_id,
          product: mappedProducts[0]
        });
      }

      // Multi-product team QR
      return res.json({
        success: true,
        resolution_type: 'qr_team_multi',
        team_id: qrRow.team_id,
        team_name: teamData?.team_name || null,
        total_products: mappedProducts.length,
        products: mappedProducts
      });
    }

    // --------------------------------------------------------------------------
    // BRANCH D: Try Registration ID Lookup
    // --------------------------------------------------------------------------
    const { data: regProds } = await supabase
      .from('products')
      .select(`
        id,
        team_id,
        legacy_registration_id,
        product_number,
        product_title,
        innovation_domain,
        trl_level,
        status,
        team:teams (
          id,
          team_name
        )
      `)
      .ilike('legacy_registration_id', rawIdentifier)
      .or('status.eq.active,status.is.null')
      .order('product_number', { ascending: true });

    if (regProds && regProds.length > 0) {
      const pids = regProds.map(p => p.id);
      const { data: scoreData } = await supabase
        .from('idea_scores')
        .select('product_id, likes_count, votes_count, total_score')
        .in('product_id', pids);

      const scoreMap = new Map((scoreData || []).map(s => [s.product_id, s]));
      const mappedProducts = regProds.map(p => {
        const s = scoreMap.get(p.id);
        return {
          product_id: p.id,
          product_number: p.product_number,
          product_title: p.product_title,
          innovation_domain: p.innovation_domain,
          trl_level: p.trl_level,
          likes_count: s?.likes_count || 0,
          votes_count: s?.votes_count || 0,
          total_score: s?.total_score || 0
        };
      });

      if (mappedProducts.length === 1) {
        return res.json({
          success: true,
          resolution_type: 'team_single',
          team_id: regProds[0].team_id,
          team_name: regProds[0].team?.team_name || null,
          product_id: mappedProducts[0].product_id,
          product: mappedProducts[0]
        });
      }

      return res.json({
        success: true,
        resolution_type: 'team_multi',
        team_id: regProds[0].team_id,
        team_name: regProds[0].team?.team_name || null,
        total_products: mappedProducts.length,
        products: mappedProducts
      });
    }

    // --------------------------------------------------------------------------
    // Not found
    // --------------------------------------------------------------------------
    return res.status(404).json({
      success: false,
      error_code: 'IDEA_NOT_FOUND',
      message: 'No innovation idea could be resolved from the provided identifier.'
    });
  } catch (err) {
    console.error('[Idea API] Unhandled error in GET /api/ideas/resolve:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'SERVER_ERROR',
      message: 'An internal error occurred during idea resolution.'
    });
  }
});

// ==============================================================================
// 2.5. GET /api/ideas/leaderboard
// Public Idea Leaderboard & Live Scoring Endpoint
// ==============================================================================
router.get('/leaderboard', ideaLookupLimiter, async (req, res) => {
  try {
    const now = Date.now();

    // Serve from memory cache if fresh (< 3s)
    if (ideaLeaderboardCache.data && (now - ideaLeaderboardCache.cachedAt) < ideaLeaderboardCache.ttlMs) {
      return res.status(200).json({
        success: true,
        cached: true,
        ...ideaLeaderboardCache.data
      });
    }

    // Query idea_scores view, products, and registrations in parallel
    const [
      { data: scoreRows, error: scoreErr },
      { data: products, error: prodErr },
      { data: registrations, error: regErr }
    ] = await Promise.all([
      supabase.from('idea_scores').select('product_id, team_id, product_title, team_name, likes_count, votes_count, total_score, last_vote_at, created_at'),
      supabase.from('products').select('id, team_id, product_title, legacy_registration_id'),
      supabase.from('registrations').select('registration_id, team_name')
    ]);

    if (scoreErr) {
      console.error('[Idea Leaderboard] Error querying idea_scores:', scoreErr.message);
      return res.status(500).json({
        success: false,
        error_code: 'DATABASE_ERROR',
        message: 'Failed to retrieve idea leaderboard.'
      });
    }

    const prodMap = new Map();
    (products || []).forEach(p => prodMap.set(p.id, p));

    const regMapById = new Map();
    const regMapByName = new Map();
    (registrations || []).forEach(r => {
      if (r.registration_id) regMapById.set(r.registration_id.trim().toUpperCase(), r);
      if (r.team_name) regMapByName.set(r.team_name.trim().toLowerCase(), r);
    });

    let totalLikes = 0;
    let totalVotes = 0;

    const rawList = (scoreRows || []).map(row => {
      const p = prodMap.get(row.product_id);
      const reg = (p?.legacy_registration_id ? regMapById.get(p.legacy_registration_id.trim().toUpperCase()) : null)
        || (row.team_name ? regMapByName.get(row.team_name.trim().toLowerCase()) : null);

      const likes = Math.max(0, parseInt(row.likes_count, 10) || 0);
      const votes = Math.max(0, parseInt(row.votes_count, 10) || 0);
      // Authoritative formula: Likes + (Votes * 2). Visits MUST NOT contribute.
      const score = Math.max(0, row.total_score !== undefined && row.total_score !== null ? parseInt(row.total_score, 10) : (likes + votes * 2));

      totalLikes += likes;
      totalVotes += votes;

      const regId = reg?.registration_id || p?.legacy_registration_id || null;

      return {
        product_id: row.product_id,
        productId: row.product_id,
        id: row.product_id,
        team_id: row.team_id,
        teamId: row.team_id,
        team_name: row.team_name || 'Innovation Team',
        teamName: row.team_name || 'Innovation Team',
        product_title: row.product_title || 'Innovation Project',
        productTitle: row.product_title || 'Innovation Project',
        registration_id: regId,
        registrationId: regId,
        likes_count: likes,
        likesCount: likes,
        votes_count: votes,
        votesCount: votes,
        voteCount: votes,
        total_score: score,
        totalScore: score,
        score: score,
        last_vote_at: row.last_vote_at || null
      };
    });

    // Deterministic tie-breaker: total_score DESC, likes_count DESC, votes_count DESC, product_id ASC
    rawList.sort((a, b) => {
      if (b.total_score !== a.total_score) return b.total_score - a.total_score;
      if (b.likes_count !== a.likes_count) return b.likes_count - a.likes_count;
      if (b.votes_count !== a.votes_count) return b.votes_count - a.votes_count;
      return a.product_id.localeCompare(b.product_id);
    });

    // Assign rank 1, 2, 3...
    const rankedLeaderboard = rawList.map((item, idx) => ({
      ...item,
      rank: idx + 1
    }));

    const responsePayload = {
      total_ideas: rankedLeaderboard.length,
      total_likes: totalLikes,
      total_votes: totalVotes,
      leaderboard: rankedLeaderboard
    };

    // Update in-memory cache
    ideaLeaderboardCache.data = responsePayload;
    ideaLeaderboardCache.cachedAt = now;

    return res.status(200).json({
      success: true,
      cached: false,
      ...responsePayload
    });
  } catch (err) {
    console.error('[Idea Leaderboard] Unhandled error in GET /api/ideas/leaderboard:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'SERVER_ERROR',
      message: 'An internal error occurred retrieving idea leaderboard.'
    });
  }
});

// ==============================================================================
// 3. GET /api/ideas/:productId
// Public Idea Details Endpoint
// ==============================================================================
router.get('/:productId', ideaLookupLimiter, async (req, res) => {
  try {
    const { productId } = req.params;

    if (!isValidUUID(productId)) {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_PRODUCT_ID',
        message: 'Product ID must be a valid UUID.'
      });
    }

    // 1. Fetch product and team
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select(`
        id,
        team_id,
        legacy_registration_id,
        product_number,
        product_title,
        innovation_domain,
        problem_area,
        proposed_solution,
        expected_impact,
        sdg_goals,
        trl_level,
        status,
        created_at,
        team:teams (
          id,
          team_name
        )
      `)
      .eq('id', productId)
      .maybeSingle();

    if (prodErr) {
      console.error('[Idea API] Error fetching product details:', prodErr.message);
      return res.status(500).json({
        success: false,
        error_code: 'DATABASE_ERROR',
        message: 'Failed to load innovation idea details.'
      });
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        error_code: 'PRODUCT_NOT_FOUND',
        message: 'The requested innovation idea does not exist.'
      });
    }

    if (product.status && product.status !== 'active') {
      return res.status(404).json({
        success: false,
        error_code: 'PRODUCT_INACTIVE',
        message: 'This innovation idea is currently inactive.'
      });
    }

    // 2. Fetch public-safe team members (STRICTLY omitting email and mobile)
    const { data: rawMembers } = await supabase
      .from('product_members')
      .select('id, member_name, role, is_team_leader')
      .eq('product_id', productId)
      .order('is_team_leader', { ascending: false })
      .order('member_name', { ascending: true });

    const members = (rawMembers || []).map(m => ({
      id: m.id,
      member_name: m.member_name,
      role: m.role || 'Member',
      is_team_leader: Boolean(m.is_team_leader)
    }));

    // 3. Fetch scores from public.idea_scores view
    const { data: scoreRow } = await supabase
      .from('idea_scores')
      .select('likes_count, votes_count, total_score')
      .eq('product_id', productId)
      .maybeSingle();

    // 4. Fetch aggregate visit count from public.idea_visits (COUNT only)
    const { count: visitsCount } = await supabase
      .from('idea_visits')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', productId);

    // 5. Optional viewer state (has_liked check)
    let hasLiked = false;
    const optionalUser = await getOptionalUser(req);
    const visitorToken = (req.headers['x-visitor-token'] || '').trim();

    if (optionalUser && optionalUser.id) {
      const { data: userLike } = await supabase
        .from('idea_likes')
        .select('id')
        .eq('product_id', productId)
        .eq('voter_user_id', optionalUser.id)
        .maybeSingle();
      if (userLike) hasLiked = true;
    } else if (visitorToken) {
      const { data: anonLike } = await supabase
        .from('idea_likes')
        .select('id')
        .eq('product_id', productId)
        .eq('visitor_token', visitorToken)
        .is('voter_user_id', null)
        .maybeSingle();
      if (anonLike) hasLiked = true;
    }

    // Check if authenticated user has already voted for this product (Phase 3: single vote per idea)
    let hasVoted = false;
    if (optionalUser) {
      try {
        const { data: userVote } = await supabase
          .from('product_votes')
          .select('id')
          .eq('product_id', productId)
          .eq('voter_user_id', optionalUser.id)
          .maybeSingle();
        if (userVote) hasVoted = true;
      } catch (e) {}

      if (!hasVoted) {
        try {
          const { data: legacyVote } = await supabase
            .from('votes')
            .select('id')
            .eq('product_id', productId)
            .eq('voter_user_id', optionalUser.id)
            .maybeSingle();
          if (legacyVote) hasVoted = true;
        } catch (e) {}
      }
    }

    // Resolve legacy/official registration ID
    let regId = product.legacy_registration_id || null;
    if (!regId && product.team?.team_name) {
      const { data: regRow } = await supabase
        .from('registrations')
        .select('registration_id')
        .ilike('team_name', product.team.team_name.trim())
        .maybeSingle();
      if (regRow?.registration_id) {
        regId = regRow.registration_id;
      }
    }

    return res.json({
      success: true,
      idea: {
        product_id: product.id,
        team_id: product.team_id,
        registration_id: regId,
        team_name: product.team?.team_name || 'Innovation Team',
        product_number: product.product_number,
        product_title: product.product_title,
        innovation_domain: product.innovation_domain,
        problem_area: product.problem_area,
        proposed_solution: product.proposed_solution,
        expected_impact: product.expected_impact,
        sdg_goals: product.sdg_goals || [],
        trl_level: product.trl_level,
        members,
        stats: {
          likes_count: scoreRow?.likes_count || 0,
          votes_count: scoreRow?.votes_count || 0,
          total_score: scoreRow?.total_score || 0,
          visits_count: visitsCount || 0
        },
        viewer_state: {
          has_liked: hasLiked,
          has_voted: hasVoted
        }
      }
    });
  } catch (err) {
    console.error('[Idea API] Unhandled error in GET /api/ideas/:productId:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'SERVER_ERROR',
      message: 'An internal error occurred while fetching idea details.'
    });
  }
});

// ==============================================================================
// 4. POST /api/ideas/:productId/like
// Public Like Submission Endpoint (Authenticated or Anonymous)
// Routed strictly through SECURITY DEFINER RPC public.record_idea_like
// ==============================================================================
router.post('/:productId/like', ideaLikeLimiter, async (req, res) => {
  try {
    const { productId } = req.params;

    if (!isValidUUID(productId)) {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_PRODUCT_ID',
        message: 'Product ID must be a valid UUID.'
      });
    }

    // Authoritative check: verify if Public Likes are currently enabled (fail-closed)
    const controls = await getVotingControls();
    if (!controls || typeof controls.is_likes_active !== 'boolean') {
      console.warn('[Idea API] Likes control state unavailable or unconfirmed. Failing closed.');
      return res.status(503).json({
        success: false,
        error_code: 'CONTROLS_UNAVAILABLE',
        message: 'Likes service is temporarily unavailable. Please try again shortly.'
      });
    }

    if (!controls.is_likes_active) {
      return res.status(403).json({
        success: false,
        error_code: 'LIKES_CLOSED',
        message: 'Likes are currently closed.'
      });
    }

    // Determine identity: authenticated user takes precedence over visitor token
    const optionalUser = await getOptionalUser(req);
    const { token: visitorToken } = getOrGenerateVisitorToken(req);
    const ipHash = getClientIpHash(req);

    // Call the controlled SECURITY DEFINER RPC
    const { data, error } = await supabase.rpc('record_idea_like', {
      p_product_id: productId,
      p_visitor_token: optionalUser ? (visitorToken || null) : visitorToken,
      p_ip_hash: ipHash,
      p_voter_user_id: optionalUser ? optionalUser.id : null
    });

    if (error) {
      console.error('[Idea API] Error calling record_idea_like RPC:', error.message);
      return res.status(500).json({
        success: false,
        error_code: 'RPC_ERROR',
        message: 'Failed to record like.'
      });
    }

    // Success response
    if (data && data.success) {
      return res.json({
        success: true,
        already_liked: false,
        product_id: productId,
        likes_count: data.likes_count,
        visitor_token: visitorToken,
        message: data.message || 'Idea liked successfully!'
      });
    }

    // Handled duplicate like
    if (data && data.error_code === 'ALREADY_LIKED') {
      return res.json({
        success: true,
        already_liked: true,
        product_id: productId,
        likes_count: data.likes_count,
        visitor_token: visitorToken,
        message: data.message || 'You have already liked this idea.'
      });
    }

    // Rate limited by RPC hook
    if (data && data.error_code === 'RATE_LIMITED') {
      return res.status(429).json({
        success: false,
        error_code: 'RATE_LIMITED',
        message: data.message || 'Too many like requests. Please try again shortly.'
      });
    }

    // Product not found
    if (data && data.error_code === 'PRODUCT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error_code: 'PRODUCT_NOT_FOUND',
        message: data.message || 'The requested innovation idea does not exist.'
      });
    }

    // Fallback response
    return res.status(400).json({
      success: false,
      error_code: data?.error_code || 'LIKE_FAILED',
      message: data?.message || 'Unable to register like.'
    });
  } catch (err) {
    console.error('[Idea API] Unhandled error in POST /api/ideas/:productId/like:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'SERVER_ERROR',
      message: 'An internal error occurred while submitting like.'
    });
  }
});

// ==============================================================================
// 5. POST /api/ideas/:productId/visit
// Public Idea Visit Logging Endpoint (Decoupled Analytics)
// Routed strictly through SECURITY DEFINER RPC public.record_idea_visit
// ==============================================================================
router.post('/:productId/visit', ideaVisitLimiter, async (req, res) => {
  try {
    const { productId } = req.params;

    if (!isValidUUID(productId)) {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_PRODUCT_ID',
        message: 'Product ID must be a valid UUID.'
      });
    }

    const { token: visitorToken } = getOrGenerateVisitorToken(req);
    const sessionCandidate = (req.headers['x-session-token'] || (req.body && req.body.session_token) || visitorToken || '').trim();
    // Privacy: Store SHA-256 hash of the anonymous session token as the identifier
    const sessionHash = sessionCandidate
      ? crypto.createHash('sha256').update(sessionCandidate).digest('hex')
      : null;
    const ipHash = getClientIpHash(req);

    const { data, error } = await supabase.rpc('record_idea_visit', {
      p_product_id: productId,
      p_visitor_token: sessionHash,
      p_ip_hash: ipHash,
      p_user_agent: null, // As requested: minimize stored data
      p_user_id: null     // As requested: aggregate-focused, zero user_id tracking
    });

    if (error) {
      console.error('[Idea API] Error calling record_idea_visit RPC:', error.message);
      return res.status(500).json({
        success: false,
        error_code: 'RPC_ERROR',
        message: 'Failed to record visit.'
      });
    }

    if (data && data.error_code === 'PRODUCT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error_code: 'PRODUCT_NOT_FOUND',
        message: data.message || 'Innovation idea not found.'
      });
    }

    return res.json({
      success: true,
      product_id: productId,
      message: 'Visit recorded successfully'
    });
  } catch (err) {
    console.error('[Idea API] Unhandled error in POST /api/ideas/:productId/visit:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'SERVER_ERROR',
      message: 'An internal error occurred while recording visit.'
    });
  }
});

module.exports = router;
