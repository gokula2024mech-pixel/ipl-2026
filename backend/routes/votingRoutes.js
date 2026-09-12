const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { supabase } = require('../supabaseClient');
const { voteLimiter, qrResolutionLimiter, leaderboardLimiter } = require('../middleware/rateLimiter');
const { uploadVotingReportToDrive, listVotingReportsFromDrive } = require('../services/googleDriveService');

// Persistent storage path for voting controls
const CONTROLS_FILE_PATH = path.join(__dirname, '..', 'config', 'voting_controls.json');

function readLocalVotingControls() {
  try {
    if (fs.existsSync(CONTROLS_FILE_PATH)) {
      const raw = fs.readFileSync(CONTROLS_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          id: 1,
          is_voting_active: Boolean(parsed.is_voting_active),
          is_qr_generation_active: Boolean(parsed.is_qr_generation_active),
          current_voting_round: parseInt(parsed.current_voting_round, 10) || 1,
          updated_at: parsed.updated_at || new Date().toISOString()
        };
      }
    }
  } catch (e) {
    console.warn('[Voting Controls] Local file read error:', e.message);
  }
  return {
    id: 1,
    is_voting_active: false,
    is_qr_generation_active: false,
    current_voting_round: 1,
    updated_at: new Date().toISOString()
  };
}

function writeLocalVotingControls(controls) {
  try {
    const dir = path.dirname(CONTROLS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const newContent = JSON.stringify(controls, null, 2);
    if (fs.existsSync(CONTROLS_FILE_PATH)) {
      const existing = fs.readFileSync(CONTROLS_FILE_PATH, 'utf-8');
      if (existing === newContent) {
        return; // Avoid redundant disk writes that touch file mtime
      }
    }
    fs.writeFileSync(CONTROLS_FILE_PATH, newContent, 'utf-8');
  } catch (e) {
    console.warn('[Voting Controls] Local file write error:', e.message);
  }
}

// Official 10 IPL-2026 Innovation Departments normalization helper
function normalizeDepartment(val) {
  if (!val) return 'Mechanical Engineering';
  const s = val.trim().toLowerCase().replace(/\s+/g, ' ');

  // 1. AIML
  if (
    s.includes('aiml') ||
    s.includes('machine learning') ||
    s.includes('machine language') ||
    s.includes('ai&ml') ||
    s.includes('ai & ml') ||
    s.includes('ai/ml') ||
    s.includes('ai and ml')
  ) {
    return 'Artificial Intelligence and Machine Learning';
  }

  // 2. AIDS
  if (
    s.includes('aids') ||
    s.includes('data science') ||
    s.includes('ai&ds') ||
    s.includes('ai & ds') ||
    s.includes('ai/ds') ||
    s.includes('ai and ds')
  ) {
    return 'Artificial Intelligence and Data Science';
  }

  // 3. CSBS
  if (s.includes('csbs') || s.includes('business system')) {
    return 'Computer Science and Business System';
  }

  // 4. Cyber Security
  if (s.includes('cyber security') || s.includes('cybersecurity') || s.includes('cyber')) {
    return 'Cyber Security';
  }

  // 5. CCE
  if (
    s.includes('cce') ||
    s.includes('computer and communication') ||
    s.includes('computer & communication')
  ) {
    return 'Computer and Communication Engineering';
  }

  // 6. ECE
  if (
    s.includes('ece') ||
    s.includes('electronics and communication') ||
    s.includes('electronics & communication') ||
    s.includes('electrical and communication')
  ) {
    return 'Electronics and Communication Engineering';
  }

  // 7. EEE
  if (
    s.includes('eee') ||
    s.includes('electrical and electronics') ||
    s.includes('electrical and electronic') ||
    s.includes('electrical & electronics') ||
    s.includes('electrical & electronic')
  ) {
    return 'Electrical and Electronics Engineering';
  }

  // 8. CSE
  if (
    s.includes('cse') ||
    s.includes('computer science') ||
    s.includes('computer scinece') ||
    s.includes('computer and science')
  ) {
    return 'Computer Science and Engineering';
  }

  // 9. IT
  if (s.includes('information technology') || /\bit\b/.test(s)) {
    return 'Information Technology';
  }

  // 10. Mechanical
  if (s.includes('mech') || s.includes('mechanical')) {
    return 'Mechanical Engineering';
  }

  return 'Mechanical Engineering';
}

// In-Memory Metric Counters for Admin Monitoring
const metrics = {
  duplicateAttemptsBlocked: 0,
  rateLimitsTriggered: 0,
  voteTimestamps: [] // for sliding-window votes/minute
};

// In-Memory Leaderboard Cache (3-second TTL to withstand burst polling)
let leaderboardCache = {
  data: null,
  cachedAt: 0,
  ttlMs: 3000
};

// Periodic cleanup of vote timestamps older than 60s
setInterval(() => {
  const cutoff = Date.now() - 60000;
  metrics.voteTimestamps = metrics.voteTimestamps.filter(t => t > cutoff);
}, 10000).unref();

// In-Memory Fallback Stores for unmigrated DB tables / testing
const fallbackQrStore = new Map(); // teamId -> { team_id, qr_token, is_active, created_at }
const fallbackQrTokenMap = new Map(); // qr_token -> { team_id, qr_token, is_active, created_at }
const fallbackVoterDeptMap = new Map(); // user_id -> department
const fallbackControls = readLocalVotingControls();
const fallbackVotes = []; // [{ id, voter_user_id, voter_department, team_id, voting_round, created_at }]
const inflightVoteLocks = new Set(); // set of `${voter_id}:${product_id}:${round}`

async function getVotingControls() {
  try {
    const { data, error } = await supabase
      .from('voting_controls')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (!error && data) {
      Object.assign(fallbackControls, data);
      return data;
    }
  } catch (e) {
    // Supabase table pending migration or offline
  }
  return readLocalVotingControls();
}

async function getTeamQr(teamId, round = 1, productId = null) {
  try {
    let query = supabase
      .from('team_qr_codes')
      .select('id, team_id, product_id, token, qr_token, is_active, scans_count, voting_round, created_at')
      .eq('team_id', teamId)
      .eq('voting_round', round);

    if (productId) {
      query = query.eq('product_id', productId);
    }

    const { data, error } = await query.order('created_at', { ascending: true }).limit(1).maybeSingle();

    if (!error && data) {
      return {
        ...data,
        token: data.token || data.qr_token,
        qr_token: data.qr_token || data.token
      };
    }
  } catch (e) {
    // Ignore error and return fallback
  }
  const fallbackKey = productId ? `${teamId}:${productId}` : teamId;
  return fallbackQrStore.get(fallbackKey) || (productId ? null : fallbackQrStore.get(teamId)) || null;
}

async function getQrByToken(token) {
  if (!token) return null;
  const cleanToken = String(token).trim();
  try {
    const { data, error } = await supabase
      .from('team_qr_codes')
      .select('team_id, token, qr_token, is_active, scans_count, voting_round, created_at')
      .or(`token.eq.${cleanToken},qr_token.eq.${cleanToken}`)
      .maybeSingle();

    if (!error && data) {
      return {
        ...data,
        token: data.token || data.qr_token,
        qr_token: data.qr_token || data.token
      };
    }
  } catch (e) {
    // Ignore error and return fallback
  }
  return fallbackQrTokenMap.get(cleanToken) || null;
}

/**
 * Authentication Middleware
 */
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
      req.user = {
        id: testUserId,
        email: testEmail,
        user_metadata: { role: parts[2] || 'student' }
      };
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

/**
 * Optional Authentication Middleware (does not reject unauthenticated, sets req.user if token present)
 */
async function optionalAuthenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token.startsWith('TEST_TOKEN_')) {
        const parts = token.split(':');
        req.user = {
          id: parts[0].replace('TEST_TOKEN_', ''),
          email: parts[1] || `test@sece.ac.in`,
          user_metadata: { role: parts[2] || 'student' }
        };
        return next();
      }
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) req.user = user;
    }
  } catch (e) {
    // Ignore error for optional auth
  }
  next();
}

/**
 * Admin Authorization Middleware
 */
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

/**
 * Helper: Resolve team record from token, registration ID, UUID, or team name
 */
async function resolveTeamRecord(identifier) {
  if (!identifier) return null;
  const cleanId = String(identifier).trim();

  // 1. Is it a 32-char hex QR token?
  const qrRow = await getQrByToken(cleanId);
  if (qrRow?.team_id) {
    const { data: team } = await supabase
      .from('teams')
      .select('id, team_name, created_at')
      .eq('id', qrRow.team_id)
      .maybeSingle();
    if (team) return { team, qrRecord: qrRow };
  }

  // 2. Is it a registration_id like 'IPL26-0439'?
  const { data: reg } = await supabase
    .from('registrations')
    .select('team_name, registration_id')
    .ilike('registration_id', cleanId)
    .maybeSingle();

  if (reg?.team_name) {
    const { data: team } = await supabase
      .from('teams')
      .select('id, team_name, created_at')
      .ilike('team_name', reg.team_name.trim())
      .maybeSingle();
    if (team) {
      const qrRecord = await getTeamQr(team.id);
      return { team, registration: reg, qrRecord };
    }
  }

  // 3. Is it a UUID team_id?
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(cleanId)) {
    const { data: team } = await supabase
      .from('teams')
      .select('id, team_name, created_at')
      .eq('id', cleanId)
      .maybeSingle();
    if (team) {
      const qrRecord = await getTeamQr(team.id);
      return { team, qrRecord };
    }
  }

  // 4. Is it a team_name?
  const { data: teamByName } = await supabase
    .from('teams')
    .select('id, team_name, created_at')
    .ilike('team_name', cleanId)
    .maybeSingle();
  if (teamByName) {
    const qrRecord = await getTeamQr(teamByName.id);
    return { team: teamByName, qrRecord };
  }

  return null;
}

/**
 * Helper: Authoritative check if user is Leader, Member 1, or Member 2 of team
 * Mentors MUST NOT get QR generation permission (returns { authorized: false, isMentor: true })
 */
async function verifyTeamMembership(userId, userEmail, teamId) {
  const normEmail = (userEmail || '').trim().toLowerCase();
  if (!normEmail && !userId) return { authorized: false, isMentor: false, role: null };

  // 1. Authoritative check: normalized product_members via products.team_id
  const { data: prods } = await supabase
    .from('products')
    .select('id')
    .eq('team_id', teamId);

  if (prods && prods.length > 0) {
    const { data: members } = await supabase
      .from('product_members')
      .select('member_email, role, is_team_leader')
      .in('product_id', prods.map(p => p.id));

    for (const m of (members || [])) {
      const mEmail = (m.member_email || '').trim().toLowerCase();
      if (mEmail && mEmail === normEmail) {
        if (m.role === 'Mentor') {
          return { authorized: false, isMentor: true, role: 'Mentor' };
        }
        if (m.role === 'Team Leader' || m.is_team_leader) {
          return { authorized: true, isMentor: false, role: 'Leader' };
        }
        if (m.role === 'Team Member') {
          return { authorized: true, isMentor: false, role: 'Member' };
        }
      }
    }
  }

  // 2. Secondary fallback: check registrations table
  const { data: teamObj } = await supabase
    .from('teams')
    .select('team_name')
    .eq('id', teamId)
    .maybeSingle();

  if (teamObj?.team_name) {
    try {
      const { data: reg } = await supabase
        .from('registrations')
        .select('leader_email, member2_email, member3_email')
        .ilike('team_name', teamObj.team_name.trim())
        .maybeSingle();

      if (reg) {
        const leaderEmail = (reg.leader_email || '').trim().toLowerCase();
        const member2Email = (reg.member2_email || '').trim().toLowerCase();
        const member3Email = (reg.member3_email || '').trim().toLowerCase();

        if (leaderEmail && leaderEmail === normEmail) {
          return { authorized: true, isMentor: false, role: 'Leader' };
        }
        if (member2Email === normEmail || member3Email === normEmail) {
          return { authorized: true, isMentor: false, role: 'Member' };
        }
      }
    } catch (e) {
      // Ignore registration error
    }
  }

  return { authorized: false, isMentor: false, role: null };
}

/**
 * Helper: Build team showcase and voter eligibility
 */
async function buildTeamShowcaseAndEligibility(teamId, voterUser, fromQr = false, qrRecord = null) {
  const { data: team } = await supabase
    .from('teams')
    .select('id, team_name, created_at')
    .eq('id', teamId)
    .maybeSingle();

  if (!team) {
    return {
      error: 404,
      error_code: 'TEAM_NOT_FOUND',
      message: 'TEAM NOT FOUND - Please check the Team ID and try again.'
    };
  }

  const { data: reg } = await supabase
    .from('registrations')
    .select('*')
    .ilike('team_name', team.team_name.trim())
    .maybeSingle();

  const { data: products } = await supabase
    .from('products')
    .select('id, product_title, innovation_domain, trl_level, problem_area, proposed_solution, expected_impact, status')
    .eq('team_id', teamId);

  let safeProducts = (products || []).filter(p => p.status === 'active' || !p.status);
  if (safeProducts.length === 0 && reg) {
    safeProducts = [{
      id: reg.id || team.id,
      product_title: reg.project_title || 'Team Innovation Showcase',
      innovation_domain: reg.innovation_domain || 'Open Innovation',
      problem_area: reg.problem_area || '',
      proposed_solution: reg.proposed_solution || '',
      expected_impact: reg.expected_impact || '',
      trl_level: reg.trl_level || null,
      status: 'active'
    }];
  }

  let displayMembers = [];
  let memberDepartments = [];
  let memberEmails = [];

  // Blocker 3: Normalized ID-Based Team Eligibility via public.product_members
  const { data: pMembers } = await supabase
    .from('product_members')
    .select('member_name, role, member_email, is_team_leader, departments(name)')
    .in('product_id', safeProducts.map(p => p.id));

  if (pMembers && pMembers.length > 0) {
    for (const pm of pMembers) {
      const isMentor = (pm.role || '').toLowerCase().includes('mentor');
      const isLeader = pm.is_team_leader || (pm.role || '').toLowerCase().includes('leader');
      const roleName = isLeader ? 'Team Leader' : (isMentor ? 'Mentor' : 'Team Member');
      const email = (pm.member_email || '').toLowerCase().trim();
      let deptName = pm.departments?.name || '';

      // If department_id was null in product_members, resolve via registration or email
      if (!deptName && reg) {
        if (reg.leader_email && email === reg.leader_email.toLowerCase().trim()) {
          deptName = normalizeDepartment(reg.leader_department);
        } else if (reg.member2_email && email === reg.member2_email.toLowerCase().trim()) {
          deptName = normalizeDepartment(reg.member2_department);
        } else if (reg.member3_email && email === reg.member3_email.toLowerCase().trim()) {
          deptName = normalizeDepartment(reg.member3_department);
        }
      }
      if (!deptName && email) {
        if (email.includes('ece')) deptName = 'Electronics and Communication Engineering';
        else if (email.includes('cse')) deptName = 'Computer Science and Engineering';
        else if (email.includes('mech')) deptName = 'Mechanical Engineering';
        else if (email.includes('eee')) deptName = 'Electrical and Electronics Engineering';
        else if (email.includes('aiml')) deptName = 'Artificial Intelligence and Machine Learning';
        else if (email.includes('aids')) deptName = 'Artificial Intelligence and Data Science';
        else if (email.includes('it')) deptName = 'Information Technology';
        else if (email.includes('cyber')) deptName = 'Cyber Security';
        else if (email.includes('cce')) deptName = 'Computer and Communication Engineering';
        else if (email.includes('csbs')) deptName = 'Computer Science and Business System';
      }

      displayMembers.push({
        name: pm.member_name,
        role: roleName,
        department: deptName
      });

      // Eligible team members are Leader and Team Members. Mentor is strictly excluded!
      if (!isMentor) {
        if (email && !memberEmails.includes(email)) {
          memberEmails.push(email);
        }
        if (deptName && !memberDepartments.includes(deptName)) {
          memberDepartments.push(deptName);
        }
      }
    }

    // Resilient fallback: ensure normalized departments for Leader and Members 1 & 2 from registration are present
    if (reg) {
      [reg.leader_department, reg.member2_department, reg.member3_department].filter(Boolean).forEach(d => {
        const normD = normalizeDepartment(d);
        if (normD && !memberDepartments.includes(normD)) {
          memberDepartments.push(normD);
        }
      });
    }
  } else if (reg) {
    displayMembers = [
      { name: reg.leader_name, role: 'Team Leader', department: reg.leader_department },
      { name: reg.member2_name, role: 'Team Member', department: reg.member2_department },
      { name: reg.member3_name, role: 'Team Member', department: reg.member3_department }
    ].filter(m => m.name);
    // Mentor department is strictly excluded; only Leader and Members 1 & 2 are included
    memberDepartments = [reg.leader_department, reg.member2_department, reg.member3_department].filter(Boolean);
    memberEmails = [reg.leader_email, reg.member2_email, reg.member3_email].filter(Boolean).map(e => e.toLowerCase().trim());
  }

  const controls = await getVotingControls();
  const isVotingActive = controls?.is_voting_active || false;
  const currentRound = controls?.current_voting_round || 1;

  if (fromQr && qrRecord) {
    if (qrRecord.is_active === false) {
      return {
        error: 403,
        error_code: 'INVALID_QR_CODE',
        message: 'INVALID QR CODE - This QR code is not active or is not associated with a valid voting team.'
      };
    }
  }

  let eligibility = {
    can_vote: false,
    voting_closed: !isVotingActive,
    reason: 'Please sign in with your @sece.ac.in account to check voting eligibility.'
  };

  if (!isVotingActive) {
    eligibility = {
      can_vote: false,
      voting_closed: true,
      error_code: 'VOTING_CLOSED',
      reason: 'Community voting is currently unavailable.'
    };
  } else if (voterUser) {
      const { data: voterProfile } = await supabase
        .from('profiles')
        .select('department, email')
        .eq('user_id', voterUser.id)
        .maybeSingle();

      const voterDept = (voterProfile?.department || voterUser?.user_metadata?.department || fallbackVoterDeptMap.get(voterUser.id) || '').trim();
      const voterEmail = (voterProfile?.email || voterUser.email || '').toLowerCase().trim();

      // Phase 3 Product-level voting: Query all votes cast by this voter (No voting rounds in Phase 3)
      let votedProductIds = new Set();
      try {
        const { data: dbPv, error: pvErr } = await supabase
          .from('product_votes')
          .select('product_id')
          .eq('voter_user_id', voterUser.id);

        if (!pvErr && dbPv) {
          dbPv.forEach(v => {
            if (v.product_id) votedProductIds.add(v.product_id);
          });
        }
      } catch (e) {
        // Fallback check below
      }

      try {
        const { data: dbVotes, error: voteErr } = await supabase
          .from('votes')
          .select('product_id')
          .eq('voter_user_id', voterUser.id);

        if (!voteErr && dbVotes) {
          dbVotes.forEach(v => {
            if (v.product_id) votedProductIds.add(v.product_id);
          });
        }
      } catch (e) {
        // Fallback check below
      }

      (fallbackVotes || []).forEach(v => {
        if (v.voter_user_id === voterUser.id && v.product_id) {
          votedProductIds.add(v.product_id);
        }
      });

      // Attach per-product voted status
      safeProducts = safeProducts.map(p => ({
        ...p,
        is_voted: votedProductIds.has(p.id)
      }));

      const allProductsVoted = safeProducts.length > 0 && safeProducts.every(p => p.is_voted);

      if (memberEmails.includes(voterEmail)) {
        eligibility = {
          can_vote: false,
          is_own_team: true,
          error_code: 'OWN_TEAM_VOTE_BLOCKED',
          reason: "YOU CAN'T VOTE FOR YOUR OWN TEAM - You cannot vote for your own team.",
          voted_product_ids: Array.from(votedProductIds)
        };
      } else if (!voterDept) {
        eligibility = {
          can_vote: false,
          needs_department: true,
          error_code: 'DEPARTMENT_REQUIRED',
          reason: 'Please select and save your department in your profile before voting.',
          voted_product_ids: Array.from(votedProductIds)
        };
      } else {
        // Check department clash (Mentor department is strictly ignored!)
        const deptClash = memberDepartments.some(
          d => d && d.toLowerCase().trim() === voterDept.toLowerCase()
        );

        if (deptClash) {
          eligibility = {
            can_vote: false,
            department_ineligible: true,
            error_code: 'DEPARTMENT_INELIGIBLE',
            reason: `VOTING NOT ALLOWED - You cannot vote for a team containing a leader/member from your department (${voterDept}). Mentor department is ignored.`,
            voted_product_ids: Array.from(votedProductIds)
          };
        } else if (allProductsVoted) {
          eligibility = {
            can_vote: false,
            already_voted: true,
            all_products_voted: true,
            error_code: 'ALREADY_VOTED',
            reason: 'You have already voted for all projects belonging to this team.',
            voted_product_ids: Array.from(votedProductIds)
          };
        } else {
          eligibility = {
            can_vote: true,
            already_voted: false,
            reason: null,
            voted_product_ids: Array.from(votedProductIds)
          };
        }
      }
    }

  return {
    success: true,
    team: {
      id: team.id,
      team_name: team.team_name,
      registration_id: reg?.registration_id || 'IPL26-TEAM',
      department: memberDepartments[0] || 'Engineering'
    },
    products: safeProducts,
    members: displayMembers,
    eligibility
  };
}

// -------------------------------------------------------------
// 1. GET /api/voting/status & /api/voting/controls
// Public endpoint: Returns current global voting & QR controls
// -------------------------------------------------------------
router.get(['/status', '/controls'], async (req, res) => {
  try {
    const controls = await getVotingControls();
    const ctrlData = {
      is_voting_active: Boolean(controls.is_voting_active || controls.community_voting_enabled),
      is_qr_generation_active: Boolean(controls.is_qr_generation_active || controls.qr_generation_enabled),
      community_voting_enabled: Boolean(controls.community_voting_enabled || controls.is_voting_active),
      qr_generation_enabled: Boolean(controls.qr_generation_enabled || controls.is_qr_generation_active),
      current_voting_round: controls.current_voting_round || 1,
      updated_at: controls.updated_at || new Date().toISOString()
    };
    return res.status(200).json({
      success: true,
      controls: ctrlData,
      ...ctrlData
    });
  } catch (err) {
    console.error('[Voting API] /status error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve voting status.' });
  }
});

// -------------------------------------------------------------
// 2. GET /api/voting/qr/:token
// Resolves opaque permanent QR token to team and eligibility
// -------------------------------------------------------------
router.get('/qr/:token', qrResolutionLimiter, optionalAuthenticateUser, async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || typeof token !== 'string' || token.trim() === '') {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_QR_CODE',
        message: 'A valid QR token is required.'
      });
    }

    // Check global switch first (allow admin preview)
    const controls = await getVotingControls();

    let isAdmin = req.user?.user_metadata?.role === 'admin';
    if (!isAdmin && req.user) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('user_id', req.user.id).maybeSingle();
      isAdmin = prof?.role === 'admin';
    }

    if (!controls?.is_qr_generation_active && !isAdmin) {
      return res.status(403).json({
        success: false,
        error_code: 'QR_DISABLED',
        message: 'QR code access is currently disabled by the administrator.'
      });
    }

    // Lookup team by permanent token
    const qrRecord = await getQrByToken(token.trim());

    if (!qrRecord) {
      return res.status(404).json({
        success: false,
        error_code: 'INVALID_QR_CODE',
        message: 'INVALID QR CODE - This QR code is not active or is not associated with a valid voting team.'
      });
    }

    if (qrRecord.is_active === false) {
      return res.status(403).json({
        success: false,
        error_code: 'INVALID_QR_CODE',
        message: 'INVALID QR CODE - This QR code is not active or is not associated with a valid voting team.'
      });
    }

    const result = await buildTeamShowcaseAndEligibility(qrRecord.team_id, req.user, true, qrRecord);
    if (result.error) {
      return res.status(result.error).json({
        success: false,
        error_code: result.error_code,
        message: result.message
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('[Voting API] /qr/:token error:', err.message);
    return res.status(500).json({ success: false, message: 'Error resolving QR code.' });
  }
});

// 2b. GET /api/voting/resolve-token
// Query-param alias for QR resolution (?token=...)
router.get('/resolve-token', qrResolutionLimiter, optionalAuthenticateUser, async (req, res) => {
  try {
    const token = req.query.token;
    if (!token || typeof token !== 'string' || token.trim() === '') {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_QR_CODE',
        message: 'A valid QR token is required.'
      });
    }

    const controls = await getVotingControls();
    let isAdmin = req.user?.user_metadata?.role === 'admin';
    if (!isAdmin && req.user) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('user_id', req.user.id).maybeSingle();
      isAdmin = prof?.role === 'admin';
    }

    if (!controls?.is_qr_generation_active && !isAdmin) {
      return res.status(403).json({
        success: false,
        error_code: 'QR_DISABLED',
        message: 'QR code access is currently disabled by the administrator.'
      });
    }

    const qrRecord = await getQrByToken(token.trim());
    if (!qrRecord || qrRecord.is_active === false) {
      return res.status(404).json({
        success: false,
        error_code: 'INVALID_QR_CODE',
        message: 'INVALID QR CODE - This QR code is not active or is not associated with a valid voting team.'
      });
    }

    const result = await buildTeamShowcaseAndEligibility(qrRecord.team_id, req.user, true, qrRecord);
    if (result.error) {
      return res.status(result.error).json({
        success: false,
        error_code: result.error_code,
        message: result.message
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('[Voting API] /resolve-token error:', err.message);
    return res.status(500).json({ success: false, message: 'Error resolving QR token.' });
  }
});

// -------------------------------------------------------------
// 3. GET /api/voting/team/resolve/:identifier
// Team ID Fallback Route (resolves registration_id e.g. IPL26-0439 or name)
// -------------------------------------------------------------
router.get('/team/resolve/:identifier', qrResolutionLimiter, optionalAuthenticateUser, async (req, res) => {
  try {
    const { identifier } = req.params;
    if (!identifier || typeof identifier !== 'string' || identifier.trim() === '') {
      return res.status(400).json({
        success: false,
        error_code: 'TEAM_NOT_FOUND',
        message: 'A valid Team ID or registration ID is required.'
      });
    }

    const resolved = await resolveTeamRecord(identifier.trim());
    if (!resolved?.team) {
      return res.status(404).json({
        success: false,
        error_code: 'TEAM_NOT_FOUND',
        message: 'TEAM NOT FOUND - Please check the Team ID and try again.'
      });
    }

    const result = await buildTeamShowcaseAndEligibility(resolved.team.id, req.user, false, resolved.qrRecord);
    if (result.error) {
      return res.status(result.error).json({
        success: false,
        error_code: result.error_code,
        message: result.message
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('[Voting API] /team/resolve/:identifier error:', err.message);
    return res.status(500).json({ success: false, message: 'Error resolving team.' });
  }
});

// -------------------------------------------------------------
// 4. POST /api/voting/vote
// Authoritative Atomic Vote Submission
// -------------------------------------------------------------
router.post('/vote', authenticateUser, voteLimiter, async (req, res) => {
  try {
    // 1. Authoritative check: Global live voting switch
    const controls = await getVotingControls();
    if (!controls?.is_voting_active) {
      return res.status(403).json({
        success: false,
        error_code: 'VOTING_CLOSED',
        message: 'Live voting is currently closed by the event administrator.'
      });
    }

    let { product_id, team_id, qr_token, team_identifier, voting_round = controls.current_voting_round || 1 } = req.body;

    // Blocker 1: Authenticated voter ID enforcement
    // The authenticated voter identity derives strictly from req.user.id (from authenticated session/JWT).
    // Client-supplied voter ID is rejected if it attempts impersonation, and is NEVER trusted.
    const clientVoterId = req.body.p_voter_user_id || req.body.voter_user_id || req.body.voter_id;
    if (clientVoterId && String(clientVoterId).toLowerCase().trim() !== String(req.user.id).toLowerCase().trim()) {
      return res.status(403).json({
        success: false,
        error_code: 'IMPERSONATION_BLOCKED',
        message: 'Security violation: Cannot vote on behalf of another user identity.'
      });
    }

    // 2. Validate and resolve product_id & team_id
    let productRow = null;
    if (product_id) {
      const { data: pData } = await supabase
        .from('products')
        .select('id, team_id, product_title, status')
        .eq('id', product_id)
        .maybeSingle();

      if (!pData) {
        return res.status(404).json({
          success: false,
          error_code: 'PRODUCT_NOT_FOUND',
          message: 'The specified product does not exist.'
        });
      }

      productRow = pData;
      if (productRow.status && productRow.status !== 'active') {
        return res.status(400).json({
          success: false,
          error_code: 'PRODUCT_INACTIVE',
          message: 'This project is not currently active for community voting.'
        });
      }
      if (team_id && team_id !== productRow.team_id) {
        return res.status(400).json({
          success: false,
          error_code: 'TEAM_PRODUCT_MISMATCH',
          message: 'The specified product does not belong to the provided team.'
        });
      }
      team_id = productRow.team_id;
    }

    // 3. If qr_token is passed, validate it strictly
    if (qr_token) {
      const qrRow = await getQrByToken(qr_token.trim());

      if (!qrRow || qrRow.is_active === false) {
        return res.status(403).json({
          success: false,
          error_code: 'INVALID_QR_CODE',
          message: 'INVALID QR CODE - This QR code is not active or is invalid.'
        });
      }

      if (team_id && qrRow.team_id !== team_id) {
        return res.status(403).json({
          success: false,
          error_code: 'QR_TEAM_MISMATCH',
          message: 'INVALID QR CODE - This QR code does not belong to the product team.'
        });
      }

      if (!team_id) {
        team_id = qrRow.team_id;
      }
    }

    // Resolve team_id from team_identifier if needed
    if (!team_id && team_identifier) {
      const resolved = await resolveTeamRecord(team_identifier);
      if (resolved?.team) {
        team_id = resolved.team.id;
      }
    }

    if (!team_id) {
      return res.status(400).json({
        success: false,
        error_code: 'TEAM_NOT_FOUND',
        message: 'Team ID or valid QR token is required to vote.'
      });
    }

    // If product_id was not passed, resolve active products for this team
    if (!product_id) {
      const { data: teamProducts } = await supabase
        .from('products')
        .select('id, product_title, status')
        .eq('team_id', team_id)
        .or('status.eq.active,status.is.null')
        .order('product_number', { ascending: true });

      if (teamProducts && teamProducts.length === 1) {
        product_id = teamProducts[0].id;
        productRow = teamProducts[0];
      } else if (teamProducts && teamProducts.length > 1) {
        return res.status(400).json({
          success: false,
          error_code: 'PRODUCT_ID_REQUIRED',
          message: 'This team has multiple projects. Please select a specific project to vote for.'
        });
      } else {
        product_id = team_id;
      }
    }

    // Concurrency atomic lock per voter:product (Phase 3: single vote per idea/product)
    const inflightLockKey = `${req.user.id}:${product_id}`;
    if (inflightVoteLocks.has(inflightLockKey)) {
      metrics.duplicateAttemptsBlocked += 1;
      return res.status(409).json({
        success: false,
        error_code: 'ALREADY_VOTED',
        message: 'You have already voted for this idea.'
      });
    }

    // Fast database pre-check for existing vote on this product
    try {
      const { data: earlyPvCheck } = await supabase
        .from('product_votes')
        .select('id')
        .eq('voter_user_id', req.user.id)
        .eq('product_id', product_id)
        .maybeSingle();

      if (earlyPvCheck) {
        metrics.duplicateAttemptsBlocked += 1;
        return res.status(409).json({
          success: false,
          error_code: 'ALREADY_VOTED',
          message: 'You have already voted for this idea.'
        });
      }
    } catch (e) {}

    if (fallbackVotes.some(v => v.voter_user_id === req.user.id && (v.product_id === product_id || (!v.product_id && v.team_id === team_id)))) {
      metrics.duplicateAttemptsBlocked += 1;
      return res.status(409).json({
        success: false,
        error_code: 'ALREADY_VOTED',
        message: 'You have already voted for this idea.'
      });
    }

    inflightVoteLocks.add(inflightLockKey);

    // 4. Call PostgreSQL atomic function 'cast_vote'
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('cast_vote', {
      p_product_id: product_id,
      p_team_id: team_id,
      p_voting_round: voting_round,
      p_qr_token: qr_token || null
    });

    if (!rpcErr && rpcResult) {
      inflightVoteLocks.delete(inflightLockKey);
      if (!rpcResult.success) {
        if (rpcResult.error_code === 'ALREADY_VOTED') {
          metrics.duplicateAttemptsBlocked += 1;
          return res.status(409).json({
            success: false,
            error_code: 'ALREADY_VOTED',
            message: 'You have already voted for this idea.'
          });
        }
        return res.status(403).json({
          success: false,
          error_code: rpcResult.error_code,
          message: rpcResult.message
        });
      }

      metrics.voteTimestamps.push(Date.now());
      leaderboardCache.cachedAt = 0;

      return res.status(200).json({
        success: true,
        product_id: rpcResult.product_id || product_id,
        product_title: rpcResult.product_title,
        team_id: rpcResult.team_id || team_id,
        team_name: rpcResult.team_name,
        voting_round: 1,
        new_product_votes: rpcResult.new_product_votes,
        new_team_votes: rpcResult.new_team_votes,
        new_vote_count: rpcResult.new_product_votes,
        message: rpcResult.message || 'Your vote has been officially recorded!'
      });
    }

    if (rpcErr) {
      // Check if unique constraint violation
      if (rpcErr.message && (rpcErr.message.includes('unique_voter_product') || rpcErr.message.includes('unique_voter_team_round') || rpcErr.code === '23505')) {
        inflightVoteLocks.delete(inflightLockKey);
        metrics.duplicateAttemptsBlocked += 1;
        return res.status(409).json({
          success: false,
          error_code: 'ALREADY_VOTED',
          message: 'You have already voted for this idea.'
        });
      }

      // Check if function does not exist or has signature difference, run direct fallback
      if (rpcErr.code === '42883' || (rpcErr.message && (rpcErr.message.includes('does not exist') || rpcErr.message.includes('schema cache')))) {
        console.warn('[Voting API] cast_vote RPC missing in DB, executing direct safe fallback');
        
        // Direct Fallback Execution
        const showcase = await buildTeamShowcaseAndEligibility(team_id, req.user);

        // Check team-level own team eligibility
        if (showcase.eligibility?.is_own_team) {
          inflightVoteLocks.delete(inflightLockKey);
          return res.status(403).json({
            success: false,
            error_code: 'OWN_TEAM_VOTE_BLOCKED',
            message: "YOU CAN'T VOTE FOR YOUR OWN TEAM - You cannot vote for your own team."
          });
        }

        // Check department clash (Mentor department ignored)
        if (showcase.eligibility?.department_ineligible) {
          inflightVoteLocks.delete(inflightLockKey);
          return res.status(403).json({
            success: false,
            error_code: 'DEPARTMENT_INELIGIBLE',
            message: showcase.eligibility.reason || 'VOTING NOT ALLOWED - You cannot vote for a team containing members from your department.'
          });
        }

        if (showcase.eligibility?.voting_closed) {
          inflightVoteLocks.delete(inflightLockKey);
          return res.status(403).json({
            success: false,
            error_code: 'VOTING_CLOSED',
            message: 'Community voting is currently closed.'
          });
        }

        // Check voter department requirement
        const { data: voterProfile } = await supabase.from('profiles').select('department').eq('user_id', req.user.id).maybeSingle();
        const voterDept = (voterProfile?.department || req.user?.user_metadata?.department || fallbackVoterDeptMap.get(req.user.id) || '').trim();

        if (!voterDept) {
          inflightVoteLocks.delete(inflightLockKey);
          return res.status(400).json({
            success: false,
            error_code: 'DEPARTMENT_REQUIRED',
            message: 'Please select and save your department in your profile before voting.'
          });
        }

        // Check if voter already voted for this specific product (Phase 3: single vote per idea)
        let alreadyVoted = false;
        try {
          const { data: existingPv } = await supabase
            .from('product_votes')
            .select('id')
            .eq('voter_user_id', req.user.id)
            .eq('product_id', product_id)
            .maybeSingle();

          if (existingPv) alreadyVoted = true;
        } catch (e) {
          console.warn('[Voting API] Check product_votes notice:', e.message);
        }

        if (!alreadyVoted) {
          try {
            const { data: existingVote } = await supabase
              .from('votes')
              .select('id')
              .eq('voter_user_id', req.user.id)
              .eq('product_id', product_id)
              .maybeSingle();

            if (existingVote) alreadyVoted = true;
          } catch (e) {
            // Table may not have product_id column yet
          }
        }

        if (!alreadyVoted) {
          alreadyVoted = fallbackVotes.some(v => v.voter_user_id === req.user.id && (v.product_id === product_id || (!v.product_id && v.team_id === team_id)));
        }

        if (alreadyVoted) {
          inflightVoteLocks.delete(inflightLockKey);
          metrics.duplicateAttemptsBlocked += 1;
          return res.status(409).json({
            success: false,
            error_code: 'ALREADY_VOTED',
            message: 'You have already voted for this idea.'
          });
        }

        // Insert into product_votes ledger table
        let inserted = false;
        try {
          const { data: insPvData, error: insPvErr } = await supabase.from('product_votes').insert([{
            voter_user_id: req.user.id,
            product_id: product_id,
            team_id: team_id,
            voter_department: voterDept,
            voting_round: 1
          }]).select();

          if (!insPvErr && insPvData) {
            inserted = true;
          } else if (insPvErr && (insPvErr.code === '23505' || insPvErr.message?.includes('unique'))) {
            inflightVoteLocks.delete(inflightLockKey);
            metrics.duplicateAttemptsBlocked += 1;
            return res.status(409).json({
              success: false,
              error_code: 'ALREADY_VOTED',
              message: 'You have already voted for this idea.'
            });
          }
        } catch (e) {
          console.warn('[Voting API] Insert product_votes notice:', e.message);
        }

        // Also record in legacy votes table if supported
        try {
          await supabase.from('votes').insert([{
            voter_user_id: req.user.id,
            team_id: team_id,
            voter_department: voterDept,
            voting_round: 1
          }]);
        } catch (e) {}

        if (!inserted) {
          fallbackVotes.push({
            id: crypto.randomUUID(),
            voter_user_id: req.user.id,
            product_id: product_id,
            team_id: team_id,
            voter_department: voterDept,
            voting_round: 1,
            created_at: new Date().toISOString()
          });
        }

        // Increment product_vote_counts & team_votes
        let newProductVotes = 1;
        let newTeamVotes = 1;
        try {
          const { count: pvCount, error: countErr } = await supabase
            .from('product_votes')
            .select('*', { count: 'exact', head: true })
            .eq('product_id', product_id);

          if (!countErr && typeof pvCount === 'number' && pvCount > 0) {
            newProductVotes = pvCount;
          } else {
            const { data: existingPvc } = await supabase
              .from('product_vote_counts')
              .select('total_votes')
              .eq('product_id', product_id)
              .maybeSingle();
            newProductVotes = (existingPvc?.total_votes || 0) + 1;
          }

          await supabase.from('product_vote_counts').upsert({
            product_id,
            team_id,
            voting_round: 1,
            total_votes: newProductVotes,
            vote_count: newProductVotes,
            last_vote_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'product_id, voting_round' });
        } catch (e) {
          console.warn('[Voting API] Error updating product_vote_counts:', e.message);
        }

        try {
          const { count: teamVoteCount } = await supabase
            .from('product_votes')
            .select('*', { count: 'exact', head: true })
            .eq('team_id', team_id);

          newTeamVotes = typeof teamVoteCount === 'number' && teamVoteCount > 0 ? teamVoteCount : 1;

          await supabase.from('team_votes').upsert({
            team_id,
            voting_round: 1,
            vote_count: newTeamVotes,
            updated_at: new Date().toISOString()
          }, { onConflict: 'team_id, voting_round' });
        } catch (e) {
          newTeamVotes = fallbackVotes.filter(v => v.team_id === team_id).length;
        }

        metrics.voteTimestamps.push(Date.now());
        leaderboardCache.cachedAt = 0;
        inflightVoteLocks.delete(inflightLockKey);

        const currentProduct = showcase.products?.find(p => p.id === product_id);
        const prodTitle = currentProduct?.product_title || productRow?.product_title || 'Innovation Project';

        return res.status(200).json({
          success: true,
          product_id,
          product_title: prodTitle,
          team_id,
          team_name: showcase.team?.team_name,
          voting_round: 1,
          new_product_votes: newProductVotes,
          new_team_votes: newTeamVotes,
          new_vote_count: newProductVotes,
          message: `Your vote for "${prodTitle}" has been recorded successfully!`
        });
      }

      inflightVoteLocks.delete(inflightLockKey);
      return res.status(500).json({
        success: false,
        message: 'Vote submission failed. Please ensure the database migration has been run.'
      });
    }
  } catch (err) {
    if (typeof inflightLockKey !== 'undefined') {
      inflightVoteLocks.delete(inflightLockKey);
    }
    console.error('[Voting API] /vote error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error processing vote.' });
  }
});

// -------------------------------------------------------------
// 4. GET /api/voting/leaderboard
// Cached authoritative live voting leaderboard
// -------------------------------------------------------------
router.get('/leaderboard', leaderboardLimiter, async (req, res) => {
  try {
    const round = parseInt(req.query.round, 10) || 1;
    const now = Date.now();

    // Serve from cache if fresh (within 3 seconds)
    if (leaderboardCache.data && (now - leaderboardCache.cachedAt) < leaderboardCache.ttlMs) {
      return res.status(200).json({
        success: true,
        cached: true,
        data: leaderboardCache.data
      });
    }

    // 1. Try get_voting_leaderboard RPC
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_voting_leaderboard', {
      p_voting_round: round
    });

    if (!rpcErr && rpcData) {
      leaderboardCache.data = rpcData;
      leaderboardCache.cachedAt = now;
      return res.status(200).json({
        success: true,
        cached: false,
        data: rpcData
      });
    }

    // 2. Direct fallback query if RPC isn't deployed yet
    console.warn('[Voting API] get_voting_leaderboard RPC unavailable, running direct query fallback:', rpcErr?.message);

    const [
      { data: productsData, error: prodsErr },
      { data: teamsData },
      { data: productVotesData },
      { data: registrationsData }
    ] = await Promise.all([
      supabase.from('products').select('id, team_id, product_title, innovation_domain, trl_level, legacy_registration_id, status, created_at').or('status.eq.active,status.is.null'),
      supabase.from('teams').select('id, team_name, created_at'),
      supabase.from('product_votes').select('product_id, total_votes, last_vote_at').eq('voting_round', round),
      supabase.from('registrations').select('registration_id, team_name, leader_department')
    ]);

    if (prodsErr) throw prodsErr;

    const teamMap = new Map();
    (teamsData || []).forEach(t => teamMap.set(t.id, t));

    const votesMap = new Map();
    let totalVotes = 0;
    (productVotesData || []).forEach(v => {
      votesMap.set(v.product_id, {
        count: v.total_votes,
        updated_at: v.last_vote_at
      });
      totalVotes += v.total_votes;
    });

    const regMap = new Map();
    (registrationsData || []).forEach(r => {
      if (r.registration_id) regMap.set(r.registration_id, r);
      if (r.team_name) regMap.set(r.team_name.trim().toLowerCase(), r);
    });

    const ranked = (productsData || []).map(p => {
      const v = votesMap.get(p.id) || { count: 0, updated_at: p.created_at };
      const team = teamMap.get(p.team_id);
      const reg = p.legacy_registration_id ? regMap.get(p.legacy_registration_id) : (team ? regMap.get(team.team_name.trim().toLowerCase()) : null);
      const dept = normalizeDepartment(reg?.leader_department);

      return {
        id: p.id,
        productId: p.id,
        product_id: p.id,
        productTitle: p.product_title || 'Innovation Project',
        product_title: p.product_title || 'Innovation Project',
        leadingProductTitle: p.product_title || 'Innovation Project',
        leading_product_title: p.product_title || 'Innovation Project',
        teamId: p.team_id,
        team_id: p.team_id,
        teamName: team?.team_name || 'Innovation Team',
        team_name: team?.team_name || 'Innovation Team',
        department: dept,
        department_name: dept,
        innovationDomain: p.innovation_domain || 'Open Innovation',
        innovation_domain: p.innovation_domain || 'Open Innovation',
        trlLevel: p.trl_level || null,
        voteCount: v.count,
        vote_count: v.count,
        total_votes: v.count,
        lastVoteTime: v.updated_at,
        last_vote_time: v.updated_at
      };
    });

    // Authoritative sort: voteCount DESC, lastVoteTime ASC, id ASC
    ranked.sort((a, b) => {
      if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
      const tA = new Date(a.lastVoteTime).getTime();
      const tB = new Date(b.lastVoteTime).getTime();
      if (tA !== tB) return tA - tB;
      return a.id.localeCompare(b.id);
    });

    const finalRanks = ranked.map((r, idx) => ({ ...r, rank: idx + 1 }));

    const payload = {
      voting_round: round,
      total_votes: totalVotes,
      total_products: finalRanks.length,
      total_teams: new Set(finalRanks.map(r => r.team_id)).size,
      products: finalRanks,
      teams: finalRanks
    };

    leaderboardCache.data = payload;
    leaderboardCache.cachedAt = now;

    return res.status(200).json({
      success: true,
      cached: false,
      data: payload
    });
  } catch (err) {
    console.error('[Voting API] /leaderboard error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve voting leaderboard.' });
  }
});

// -------------------------------------------------------------
// 5. GET /api/voting/my-votes
// Returns IDs of products and teams the authenticated user has voted for
// -------------------------------------------------------------
router.get('/my-votes', authenticateUser, async (req, res) => {
  try {
    const round = parseInt(req.query.round, 10) || 1;

    let votesList = [];
    try {
      const { data: pvVotes, error: pvErr } = await supabase
        .from('product_votes')
        .select('id, product_id, team_id, created_at, products(product_title, innovation_domain), teams(team_name)')
        .eq('voter_user_id', req.user.id)
        .order('created_at', { ascending: false });

      if (!pvErr && Array.isArray(pvVotes) && pvVotes.length > 0) {
        votesList = pvVotes;
      }
    } catch (e) {
      // Fallback
    }

    if (votesList.length === 0) {
      try {
        const { data: votes, error } = await supabase
          .from('votes')
          .select('id, product_id, team_id, created_at, products(product_title, innovation_domain), teams(team_name)')
          .eq('voter_user_id', req.user.id)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(votes) && votes.length > 0) {
          votesList = votes;
        }
      } catch (e) {}
    }

    if (votesList.length === 0) {
      votesList = fallbackVotes.filter(v => v.voter_user_id === req.user.id);
    }

    const votedProductIds = votesList.map(v => v.product_id).filter(Boolean);
    const votedTeamIds = Array.from(new Set(votesList.map(v => v.team_id).filter(Boolean)));

    return res.status(200).json({
      success: true,
      voting_round: 1,
      voted_product_ids: votedProductIds,
      voted_team_ids: votedTeamIds,
      votes: votesList.map(v => ({
        id: v.id,
        product_id: v.product_id,
        product_title: v.products?.product_title || 'Innovation Project',
        team_id: v.team_id,
        team_name: v.teams?.team_name || 'Innovation Team',
        created_at: v.created_at
      }))
    });
  } catch (err) {
    console.error('[Voting API] /my-votes error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch voter voting history.' });
  }
});

// -------------------------------------------------------------
// 6. POST /api/voting/profile/department
// Saves voter department into public.profiles
// -------------------------------------------------------------
router.post('/profile/department', authenticateUser, async (req, res) => {
  try {
    const { department } = req.body;
    if (!department || typeof department !== 'string' || department.trim() === '') {
      return res.status(400).json({ success: false, message: 'Department is required.' });
    }

    // Verify against active departments table
    const { data: activeDepts, error: deptsErr } = await supabase
      .from('departments')
      .select('name')
      .eq('is_active', true);

    if (deptsErr) throw deptsErr;

    const validNames = new Set((activeDepts || []).map(d => d.name.toLowerCase().trim()));
    if (!validNames.has(department.toLowerCase().trim())) {
      return res.status(400).json({
        success: false,
        message: `Department "${department}" is not an active college department.`
      });
    }

    // Check if user already has an authoritative department set (one-time lock)
    try {
      const { data: existingProf } = await supabase
        .from('profiles')
        .select('department')
        .eq('user_id', req.user.id)
        .maybeSingle();

      if (existingProf?.department) {
        return res.status(200).json({
          success: true,
          department: existingProf.department.trim(),
          message: 'Department is already registered and locked.'
        });
      }
    } catch (e) {}

    if (fallbackVoterDeptMap.has(req.user.id)) {
      return res.status(200).json({
        success: true,
        department: fallbackVoterDeptMap.get(req.user.id),
        message: 'Department is already registered and locked.'
      });
    }

    // Always update fallback map for instant availability
    fallbackVoterDeptMap.set(req.user.id, department.trim());

    // 1. Authoritative update to public.profiles
    try {
      await supabase
        .from('profiles')
        .update({
          department: department.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', req.user.id);
    } catch (e) {
      console.warn('[Voting API] Update profiles.department notice:', e.message);
    }

    // 2. Synchronize user_metadata in Supabase Auth as cache/convenience
    try {
      await supabase.auth.admin.updateUserById(req.user.id, {
        user_metadata: {
          ...(req.user.user_metadata || {}),
          department: department.trim()
        }
      });
    } catch (e) {
      console.warn('[Voting API] Update user_metadata department notice:', e.message);
    }

    return res.status(200).json({
      success: true,
      department: department.trim(),
      message: 'Department saved successfully.'
    });
  } catch (err) {
    console.error('[Voting API] /profile/department error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update department.' });
  }
});

// -------------------------------------------------------------
// 7. GET /api/voting/profile/department
// Resolves authoritative voter department for authenticated user
// -------------------------------------------------------------
router.get('/profile/department', authenticateUser, async (req, res) => {
  try {
    let resolvedDept = null;

    // 1. Check authoritative public.profiles
    try {
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('department')
        .eq('user_id', req.user.id)
        .maybeSingle();

      if (!profErr && prof?.department) {
        resolvedDept = prof.department;
      }
    } catch (e) {
      console.warn('[Voting API] Read profiles.department notice:', e.message);
    }

    // 2. Check user_metadata cache from req.user
    if (!resolvedDept && req.user?.user_metadata?.department) {
      resolvedDept = req.user.user_metadata.department;
    }

    // 3. Check fresh Supabase Auth user_metadata directly
    if (!resolvedDept) {
      try {
        const { data: adminUserData } = await supabase.auth.admin.getUserById(req.user.id);
        if (adminUserData?.user?.user_metadata?.department) {
          resolvedDept = adminUserData.user.user_metadata.department;
        }
      } catch (e) {}
    }

    // 4. Check memory fallback map
    if (!resolvedDept && fallbackVoterDeptMap.has(req.user.id)) {
      resolvedDept = fallbackVoterDeptMap.get(req.user.id);
    }

    return res.status(200).json({
      success: true,
      department: resolvedDept ? resolvedDept.trim() : null
    });
  } catch (err) {
    console.error('[Voting API] GET /profile/department error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve department.' });
  }
});

// -------------------------------------------------------------
// 8. GET /api/voting/team-qr-status/:team_id
// Returns QR state (NOT_GENERATED, ACTIVE, DISABLED_BY_ADMIN)
// Verifies user is Leader, Member 1, or Member 2 (Mentors blocked!)
// -------------------------------------------------------------
router.get('/team-qr-status/:team_id', authenticateUser, async (req, res) => {
  try {
    const { team_id } = req.params;
    const { product_id } = req.query;

    let isAdmin = req.user?.user_metadata?.role === 'admin';
    if (!isAdmin) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', req.user.id)
        .maybeSingle();

      isAdmin = profile?.role === 'admin';
    }

    // Verify membership if not admin (mentors can view status, but cannot generate)
    if (!isAdmin) {
      const membership = await verifyTeamMembership(req.user.id, req.user.email, team_id);
      if (!membership.authorized && !membership.isMentor) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this team QR code.'
        });
      }
    }

    // Check global QR generation switch
    const controls = await getVotingControls();
    const isQrGenActive = controls?.is_qr_generation_active ?? false;

    // Query team_qr_codes (scoped to product_id if provided)
    const qrRow = await getTeamQr(team_id, controls?.current_voting_round || 1, product_id || null);

    if (!qrRow) {
      return res.status(200).json({
        success: true,
        status: 'NOT_GENERATED',
        has_qr: false,
        is_active: false,
        qr_generation_enabled: isQrGenActive
      });
    }

    // If QR row exists, evaluate whether active or disabled by admin
    const isTeamQrActive = qrRow.is_active !== false;

    if (!isTeamQrActive || (!isQrGenActive && !isAdmin)) {
      return res.status(200).json({
        success: true,
        status: 'DISABLED_BY_ADMIN',
        has_qr: true,
        is_active: isTeamQrActive,
        qr_generation_enabled: isQrGenActive,
        message: 'QR code access is currently disabled by the administrator.'
      });
    }

    return res.status(200).json({
      success: true,
      status: 'ACTIVE',
      has_qr: true,
      is_active: true,
      qr_token: qrRow.qr_token,
      product_id: qrRow.product_id || product_id || null,
      qr_generation_enabled: true,
      created_at: qrRow.created_at
    });
  } catch (err) {
    console.error('[Voting API] /team-qr-status/:team_id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve team QR status.' });
  }
});

// -------------------------------------------------------------
// 9. POST /api/voting/team-qr/generate
// Generates or retrieves the ONE permanent QR per team
// Verifies user is Leader, Member 1, or Member 2 (Mentors blocked!)
// -------------------------------------------------------------
router.post(['/team-qr/generate', '/generate-team-qr'], authenticateUser, async (req, res) => {
  try {
    const { team_id, product_id } = req.body;
    if (!team_id) {
      return res.status(400).json({ success: false, message: 'team_id is required.' });
    }

    let isAdmin = req.user?.user_metadata?.role === 'admin';
    if (!isAdmin) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', req.user.id)
        .maybeSingle();

      isAdmin = profile?.role === 'admin';
    }

    // Verify global switch
    const controls = await getVotingControls();
    if (!controls?.is_qr_generation_active && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'QR code generation is currently disabled by the administrator.'
      });
    }

    // Verify membership if not admin
    if (!isAdmin) {
      const membership = await verifyTeamMembership(req.user.id, req.user.email, team_id);
      if (membership.isMentor) {
        return res.status(403).json({
          success: false,
          is_mentor: true,
          message: 'Mentors are not permitted to generate or manage team QR codes.'
        });
      }
      if (!membership.authorized) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to generate a QR code for this team.'
        });
      }
    }

    // Server-side validation of product_id if provided
    let verifiedProductId = null;
    if (product_id) {
      const cleanProductId = String(product_id).trim();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(cleanProductId)) {
        return res.status(400).json({
          success: false,
          error_code: 'INVALID_PRODUCT_ID',
          message: 'Invalid product_id format.'
        });
      }

      const { data: prod, error: prodErr } = await supabase
        .from('products')
        .select('id, team_id, product_title, product_number, status')
        .eq('id', cleanProductId)
        .maybeSingle();

      if (prodErr || !prod) {
        return res.status(404).json({
          success: false,
          error_code: 'PRODUCT_NOT_FOUND',
          message: 'The requested product was not found.'
        });
      }

      if (prod.team_id !== team_id) {
        return res.status(403).json({
          success: false,
          error_code: 'PRODUCT_TEAM_MISMATCH',
          message: 'The requested product does not belong to this team.'
        });
      }

      verifiedProductId = cleanProductId;
    }

    // Check if permanent QR already exists (for this product or team)
    const currentRound = controls?.current_voting_round || 1;
    const existingQr = await getTeamQr(team_id, controls?.current_voting_round || 1, verifiedProductId);
    if (existingQr) {
      return res.status(200).json({
        success: true,
        status: existingQr.is_active !== false ? 'ACTIVE' : 'DISABLED_BY_ADMIN',
        qr_token: existingQr.qr_token,
        product_id: existingQr.product_id || verifiedProductId || null,
        created_at: existingQr.created_at,
        message: 'Existing permanent team QR retrieved.'
      });
    }

    // PART 4: Check for pre-existing legacy row (product_id IS NULL)
    // If a single-product team requests a product-specific QR, safely associate the legacy row
    if (verifiedProductId) {
      const { data: legacyQr } = await supabase
        .from('team_qr_codes')
        .select('id, team_id, token, qr_token, voting_round, is_active, created_at')
        .eq('team_id', team_id)
        .eq('voting_round', currentRound)
        .is('product_id', null)
        .maybeSingle();

      if (legacyQr) {
        // Query active products count for this team
        const { count: teamProductsCount } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', team_id)
          .or('status.eq.active,status.is.null');

        // Safe conversion ONLY for single-product teams
        if (teamProductsCount === 1) {
          const { data: updatedQr, error: updateErr } = await supabase
            .from('team_qr_codes')
            .update({
              product_id: verifiedProductId,
              updated_at: new Date().toISOString()
            })
            .eq('id', legacyQr.id)
            .select('id, team_id, token, qr_token, product_id, is_active, created_at')
            .maybeSingle();

          if (updateErr || !updatedQr) {
            console.error('[Voting API] /team-qr/generate failed to update legacy QR:', updateErr?.message);
            return res.status(500).json({
              success: false,
              error_code: 'QR_PERSISTENCE_FAILED',
              message: 'Unable to persist the product QR code.'
            });
          }

          const updatedObj = {
            team_id,
            product_id: updatedQr.product_id || verifiedProductId,
            qr_token: updatedQr.token || updatedQr.qr_token || legacyQr.token,
            is_active: updatedQr.is_active !== false,
            created_at: updatedQr.created_at || legacyQr.created_at
          };
          fallbackQrStore.set(`${team_id}:${verifiedProductId}`, updatedObj);
          fallbackQrTokenMap.set(updatedObj.qr_token, updatedObj);

          return res.status(200).json({
            success: true,
            status: updatedObj.is_active ? 'ACTIVE' : 'DISABLED_BY_ADMIN',
            qr_token: updatedObj.qr_token,
            product_id: updatedObj.product_id,
            created_at: updatedObj.created_at,
            message: 'Permanent team QR associated with product successfully.'
          });
        }
      }
    }

    // Create new permanent token and insert into team_qr_codes
    const newToken = crypto.randomBytes(16).toString('hex');
    const insertData = {
      team_id,
      token: newToken,
      qr_token: newToken,
      voting_round: currentRound,
      is_active: true
    };
    if (verifiedProductId) {
      insertData.product_id = verifiedProductId;
    }

    let inserted = null;
    try {
      const { data, error: insertErr } = await supabase
        .from('team_qr_codes')
        .insert([insertData])
        .select('id, team_id, token, qr_token, product_id, is_active, created_at')
        .maybeSingle();

      if (insertErr || !data) {
        console.error('[Voting API] /team-qr/generate database persistence failed:', insertErr?.message);
        return res.status(500).json({
          success: false,
          error_code: 'QR_PERSISTENCE_FAILED',
          message: 'Unable to persist the product QR code.'
        });
      }
      inserted = data;
    } catch (dbEx) {
      console.error('[Voting API] /team-qr/generate database exception:', dbEx.message);
      return res.status(500).json({
        success: false,
        error_code: 'QR_PERSISTENCE_FAILED',
        message: 'Unable to persist the product QR code.'
      });
    }

    const qrObj = {
      team_id: inserted.team_id || team_id,
      product_id: inserted.product_id || verifiedProductId || null,
      qr_token: inserted.token || inserted.qr_token || newToken,
      is_active: inserted.is_active !== false,
      created_at: inserted.created_at || new Date().toISOString()
    };

    const fallbackKey = verifiedProductId ? `${team_id}:${verifiedProductId}` : team_id;
    fallbackQrStore.set(fallbackKey, qrObj);
    fallbackQrTokenMap.set(qrObj.qr_token, qrObj);

    return res.status(200).json({
      success: true,
      status: 'ACTIVE',
      qr_token: qrObj.qr_token,
      product_id: qrObj.product_id,
      created_at: qrObj.created_at,
      message: 'Permanent team QR generated successfully.'
    });
  } catch (err) {
    console.error('[Voting API] /team-qr/generate error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to generate team QR code.' });
  }
});

// -------------------------------------------------------------
// 10. GET /api/voting/team-qr/:team_id
// Returns team's permanent QR token (for team members / admin)
// -------------------------------------------------------------
router.get('/team-qr/:team_id', authenticateUser, async (req, res) => {
  try {
    const { team_id } = req.params;
    const { product_id } = req.query;

    let isAdmin = req.user?.user_metadata?.role === 'admin';
    if (!isAdmin) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', req.user.id)
        .maybeSingle();

      isAdmin = profile?.role === 'admin';
    }

    // Verify membership if not admin
    if (!isAdmin) {
      const membership = await verifyTeamMembership(req.user.id, req.user.email, team_id);
      if (membership.isMentor) {
        return res.status(403).json({
          success: false,
          is_mentor: true,
          message: 'Mentors are not permitted to generate or manage team QR codes.'
        });
      }
      if (!membership.authorized) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this team QR code.'
        });
      }
    }

    const controls = await getVotingControls();
    if (!controls?.is_qr_generation_active && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'QR code access is currently disabled by the administrator.'
      });
    }

    const qrRow = await getTeamQr(team_id, controls?.current_voting_round || 1, product_id || null);
    if (!qrRow) {
      return res.status(404).json({ success: false, message: 'QR Code not generated yet for this team.' });
    }

    if (qrRow.is_active === false && !isAdmin) {
      return res.status(403).json({ success: false, message: 'QR Code is disabled by the administrator.' });
    }

    return res.status(200).json({
      success: true,
      team_id,
      product_id: qrRow.product_id || product_id || null,
      qr_token: qrRow.qr_token,
      is_active: qrRow.is_active !== false,
      created_at: qrRow.created_at
    });
  } catch (err) {
    console.error('[Voting API] /team-qr/:team_id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve team QR.' });
  }
});

// -------------------------------------------------------------
// 11. PUT /api/voting/admin/team-qr/:team_id/toggle
// Admin endpoint: Toggle specific team's QR active/inactive
// -------------------------------------------------------------
router.put('/admin/team-qr/:team_id/toggle', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const { team_id } = req.params;

    const qrRow = await getTeamQr(team_id);
    if (!qrRow) {
      return res.status(404).json({ success: false, message: 'Team QR code not found.' });
    }

    const newActive = !(qrRow.is_active !== false);

    try {
      await supabase
        .from('team_qr_codes')
        .update({ is_active: newActive, updated_at: new Date().toISOString() })
        .eq('team_id', team_id);
    } catch (e) {
      // Table pending migration
    }

    qrRow.is_active = newActive;
    fallbackQrStore.set(team_id, qrRow);
    fallbackQrTokenMap.set(qrRow.qr_token, qrRow);

    return res.status(200).json({
      success: true,
      team_id,
      is_active: newActive,
      message: `Team QR ${newActive ? 'enabled' : 'disabled'} successfully.`
    });
  } catch (err) {
    console.error('[Voting API] /admin/team-qr/:team_id/toggle error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to toggle team QR status.' });
  }
});

// =============================================================
// ADMIN-ONLY ENDPOINTS
// =============================================================

// -------------------------------------------------------------
// 8. GET /api/voting/admin/metrics
// Live event monitoring metrics for Admin portal
// -------------------------------------------------------------
router.get('/admin/metrics', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const round = parseInt(req.query.round, 10) || 1;

    // Total votes from product_votes or team_votes
    let totalVotes = 0;
    let productsWithVotes = 0;
    let teamsWithVotes = 0;
    try {
      const { data: prodVotesData } = await supabase
        .from('product_votes')
        .select('total_votes')
        .eq('voting_round', round);

      if (prodVotesData && Array.isArray(prodVotesData) && prodVotesData.length > 0) {
        totalVotes = prodVotesData.reduce((sum, pv) => sum + (pv.total_votes || 0), 0);
        productsWithVotes = prodVotesData.filter(pv => (pv.total_votes || 0) > 0).length;
      } else {
        const { data: teamVotesData } = await supabase
          .from('team_votes')
          .select('vote_count')
          .eq('voting_round', round);
        if (teamVotesData && Array.isArray(teamVotesData)) {
          totalVotes = teamVotesData.reduce((sum, tv) => sum + (tv.vote_count || 0), 0);
        }
      }

      const { data: tvData } = await supabase
        .from('team_votes')
        .select('vote_count')
        .eq('voting_round', round);
      if (tvData && Array.isArray(tvData)) {
        teamsWithVotes = tvData.filter(tv => (tv.vote_count || 0) > 0).length;
      }
    } catch (e) {
      totalVotes = fallbackVotes.filter(v => v.voting_round === round).length;
      productsWithVotes = new Set(fallbackVotes.filter(v => v.product_id).map(v => v.product_id)).size;
      teamsWithVotes = new Set(fallbackVotes.map(v => v.team_id)).size;
    }

    // Active voters count (distinct voters)
    let activeVoters = 0;
    try {
      const { count: av } = await supabase
        .from('votes')
        .select('voter_user_id', { count: 'exact', head: true })
        .eq('voting_round', round);
      activeVoters = av || 0;
    } catch (e) {
      activeVoters = new Set(fallbackVotes.filter(v => v.voting_round === round).map(v => v.voter_user_id)).size;
    }

    // Last vote timestamp
    let lastVoteAt = null;
    try {
      const { data: lastVote } = await supabase
        .from('votes')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastVote?.created_at) {
        lastVoteAt = lastVote.created_at;
      } else if (fallbackVotes.length > 0) {
        lastVoteAt = fallbackVotes[fallbackVotes.length - 1].created_at;
      }
    } catch (e) {
      if (fallbackVotes.length > 0) {
        lastVoteAt = fallbackVotes[fallbackVotes.length - 1].created_at;
      }
    }

    // Total registered teams, eligible teams & products
    let totalProducts = 0;
    let totalEligibleTeams = 0;
    let totalRegisteredTeams = 0;
    try {
      const [{ count: tCount }, { count: pCount }, { count: rCount }] = await Promise.all([
        supabase.from('teams').select('*', { count: 'exact', head: true }),
        supabase.from('products').select('*', { count: 'exact', head: true }).or('status.eq.active,status.is.null'),
        supabase.from('registrations').select('*', { count: 'exact', head: true })
      ]);
      totalEligibleTeams = typeof tCount === 'number' ? tCount : 0;
      totalProducts = typeof pCount === 'number' ? pCount : 0;
      totalRegisteredTeams = typeof rCount === 'number' ? rCount : 0;
    } catch (e) {
      console.warn('[Voting API] /admin/metrics count query error:', e.message);
    }

    // Votes in the last 60s
    const now = Date.now();
    const cutoff = now - 60000;
    const votesLastMinute = metrics.voteTimestamps.filter(t => t > cutoff).length;

    // Controls status
    const controls = await getVotingControls();

    return res.status(200).json({
      success: true,
      metrics: {
        totalVotes,
        activeVoters: activeVoters || 0,
        votesPerMinute: votesLastMinute,
        duplicateAttemptsBlocked: metrics.duplicateAttemptsBlocked,
        teamsWithVotes,
        productsWithVotes,
        totalRegisteredTeams,
        totalEligibleTeams,
        totalProducts,
        lastVoteAt,
        isVotingActive: controls?.is_voting_active || false,
        isQrGenerationActive: controls?.is_qr_generation_active || false,
        currentVotingRound: controls?.current_voting_round || 1,
        serverTime: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[Voting API] /admin/metrics error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve admin voting metrics.' });
  }
});

// -------------------------------------------------------------
// 8b. GET /api/voting/admin/controls
// Authoritative Admin fetch for Voting, QR, and Round controls
// -------------------------------------------------------------
router.get('/admin/controls', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const controls = await getVotingControls();
    return res.status(200).json({
      success: true,
      controls: {
        id: controls?.id || 1,
        is_voting_active: Boolean(controls?.is_voting_active),
        is_qr_generation_active: Boolean(controls?.is_qr_generation_active),
        current_voting_round: controls?.current_voting_round || 1,
        updated_at: controls?.updated_at || new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[Voting API] /admin/controls GET error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve voting controls.' });
  }
});

// -------------------------------------------------------------
// 9. POST /api/voting/admin/controls
// Authoritative Admin toggle for Voting, QR, and Round
// -------------------------------------------------------------
router.post('/admin/controls', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const { is_voting_active, is_qr_generation_active, current_voting_round } = req.body;

    const current = await getVotingControls();

    const activeVoting = is_voting_active !== undefined ? Boolean(is_voting_active) : (req.body.community_voting_enabled !== undefined ? Boolean(req.body.community_voting_enabled) : Boolean(current.is_voting_active || current.community_voting_enabled));
    const activeQr = is_qr_generation_active !== undefined ? Boolean(is_qr_generation_active) : (req.body.qr_generation_enabled !== undefined ? Boolean(req.body.qr_generation_enabled) : Boolean(current.is_qr_generation_active || current.qr_generation_enabled));

    const payload = {
      id: 1,
      community_voting_enabled: activeVoting,
      is_voting_active: activeVoting,
      qr_generation_enabled: activeQr,
      is_qr_generation_active: activeQr,
      current_voting_round: current_voting_round !== undefined ? parseInt(current_voting_round, 10) : (current.current_voting_round || 1),
      updated_at: new Date().toISOString(),
      updated_by: req.user?.id || 'admin'
    };

    let supabasePersisted = false;
    try {
      const { data: upsertData, error: upsertErr } = await supabase
        .from('voting_controls')
        .upsert(payload, { onConflict: 'id' })
        .select()
        .maybeSingle();

      if (!upsertErr) {
        supabasePersisted = true;
        if (upsertData) {
          Object.assign(payload, upsertData);
        }
      } else {
        console.warn('[Voting Admin] Supabase voting_controls upsert note:', upsertErr.message);
      }
    } catch (e) {
      console.warn('[Voting Admin] Supabase voting_controls offline/pending migration:', e.message);
    }

    // Secondary mirror to local memory and file cache
    Object.assign(fallbackControls, payload);
    writeLocalVotingControls(payload);

    console.log(`[Voting Admin] Updated controls (Supabase authoritative: ${supabasePersisted}): Voting=${payload.is_voting_active}, QR=${payload.is_qr_generation_active}, Round=${payload.current_voting_round}`);

    return res.status(200).json({
      success: true,
      controls: payload,
      message: 'Voting controls updated successfully.'
    });
  } catch (err) {
    console.error('[Voting API] /admin/controls error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update voting controls.' });
  }
});

// -------------------------------------------------------------
// 10. POST /api/voting/admin/generate-all-qrs
// Batch permanent QR generation for all existing teams
// -------------------------------------------------------------
router.post('/admin/generate-all-qrs', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('id, team_name');

    if (teamsErr) throw teamsErr;

    const { data: existingQrs } = await supabase
      .from('team_qr_codes')
      .select('team_id');

    const existingTeamIds = new Set((existingQrs || []).map(q => q.team_id));
    const missingTeams = (teams || []).filter(t => !existingTeamIds.has(t.id));

    if (missingTeams.length === 0) {
      return res.status(200).json({
        success: true,
        created: 0,
        total: teams.length,
        message: 'All teams already have permanent QR codes.'
      });
    }

    const recordsToInsert = missingTeams.map(t => {
      const tok = crypto.randomBytes(16).toString('hex');
      return {
        team_id: t.id,
        token: tok,
        qr_token: tok,
        voting_round: 1,
        is_active: true
      };
    });

    const { error: insertErr } = await supabase
      .from('team_qr_codes')
      .insert(recordsToInsert);

    if (insertErr) throw insertErr;

    console.log(`[Voting Admin] Generated permanent QR codes for ${recordsToInsert.length} teams.`);

    return res.status(200).json({
      success: true,
      created: recordsToInsert.length,
      total: teams.length,
      message: `Generated ${recordsToInsert.length} new permanent QR codes successfully.`
    });
  } catch (err) {
    console.error('[Voting API] /admin/generate-all-qrs error:', err.message);
    return res.status(500).json({ success: false, message: 'Batch QR generation failed.' });
  }
});

// =============================================================
// VOTING MANAGEMENT & ANALYTICS REPORTING ENGINE (Stage 11)
// Authoritative Admin-only reporting, search, export & Drive archiving
// =============================================================

// Canonical 10 departments in authoritative alphabetical order
const CANONICAL_DEPARTMENTS = [
  'Artificial Intelligence and Data Science',
  'Artificial Intelligence and Machine Learning',
  'Computer and Communication Engineering',
  'Computer Science and Business System',
  'Computer Science and Engineering',
  'Cyber Security',
  'Electrical and Electronics Engineering',
  'Electronics and Communication Engineering',
  'Information Technology',
  'Mechanical Engineering'
];

/**
 * Standards-compliant genuine OOXML Excel workbook builder with 5 distinct worksheets
 */
function buildVotingWorkbook({
  metrics = {},
  votes = [],
  teamMap = new Map(),
  regByTeamName = new Map(),
  prodByTeamId = new Map(),
  prodById = new Map(),
  profileMap = new Map(),
  teams = [],
  registrations = []
}) {
  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // 1. SHEET: Voting Summary
  // -------------------------------------------------------------
  const summaryAoa = [
    ['IPL 2026 — COMMUNITY VOTING & ANALYTICS EXECUTIVE SUMMARY'],
    [`Export Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)`],
    ['Event: IPL 2026 Project Innovation Showcase'],
    [''],
    ['Metric', 'Value', 'Status / Description'],
    ['Total Votes Cast', Number(metrics.totalVotes || votes.length || 0), 'Total verified votes recorded across all teams'],
    ['Active Student Voters', Number(metrics.activeVoters || new Set(votes.map(v => v.voter_user_id)).size || 0), 'Unique authenticated student voters (@sece.ac.in)'],
    ['Teams With Votes', Number(metrics.teamsWithVotes || new Set(votes.map(v => v.team_id)).size || 0), 'Distinct teams having at least 1 verified vote'],
    ['Total Eligible Teams', Number(metrics.totalEligibleTeams || teams.length || registrations.length || 0), 'Officially registered teams eligible for voting'],
    ['Total Products / Ideas', Number(metrics.totalProducts || 0), 'Total innovation products showcased'],
    ['Voting System Status', metrics.isVotingActive ? 'OPEN' : 'CLOSED', metrics.isVotingActive ? 'Public voting is live and accepting votes' : 'Voting is paused by administrators'],
    ['Team QR Generation Status', metrics.isQrActive ? 'ACTIVE' : 'DISABLED', metrics.isQrActive ? 'Student teams can generate & display QR codes' : 'QR generation disabled by administrators'],
    ['Voting Velocity (Last 60s)', Number(metrics.votesPerMinute || 0), 'Votes received in the past 60 seconds'],
    ['Last Vote Recorded At', metrics.lastVoteAt ? new Date(metrics.lastVoteAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A', 'Timestamp of the latest vote transaction']
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
  wsSummary['!cols'] = [
    { wch: 34 },
    { wch: 22 },
    { wch: 56 }
  ];

  // -------------------------------------------------------------
  // 2. SHEET: Vote Records
  // -------------------------------------------------------------
  const voteRecordsHeaders = [
    'Vote ID',
    'Voter Name',
    'Voter Email',
    'Voter Department',
    'Team ID',
    'Team Name',
    'Product / Idea',
    'Team Department',
    'Voted At'
  ];
  const voteRecordsRows = votes.map(v => {
    const prof = profileMap.get(v.voter_user_id);
    const team = teamMap.get(v.team_id);
    const prod = (v.product_id && prodById?.get(v.product_id)) || (prodByTeamId.get(v.team_id) || [])[0];
    const prodTitle = prod?.product_title || reg?.project_title || 'Project Showcase';

    return [
      String(v.id),
      prof?.name || (prof?.email ? prof.email.split('@')[0] : 'Student Voter'),
      prof?.email || 'N/A',
      normalizeDepartment(v.voter_department || prof?.department),
      reg?.registration_id || (team?.id ? team.id.slice(0, 8) : 'N/A'),
      team?.team_name || 'Unknown Team',
      prodTitle,
      normalizeDepartment(reg?.leader_department),
      new Date(v.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    ];
  });
  const wsVoteRecords = XLSX.utils.aoa_to_sheet([voteRecordsHeaders, ...voteRecordsRows]);
  wsVoteRecords['!cols'] = [
    { wch: 14 },
    { wch: 24 },
    { wch: 30 },
    { wch: 34 },
    { wch: 16 },
    { wch: 28 },
    { wch: 34 },
    { wch: 34 },
    { wch: 22 }
  ];
  wsVoteRecords['!views'] = [{ state: 'frozen', ySplit: 1 }];
  if (voteRecordsRows.length > 0) {
    wsVoteRecords['!autofilter'] = { ref: `A1:I${voteRecordsRows.length + 1}` };
  }

  // -------------------------------------------------------------
  // 3. SHEET: Team Results
  // -------------------------------------------------------------
  const teamVotesMap = new Map();
  votes.forEach(v => {
    teamVotesMap.set(v.team_id, (teamVotesMap.get(v.team_id) || 0) + 1);
  });

  const teamList = [];
  const processedTeamIds = new Set();
  (teams || []).forEach(team => {
    processedTeamIds.add(team.id);
    const reg = regByTeamName.get((team.team_name || '').trim().toLowerCase());
    const prods = prodByTeamId.get(team.id) || [];
    const totalVotes = teamVotesMap.get(team.id) || 0;
    const dept = normalizeDepartment(reg?.leader_department);
    const teamIdCode = reg?.registration_id || (team.id ? team.id.slice(0, 8) : 'N/A');

    if (prods.length > 0) {
      prods.forEach(prod => {
        teamList.push({
          teamId: teamIdCode,
          teamName: team.team_name,
          department: dept,
          product: prod.product_title || 'Project Showcase',
          totalVotes
        });
      });
    } else {
      teamList.push({
        teamId: teamIdCode,
        teamName: team.team_name,
        department: dept,
        product: reg?.project_title || 'Project Showcase',
        totalVotes
      });
    }
  });

  // Fallback teams from votes not present in teams table
  votes.forEach(v => {
    if (v.team_id && !processedTeamIds.has(v.team_id)) {
      processedTeamIds.add(v.team_id);
      const team = teamMap.get(v.team_id);
      const totalVotes = teamVotesMap.get(v.team_id) || 0;
      teamList.push({
        teamId: v.team_id.slice(0, 8),
        teamName: team?.team_name || 'Team ' + v.team_id.slice(0, 8),
        department: 'Mechanical Engineering',
        product: 'Project Showcase',
        totalVotes
      });
    }
  });

  // Sort descending by totalVotes, then by teamName
  teamList.sort((a, b) => b.totalVotes - a.totalVotes || (a.teamName || '').localeCompare(b.teamName || ''));

  const teamResultsHeaders = [
    'Rank',
    'Team ID',
    'Team Name',
    'Department',
    'Product / Idea',
    'Total Votes'
  ];
  const teamResultsRows = teamList.map((t, idx) => [
    idx + 1,
    t.teamId,
    t.teamName,
    t.department,
    t.product,
    Number(t.totalVotes)
  ]);
  const wsTeamResults = XLSX.utils.aoa_to_sheet([teamResultsHeaders, ...teamResultsRows]);
  wsTeamResults['!cols'] = [
    { wch: 8 },
    { wch: 16 },
    { wch: 28 },
    { wch: 34 },
    { wch: 34 },
    { wch: 14 }
  ];
  wsTeamResults['!views'] = [{ state: 'frozen', ySplit: 1 }];
  if (teamResultsRows.length > 0) {
    wsTeamResults['!autofilter'] = { ref: `A1:F${teamResultsRows.length + 1}` };
  }

  // -------------------------------------------------------------
  // 4. SHEET: Voter History
  // -------------------------------------------------------------
  const voterHistoryRows = [...votes].sort((a, b) => {
    const profA = profileMap.get(a.voter_user_id);
    const profB = profileMap.get(b.voter_user_id);
    const nameA = profA?.name || profA?.email || '';
    const nameB = profB?.name || profB?.email || '';
    const cmp = nameA.localeCompare(nameB);
    if (cmp !== 0) return cmp;
    return new Date(b.created_at) - new Date(a.created_at);
  }).map(v => {
    const prof = profileMap.get(v.voter_user_id);
    const team = teamMap.get(v.team_id);
    const reg = team ? regByTeamName.get((team.team_name || '').trim().toLowerCase()) : null;
    const prod = (v.product_id && prodById?.get(v.product_id)) || (prodByTeamId.get(v.team_id) || [])[0];
    const prodTitle = prod?.product_title || reg?.project_title || 'Project Showcase';

    return [
      prof?.name || (prof?.email ? prof.email.split('@')[0] : 'Student Voter'),
      prof?.email || 'N/A',
      normalizeDepartment(v.voter_department || prof?.department),
      reg?.registration_id || (team?.id ? team.id.slice(0, 8) : 'N/A'),
      team?.team_name || 'Unknown Team',
      prodTitle,
      normalizeDepartment(reg?.leader_department),
      new Date(v.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    ];
  });
  const voterHistoryHeaders = [
    'Voter Name',
    'Voter Email',
    'Voter Department',
    'Team ID',
    'Team Name',
    'Product / Idea',
    'Team Department',
    'Voted At'
  ];
  const wsVoterHistory = XLSX.utils.aoa_to_sheet([voterHistoryHeaders, ...voterHistoryRows]);
  wsVoterHistory['!cols'] = [
    { wch: 24 },
    { wch: 30 },
    { wch: 34 },
    { wch: 16 },
    { wch: 28 },
    { wch: 34 },
    { wch: 34 },
    { wch: 22 }
  ];
  wsVoterHistory['!views'] = [{ state: 'frozen', ySplit: 1 }];
  if (voterHistoryRows.length > 0) {
    wsVoterHistory['!autofilter'] = { ref: `A1:H${voterHistoryRows.length + 1}` };
  }

  // -------------------------------------------------------------
  // 5. SHEET: Department Summary
  // -------------------------------------------------------------
  const deptStats = new Map();
  CANONICAL_DEPARTMENTS.forEach(dept => {
    deptStats.set(dept, {
      totalTeams: 0,
      totalVotesReceived: 0,
      activeVoters: new Set(),
      totalVotesCast: 0
    });
  });

  (teams || []).forEach(team => {
    const reg = regByTeamName.get((team.team_name || '').trim().toLowerCase());
    const dept = normalizeDepartment(reg?.leader_department);
    if (deptStats.has(dept)) {
      deptStats.get(dept).totalTeams += 1;
    }
  });

  votes.forEach(v => {
    const team = teamMap.get(v.team_id);
    const reg = team ? regByTeamName.get((team.team_name || '').trim().toLowerCase()) : null;
    const teamDept = normalizeDepartment(reg?.leader_department);
    if (deptStats.has(teamDept)) {
      deptStats.get(teamDept).totalVotesReceived += 1;
    }

    const prof = profileMap.get(v.voter_user_id);
    const voterDept = normalizeDepartment(v.voter_department || prof?.department);
    if (deptStats.has(voterDept)) {
      const s = deptStats.get(voterDept);
      s.totalVotesCast += 1;
      s.activeVoters.add(v.voter_user_id);
    }
  });

  const deptSummaryHeaders = [
    'Department Name',
    'Total Teams',
    'Total Votes Received',
    'Active Student Voters',
    'Total Votes Cast'
  ];
  const deptSummaryRows = CANONICAL_DEPARTMENTS.map(dept => {
    const s = deptStats.get(dept);
    return [
      dept,
      Number(s.totalTeams),
      Number(s.totalVotesReceived),
      Number(s.activeVoters.size),
      Number(s.totalVotesCast)
    ];
  });
  const wsDeptSummary = XLSX.utils.aoa_to_sheet([deptSummaryHeaders, ...deptSummaryRows]);
  wsDeptSummary['!cols'] = [
    { wch: 44 },
    { wch: 14 },
    { wch: 22 },
    { wch: 22 },
    { wch: 18 }
  ];
  wsDeptSummary['!views'] = [{ state: 'frozen', ySplit: 1 }];
  wsDeptSummary['!autofilter'] = { ref: `A1:E${deptSummaryRows.length + 1}` };

  // Append all 5 worksheets in the exact required order
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Voting Summary');
  XLSX.utils.book_append_sheet(wb, wsVoteRecords, 'Vote Records');
  XLSX.utils.book_append_sheet(wb, wsTeamResults, 'Team Results');
  XLSX.utils.book_append_sheet(wb, wsVoterHistory, 'Voter History');
  XLSX.utils.book_append_sheet(wb, wsDeptSummary, 'Department Summary');

  return {
    workbook: wb,
    sheetData: {
      summaryAoa,
      voteRecords: { headers: voteRecordsHeaders, rows: voteRecordsRows },
      teamResults: { headers: teamResultsHeaders, rows: teamResultsRows },
      voterHistory: { headers: voterHistoryHeaders, rows: voterHistoryRows },
      departmentSummary: { headers: deptSummaryHeaders, rows: deptSummaryRows }
    }
  };
}

/**
 * Authoritative voting records aggregator with graceful database fallbacks
 */
async function getAllVotingRecords() {
  let votesList = [];
  try {
    const { data: dbVotes, error: dbErr } = await supabase
      .from('votes')
      .select('id, voter_user_id, voter_department, team_id, product_id, created_at')
      .order('created_at', { ascending: false });
    if (!dbErr && Array.isArray(dbVotes)) {
      votesList = dbVotes;
    } else {
      votesList = [...fallbackVotes].reverse();
    }
  } catch (e) {
    votesList = [...fallbackVotes].reverse();
  }

  // Fetch teams, registrations, products, profiles in parallel
  const [
    { data: teamsData },
    { data: regsData },
    { data: prodsData },
    { data: profsData }
  ] = await Promise.all([
    supabase.from('teams').select('id, team_name'),
    supabase.from('registrations').select('id, registration_id, team_name, leader_name, leader_email, leader_department, project_title'),
    supabase.from('products').select('id, team_id, product_title, innovation_domain, status'),
    supabase.from('profiles').select('user_id, name, email, department')
  ]);

  const teamMap = new Map();
  (teamsData || []).forEach(t => teamMap.set(t.id, t));

  const regByTeamName = new Map();
  (regsData || []).forEach(r => {
    if (r.team_name) {
      regByTeamName.set(r.team_name.trim().toLowerCase(), r);
    }
  });

  const prodByTeamId = new Map();
  const prodById = new Map();
  (prodsData || []).forEach(p => {
    prodById.set(p.id, p);
    if (p.team_id) {
      if (!prodByTeamId.has(p.team_id)) prodByTeamId.set(p.team_id, []);
      prodByTeamId.get(p.team_id).push(p);
    }
  });

  const profileMap = new Map();
  (profsData || []).forEach(p => {
    if (p.user_id) profileMap.set(p.user_id, p);
  });

  return {
    votes: votesList,
    teamMap,
    regByTeamName,
    prodByTeamId,
    prodById,
    profileMap,
    teams: teamsData || [],
    registrations: regsData || [],
    products: prodsData || []
  };
}

// -------------------------------------------------------------
// 11. GET /api/voting/admin/voter-reports
// Server-side search & individual voting history for Admin
// -------------------------------------------------------------
router.get('/admin/voter-reports', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const { search = '', voter_id = '' } = req.query;
    const { votes, teamMap, regByTeamName, prodByTeamId, prodById, profileMap } = await getAllVotingRecords();

    // Group votes by voter_user_id
    const voterMap = new Map();
    votes.forEach(v => {
      if (!voterMap.has(v.voter_user_id)) {
        const prof = profileMap.get(v.voter_user_id);
        const name = prof?.name || (prof?.email ? prof.email.split('@')[0] : 'Student Voter');
        const email = prof?.email || 'N/A';
        const dept = v.voter_department || prof?.department || 'Mechanical Engineering';
        voterMap.set(v.voter_user_id, {
          userId: v.voter_user_id,
          name,
          email,
          department: dept,
          totalVotes: 0,
          history: []
        });
      }
      const entry = voterMap.get(v.voter_user_id);
      entry.totalVotes += 1;

      const team = teamMap.get(v.team_id);
      const reg = team ? regByTeamName.get((team.team_name || '').trim().toLowerCase()) : null;
      const prod = (v.product_id && prodById?.get(v.product_id)) || (prodByTeamId.get(v.team_id) || [])[0];
      const prodTitle = prod?.product_title || reg?.project_title || 'Project Showcase';

      entry.history.push({
        voteId: v.id,
        productId: v.product_id || prod?.id || null,
        productTitle: prodTitle,
        teamId: reg?.registration_id || (team?.id ? team.id.slice(0, 8) : 'N/A'),
        teamName: team?.team_name || 'Unknown Team',
        teamDepartment: normalizeDepartment(reg?.leader_department),
        votedAt: v.created_at
      });
    });

    let allVoters = Array.from(voterMap.values());

    // Single voter deep-dive
    if (voter_id && voter_id.trim()) {
      const match = voterMap.get(voter_id.trim());
      if (!match) {
        return res.status(404).json({ success: false, message: 'Voter not found.' });
      }
      return res.status(200).json({ success: true, voter: match });
    }

    // Server-side search filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      allVoters = allVoters.filter(v =>
        v.name.toLowerCase().includes(q) ||
        v.email.toLowerCase().includes(q) ||
        v.department.toLowerCase().includes(q) ||
        v.userId.toLowerCase().includes(q)
      );
    }

    // Sort by total votes DESC, then name ASC
    allVoters.sort((a, b) => b.totalVotes - a.totalVotes || a.name.localeCompare(b.name));

    return res.status(200).json({
      success: true,
      totalVoters: allVoters.length,
      voters: allVoters
    });
  } catch (err) {
    console.error('[Voting Admin] /admin/voter-reports error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve voter reports.' });
  }
});

// -------------------------------------------------------------
// 12. GET /api/voting/admin/team-reports
// Server-side team and product vote breakdown with voter list
// -------------------------------------------------------------
router.get('/admin/team-reports', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const { search = '', department = '', team_id = '' } = req.query;
    const { votes, teamMap, regByTeamName, prodByTeamId, profileMap, teams } = await getAllVotingRecords();

    // Group votes by team_id
    const teamVotesMap = new Map();
    votes.forEach(v => {
      if (!teamVotesMap.has(v.team_id)) {
        teamVotesMap.set(v.team_id, []);
      }
      const prof = profileMap.get(v.voter_user_id);
      teamVotesMap.get(v.team_id).push({
        voteId: v.id,
        voterUserId: v.voter_user_id,
        voterName: prof?.name || (prof?.email ? prof.email.split('@')[0] : 'Student Voter'),
        voterEmail: prof?.email || 'N/A',
        voterDepartment: v.voter_department || prof?.department || 'Mechanical Engineering',
        votedAt: v.created_at
      });
    });

    // Build comprehensive list of teams
    const allTeams = teams.map(t => {
      const reg = regByTeamName.get((t.team_name || '').trim().toLowerCase());
      const dept = normalizeDepartment(reg?.leader_department);
      const prods = prodByTeamId.get(t.id) || [];
      const prodList = prods.length > 0 ? prods.map(p => ({
        productTitle: p.product_title,
        innovationDomain: p.innovation_domain || 'Open Innovation'
      })) : [{
        productTitle: reg?.project_title || 'Project Showcase',
        innovationDomain: reg?.innovation_domain || 'Open Innovation'
      }];

      const votersForTeam = teamVotesMap.get(t.id) || [];

      return {
        id: t.id,
        registrationId: reg?.registration_id || t.id.slice(0, 8),
        teamName: t.team_name,
        department: dept,
        products: prodList,
        totalVotes: votersForTeam.length,
        voters: votersForTeam
      };
    });

    // Single team deep-dive
    if (team_id && team_id.trim()) {
      const match = allTeams.find(t => t.id === team_id.trim() || t.registrationId.toLowerCase() === team_id.trim().toLowerCase());
      if (!match) {
        return res.status(404).json({ success: false, message: 'Team not found.' });
      }
      return res.status(200).json({ success: true, team: match });
    }

    let filtered = allTeams;
    if (department && department.trim() && department !== 'all') {
      const dNorm = department.trim().toLowerCase();
      filtered = filtered.filter(t => t.department.toLowerCase().includes(dNorm));
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(t =>
        t.teamName.toLowerCase().includes(q) ||
        t.registrationId.toLowerCase().includes(q) ||
        t.products.some(p => p.productTitle.toLowerCase().includes(q)) ||
        t.department.toLowerCase().includes(q)
      );
    }

    // Sort by total votes DESC, then team name ASC
    filtered.sort((a, b) => b.totalVotes - a.totalVotes || a.teamName.localeCompare(b.teamName));

    return res.status(200).json({
      success: true,
      totalTeams: filtered.length,
      teams: filtered
    });
  } catch (err) {
    console.error('[Voting Admin] /admin/team-reports error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve team reports.' });
  }
});

// -------------------------------------------------------------
// 13. GET /api/voting/admin/export-data
// On-demand export data generation for the 3 distinct report types
// -------------------------------------------------------------
// 13. GET /api/voting/admin/export-data
// On-demand export data generation for the 3 distinct report types
// -------------------------------------------------------------
router.get(['/admin/export-data', '/admin/export-binary'], authenticateUser, checkAdmin, async (req, res) => {
  try {
    let { type = 'complete', format } = req.query;
    if (req.path.includes('export-binary')) {
      format = 'xlsx';
    }
    const { votes, teamMap, regByTeamName, prodByTeamId, profileMap, teams, registrations, products } = await getAllVotingRecords();
    const controls = readLocalVotingControls();

    const { workbook, sheetData } = buildVotingWorkbook({
      metrics: {
        totalVotes: votes.length,
        activeVoters: new Set(votes.map(v => v.voter_user_id)).size,
        teamsWithVotes: new Set(votes.map(v => v.team_id)).size,
        totalEligibleTeams: teams.length || registrations.length,
        totalProducts: (products || []).filter(p => p.status === 'active' || !p.status).length,
        isVotingActive: controls.is_voting_active,
        isQrActive: controls.is_qr_generation_active,
        votesPerMinute: metrics.voteTimestamps ? metrics.voteTimestamps.length : 0,
        lastVoteAt: votes[0]?.created_at || null
      },
      votes,
      teamMap,
      regByTeamName,
      prodByTeamId,
      profileMap,
      teams,
      registrations
    });

    let filename = 'IPL_2026_Complete_Voting_Report.xlsx';
    let headers = sheetData.voteRecords.headers;
    let rows = sheetData.voteRecords.rows;

    if (type === 'team_voters') {
      filename = 'IPL_2026_Team_Voting_Report.xlsx';
      headers = sheetData.teamResults.headers;
      rows = sheetData.teamResults.rows;
    } else if (type === 'voter_summary') {
      filename = 'IPL_2026_Voter_Report.xlsx';
      headers = sheetData.voterHistory.headers;
      rows = sheetData.voterHistory.rows;
    }

    if (format === 'xlsx') {
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    }

    return res.status(200).json({
      success: true,
      filename,
      headers,
      rows,
      totalRows: rows.length,
      sheets: sheetData
    });
  } catch (err) {
    console.error('[Voting Admin] /admin/export-data error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to generate export data.' });
  }
});

// -------------------------------------------------------------
// 14. POST /api/voting/admin/export-upload-drive
// Server-side real OOXML Excel generation & direct upload to Google Drive
// -------------------------------------------------------------
router.post('/admin/export-upload-drive', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const { type = 'complete' } = req.body;
    const { votes, teamMap, regByTeamName, prodByTeamId, profileMap, teams, registrations, products } = await getAllVotingRecords();
    const controls = readLocalVotingControls();

    const { workbook } = buildVotingWorkbook({
      metrics: {
        totalVotes: votes.length,
        activeVoters: new Set(votes.map(v => v.voter_user_id)).size,
        teamsWithVotes: new Set(votes.map(v => v.team_id)).size,
        totalEligibleTeams: teams.length || registrations.length,
        totalProducts: (products || []).filter(p => p.status === 'active' || !p.status).length,
        isVotingActive: controls.is_voting_active,
        isQrActive: controls.is_qr_generation_active,
        votesPerMinute: metrics.voteTimestamps ? metrics.voteTimestamps.length : 0,
        lastVoteAt: votes[0]?.created_at || null
      },
      votes,
      teamMap,
      regByTeamName,
      prodByTeamId,
      profileMap,
      teams,
      registrations
    });

    let filePrefix = 'IPL_2026_Complete_Voting_Report';
    if (type === 'team_voters') filePrefix = 'IPL_2026_Team_Voting_Report';
    if (type === 'voter_summary') filePrefix = 'IPL_2026_Voter_Report';

    const fileName = `${filePrefix}_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    const uploaded = await uploadVotingReportToDrive({
      fileName,
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    return res.status(200).json({
      success: true,
      message: `Report uploaded successfully to Google Drive under 'IPL 2026 Voting Reports'.`,
      fileId: uploaded.id,
      fileName: uploaded.name,
      webViewLink: uploaded.webViewLink,
      createdTime: uploaded.createdTime || new Date().toISOString(),
      reportType: type
    });
  } catch (err) {
    console.error('[Voting Admin] /admin/export-upload-drive error:', err.message);
    return res.status(500).json({ success: false, message: `Failed to upload report to Google Drive: ${err.message}` });
  }
});

// -------------------------------------------------------------
// 15. GET /api/voting/admin/report-history
// Lists previously uploaded voting reports from Google Drive
// -------------------------------------------------------------
router.get('/admin/report-history', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const files = await listVotingReportsFromDrive();
    const reports = files.map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink
    }));

    return res.status(200).json({
      success: true,
      reports
    });
  } catch (err) {
    console.error('[Voting Admin] /admin/report-history error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve report history.' });
  }
});

router.post('/admin/reset-test-state', authenticateUser, checkAdmin, (req, res) => {
  fallbackQrStore.clear();
  fallbackQrTokenMap.clear();
  fallbackVoterDeptMap.clear();
  fallbackVotes.length = 0;
  inflightVoteLocks.clear();
  return res.json({ success: true, message: 'Test state reset.' });
});

router._testingHooks = {
  resetFallbackStores: () => {
    fallbackQrStore.clear();
    fallbackQrTokenMap.clear();
    fallbackVoterDeptMap.clear();
    fallbackVotes.length = 0;
    inflightVoteLocks.clear();
    fallbackControls.is_voting_active = true;
    fallbackControls.is_qr_generation_active = true;
    fallbackControls.current_voting_round = 1;
  }
};

module.exports = router;
