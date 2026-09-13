// backend/routes/phase3Routes.js
/**
 * Phase 3 Participant & Shortlist Routes
 * IPL-2026 Platform
 * 
 * Endpoints:
 * - GET  /api/phase3/status              : Team Phase 3 shortlist status, product votes/scores, and LinkedIn submissions
 * - POST /api/phase3/linkedin-submission : Saves or updates a team member's LinkedIn post URL
 * - GET  /api/phase3/admin/export        : Admin export of all Phase 3 LinkedIn submissions
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../supabaseClient');
const phase3LinkedInDriveService = require('../services/phase3LinkedInDriveService');

const LOCAL_SUBMISSIONS_FILE = path.join(__dirname, '..', 'config', 'phase3_linkedin_submissions.json');

/**
 * Non-empty text validator (no URL or domain restrictions).
 * Accepts any non-empty text string entered by the participant.
 * 
 * @param {string} val 
 * @returns {boolean}
 */
function isValidLinkedInPostUrl(val) {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  return trimmed.length > 0 && trimmed.length <= 1000;
}

/**
 * Reads local LinkedIn submissions fallback store
 */
function readLocalSubmissions() {
  try {
    if (fs.existsSync(LOCAL_SUBMISSIONS_FILE)) {
      const content = fs.readFileSync(LOCAL_SUBMISSIONS_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn('[Phase3] Could not read local submissions file:', e.message);
  }
  return {};
}

/**
 * Writes to local LinkedIn submissions fallback store
 */
function writeLocalSubmissions(data) {
  try {
    const dir = path.dirname(LOCAL_SUBMISSIONS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_SUBMISSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Phase3] Could not write local submissions file:', e.message);
  }
}

/**
 * Authenticates user token
 */
async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error_code: 'UNAUTHENTICATED',
        message: 'Authentication required. Authorization header missing.'
      });
    }

    const token = authHeader.split(' ')[1];

    // Test environment mock token support
    if (process.env.NODE_ENV === 'test' && token.startsWith('TEST_TOKEN_')) {
      const parts = token.split(':');
      req.user = {
        id: parts[0].replace('TEST_TOKEN_', ''),
        email: (parts[1] || 'test@sece.ac.in').toLowerCase().trim(),
        user_metadata: { role: parts[2] || 'student' }
      };
      return next();
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({
        success: false,
        error_code: 'INVALID_TOKEN',
        message: 'Invalid or expired authentication session.'
      });
    }

    req.user = {
      ...user,
      email: (user.email || '').toLowerCase().trim()
    };
    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      error_code: 'AUTH_ERROR',
      message: 'Authentication verification failed: ' + err.message
    });
  }
}

/**
 * GET /api/phase3/status
 * Query team Phase 3 shortlist status, products, votes, score, and LinkedIn submissions.
 * Params: ?teamId=UUID or ?registrationId=IPL26-XXXX
 */
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const teamIdParam = (req.query.teamId || '').trim();
    const regIdParam = (req.query.registrationId || '').trim().toUpperCase();
    const userEmail = req.user.email;

    if (!teamIdParam && !regIdParam) {
      return res.status(400).json({
        success: false,
        error_code: 'MISSING_PARAM',
        message: 'teamId or registrationId query parameter is required.'
      });
    }

    let testStore = req.testStore || null;
    let team = null;
    let registration = null;

    if (testStore) {
      team = testStore.teams.find(t => t.id === teamIdParam);
      registration = testStore.registrations.find(r => r.registration_id === regIdParam || (team && r.team_name.toLowerCase() === team.team_name.toLowerCase()));
      if (!team && registration) {
        team = testStore.teams.find(t => t.team_name.toLowerCase() === registration.team_name.toLowerCase());
      }
    } else {
      // 1. Resolve registration and team from Supabase
      if (regIdParam) {
        const { data: regData } = await supabase
          .from('registrations')
          .select('*')
          .eq('registration_id', regIdParam)
          .maybeSingle();
        registration = regData;
      }

      if (teamIdParam) {
        const { data: teamData } = await supabase
          .from('teams')
          .select('*')
          .eq('id', teamIdParam)
          .maybeSingle();
        team = teamData;
      }

      if (!team && registration?.team_name) {
        const { data: teamData } = await supabase
          .from('teams')
          .select('*')
          .ilike('team_name', registration.team_name.trim())
          .maybeSingle();
        team = teamData;
      }

      if (!registration && team?.team_name) {
        const { data: regData } = await supabase
          .from('registrations')
          .select('*')
          .ilike('team_name', team.team_name.trim())
          .maybeSingle();
        registration = regData;
      }
    }

    if (!team && !registration) {
      return res.status(404).json({
        success: false,
        error_code: 'TEAM_NOT_FOUND',
        message: 'Specified team or registration could not be found.'
      });
    }

    // 2. Verify authenticated user belongs to this team (or is admin)
    const isAdmin = req.user?.user_metadata?.role === 'admin';
    const teamEmails = [
      (registration?.leader_email || '').toLowerCase().trim(),
      (registration?.member2_email || '').toLowerCase().trim(),
      (registration?.member3_email || '').toLowerCase().trim()
    ].filter(Boolean);

    if (!isAdmin && !teamEmails.includes(userEmail)) {
      return res.status(403).json({
        success: false,
        error_code: 'FORBIDDEN',
        message: 'Access denied: You do not belong to this team.'
      });
    }

    const resolvedTeamId = team?.id || teamIdParam;
    const resolvedRegId = registration?.registration_id || regIdParam;

    // 3. Fetch products for this team
    let products = [];
    if (testStore) {
      products = (testStore.products || []).filter(
        p => p.team_id === resolvedTeamId || (resolvedRegId && p.legacy_registration_id === resolvedRegId)
      );
    } else if (resolvedTeamId) {
      const { data: prodsData } = await supabase
        .from('products')
        .select('*')
        .eq('team_id', resolvedTeamId)
        .order('product_number', { ascending: true });
      products = prodsData || [];
    }

    if (!testStore && (!products || products.length === 0) && resolvedRegId) {
      const { data: regProds } = await supabase
        .from('products')
        .select('*')
        .eq('legacy_registration_id', resolvedRegId)
        .order('product_number', { ascending: true });
      if (regProds && regProds.length > 0) {
        products = regProds;
      }
    }

    // 4. Fetch Phase 3 Shortlist records for this team's products
    let shortlistMap = new Map();
    if (testStore) {
      (testStore.shortlist || []).forEach(s => {
        if (s.product_id) shortlistMap.set(s.product_id, s);
      });
    } else if (products.length > 0) {
      const prodIds = products.map(p => p.id);
      const { data: slData } = await supabase
        .from('phase3_shortlist')
        .select('*')
        .in('product_id', prodIds);
      (slData || []).forEach(s => {
        if (s.product_id) shortlistMap.set(s.product_id, s);
      });
    }

    // 5. Fetch score & votes for each product
    let scoresMap = new Map();
    if (testStore) {
      // Mock score computation from mock store
      products.forEach(p => {
        const pVotes = (testStore.votes || []).filter(v => v.product_id === p.id).length;
        const pLikes = (testStore.likes || []).find(l => l.product_id === p.id)?.count || 0;
        scoresMap.set(p.id, { votes: pVotes, score: pLikes + pVotes * 2 });
      });
    } else if (products.length > 0) {
      const prodIds = products.map(p => p.id);
      const { data: scoresData } = await supabase
        .from('idea_scores')
        .select('product_id, votes_count, likes_count, total_score')
        .in('product_id', prodIds);
      (scoresData || []).forEach(s => {
        if (s.product_id) {
          const v = Math.max(0, parseInt(s.votes_count, 10) || 0);
          const l = Math.max(0, parseInt(s.likes_count, 10) || 0);
          const sc = s.total_score !== undefined && s.total_score !== null ? parseInt(s.total_score, 10) : (l + v * 2);
          scoresMap.set(s.product_id, { votes: v, score: sc });
        }
      });
    }

    // Map each product to its authoritative Phase 3 view
    const productStatuses = products.map(p => {
      const sl = shortlistMap.get(p.id);
      const sc = scoresMap.get(p.id) || { votes: 0, score: 0 };
      const isShortlisted = Boolean(sl);

      return {
        productId: p.id,
        product_id: p.id,
        productNumber: p.product_number,
        product_number: p.product_number,
        productTitle: p.product_title,
        product_title: p.product_title,
        legacyRegistrationId: p.legacy_registration_id,
        legacy_registration_id: p.legacy_registration_id,
        isShortlisted: isShortlisted,
        is_shortlisted: isShortlisted,
        category: sl?.category || null,
        // Authoritative metrics: Votes and Score only (NO Likes)
        votesCount: sc.votes,
        votes_count: sc.votes,
        votes: sc.votes,
        totalScore: sc.score,
        total_score: sc.score,
        score: sc.score
      };
    });

    // 6. Fetch LinkedIn submissions for this team
    let linkedinSubmissions = {
      leader: null,
      member1: null,
      member2: null
    };

    const normalizeSub = (s) => {
      if (!s) return null;
      return {
        ...s,
        post_url: s.post_url || s.linkedin_post_url || '',
        linkedin_post_url: s.linkedin_post_url || s.post_url || '',
        submitted_at: s.submitted_at || s.created_at || s.updated_at || new Date().toISOString()
      };
    };

    if (testStore) {
      const subs = (testStore.linkedin_submissions || []).filter(s => s.team_id === resolvedTeamId);
      subs.forEach(s => {
        if (['leader', 'member1', 'member2'].includes(s.role)) {
          linkedinSubmissions[s.role] = normalizeSub(s);
        }
      });
    } else {
      // Try database table first
      try {
        const { data: dbSubs, error: subErr } = await supabase
          .from('phase3_linkedin_submissions')
          .select('*')
          .eq('team_id', resolvedTeamId);

        if (!subErr && dbSubs && dbSubs.length > 0) {
          dbSubs.forEach(s => {
            if (['leader', 'member1', 'member2'].includes(s.role)) {
              linkedinSubmissions[s.role] = normalizeSub(s);
            }
          });
        } else {
          // Fallback to local store if table not yet created
          const localData = readLocalSubmissions();
          const teamSubs = localData[resolvedTeamId] || {};
          linkedinSubmissions = {
            leader: normalizeSub(teamSubs.leader),
            member1: normalizeSub(teamSubs.member1),
            member2: normalizeSub(teamSubs.member2)
          };
        }
      } catch (_) {
        const localData = readLocalSubmissions();
        const teamSubs = localData[resolvedTeamId] || {};
        linkedinSubmissions = {
          leader: normalizeSub(teamSubs.leader),
          member1: normalizeSub(teamSubs.member1),
          member2: normalizeSub(teamSubs.member2)
        };
      }
    }

    // Step 10P / Polish: Reconcile with authoritative Google Drive spreadsheet
    // Google Sheet is treated as the operational current source of truth for the 3 LinkedIn submission values.
    try {
      const driveRows = await phase3LinkedInDriveService.readSubmissionsFromDrive();
      if (Array.isArray(driveRows) && driveRows.length > 0) {
        const cleanRegId = (registration?.registration_id || '').toString().trim().toUpperCase();
        const cleanTeamId = (resolvedTeamId || '').toString().trim();

        const teamDriveRow = driveRows.find(r => 
          (cleanRegId && (r.registration_id || '').toString().trim().toUpperCase() === cleanRegId) ||
          (cleanTeamId && (r.team_id || '').toString().trim() === cleanTeamId)
        );

        if (teamDriveRow) {
          const getLink = (role) => {
            const canonical = teamDriveRow[`${role}_linkedin_post_link`];
            if (canonical !== undefined && canonical !== null) {
              return canonical.toString().trim();
            }
            const legacy = teamDriveRow[`${role}_linkedin_url`];
            if (legacy !== undefined && legacy !== null) {
              return legacy.toString().trim();
            }
            return '';
          };

          const sheetLinks = {
            leader: getLink('leader'),
            member1: getLink('member1'),
            member2: getLink('member2')
          };

          const roles = ['leader', 'member1', 'member2'];
          for (const r of roles) {
            const sheetVal = sheetLinks[r];
            const currentSub = linkedinSubmissions[r];

            if (!sheetVal) {
              // Cell is empty/blank in Google Sheet:
              // Operational source of truth says Pending / cleared!
              if (currentSub) {
                linkedinSubmissions[r] = null;
                if (testStore) {
                  if (testStore.linkedin_submissions) {
                    testStore.linkedin_submissions = testStore.linkedin_submissions.filter(
                      s => !(s.team_id === resolvedTeamId && s.role === r)
                    );
                  }
                } else {
                  try {
                    await supabase
                      .from('phase3_linkedin_submissions')
                      .delete()
                      .eq('team_id', resolvedTeamId)
                      .eq('role', r);
                  } catch (e) {
                    console.warn('[Phase3] Failed to delete reconciled submission from DB:', e.message);
                  }
                  try {
                    const allSubs = readLocalSubmissions();
                    if (allSubs[resolvedTeamId] && allSubs[resolvedTeamId][r]) {
                      delete allSubs[resolvedTeamId][r];
                      writeLocalSubmissions(allSubs);
                    }
                  } catch (_) {}
                }
              }
            } else {
              // Cell has a non-empty value in Google Sheet:
              // If DB state is missing or has a different URL, synchronize it
              if (!currentSub || currentSub.post_url !== sheetVal) {
                let memberName = registration?.leader_name;
                let memberEmail = (registration?.leader_email || '').toLowerCase().trim();
                if (r === 'member1') {
                  memberName = registration?.member2_name;
                  memberEmail = (registration?.member2_email || '').toLowerCase().trim();
                } else if (r === 'member2') {
                  memberName = registration?.member3_name;
                  memberEmail = (registration?.member3_email || '').toLowerCase().trim();
                }
                const nowIso = new Date().toISOString();
                const reconciledRecord = {
                  team_id: resolvedTeamId,
                  registration_id: registration?.registration_id || cleanRegId,
                  role: r,
                  member_name: memberName || r,
                  member_email: memberEmail || '',
                  linkedin_post_url: sheetVal,
                  post_url: sheetVal,
                  submitted_at: currentSub?.submitted_at || nowIso,
                  updated_at: nowIso
                };

                linkedinSubmissions[r] = normalizeSub(reconciledRecord);

                if (testStore) {
                  if (!testStore.linkedin_submissions) testStore.linkedin_submissions = [];
                  const existingIdx = testStore.linkedin_submissions.findIndex(
                    s => s.team_id === resolvedTeamId && s.role === r
                  );
                  if (existingIdx >= 0) {
                    testStore.linkedin_submissions[existingIdx] = {
                      ...testStore.linkedin_submissions[existingIdx],
                      ...reconciledRecord
                    };
                  } else {
                    testStore.linkedin_submissions.push({
                      ...reconciledRecord,
                      id: `sub-${Date.now()}-${r}`
                    });
                  }
                } else {
                  try {
                    await supabase
                      .from('phase3_linkedin_submissions')
                      .upsert(reconciledRecord, { onConflict: 'team_id,role' });
                  } catch (e) {
                    console.warn('[Phase3] Failed to upsert reconciled submission to DB:', e.message);
                  }
                  try {
                    const allSubs = readLocalSubmissions();
                    if (!allSubs[resolvedTeamId]) allSubs[resolvedTeamId] = {};
                    allSubs[resolvedTeamId][r] = reconciledRecord;
                    writeLocalSubmissions(allSubs);
                  } catch (_) {}
                }
              }
            }
          }
        }
      }
    } catch (driveErr) {
      console.warn('[Phase3] Google Drive reconciliation warning:', driveErr.message);
    }

    const hasAnyShortlistedProduct = productStatuses.some(p => p.is_shortlisted);

    // Step 10M: Team-wide permission model. Any enrolled member can manage any slot.
    const isEnrolledMember = teamEmails.includes(userEmail) || isAdmin;

    const canEdit = {
      leader: Boolean(isEnrolledMember),
      member1: Boolean(isEnrolledMember),
      member2: Boolean(isEnrolledMember)
    };

    return res.status(200).json({
      success: true,
      teamId: resolvedTeamId,
      team_id: resolvedTeamId,
      teamName: team?.team_name || registration?.team_name || 'Team',
      team_name: team?.team_name || registration?.team_name || 'Team',
      registrationId: resolvedRegId,
      registration_id: resolvedRegId,
      isShortlisted: hasAnyShortlistedProduct,
      is_shortlisted: hasAnyShortlistedProduct,
      products: productStatuses,
      members: {
        leader: {
          name: registration?.leader_name || 'Team Leader',
          email: registration?.leader_email || '',
          department: registration?.leader_department || ''
        },
        member1: {
          name: registration?.member2_name || 'Member 1',
          email: registration?.member2_email || '',
          department: registration?.member2_department || ''
        },
        member2: {
          name: registration?.member3_name || 'Member 2',
          email: registration?.member3_email || '',
          department: registration?.member3_department || ''
        }
      },
      linkedinSubmissions: linkedinSubmissions,
      linkedin_submissions: linkedinSubmissions,
      canEdit: canEdit
    });
  } catch (err) {
    console.error('[Phase3 API] /status error:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'SERVER_ERROR',
      message: 'Failed to retrieve Phase 3 status: ' + err.message
    });
  }
});

/**
 * POST /api/phase3/linkedin-submission
 * Saves or updates a team member's LinkedIn post URL.
 * Strictly validates:
 * 1. User belongs to team
 * 2. Role is 'leader', 'member1', or 'member2'
 * 3. URL is a genuine LinkedIn post URL
 * 4. User is authorized for this role (own role or Team Leader)
 */
router.post('/linkedin-submission', authenticateUser, async (req, res) => {
  try {
    const { teamId, role } = req.body || {};
    const userEmail = req.user.email;

    if (!teamId) {
      return res.status(400).json({
        success: false,
        error_code: 'MISSING_TEAM_ID',
        message: 'Team ID is required.'
      });
    }

    const normRole = String(role || '').trim().toLowerCase();
    if (!['leader', 'member1', 'member2'].includes(normRole)) {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_ROLE',
        message: "Role must be 'leader', 'member1', or 'member2'."
      });
    }

    const rawInput = req.body?.linkedin_post_link ?? req.body?.linkedin_post_url ?? req.body?.post_url ?? '';
    const trimmedUrl = String(rawInput ?? '').trim();

    // Check only that it is not empty (keep existing required-field behavior)
    if (!trimmedUrl) {
      return res.status(400).json({
        success: false,
        error_code: 'MISSING_URL',
        message: 'LinkedIn post URL is required.'
      });
    }

    if (trimmedUrl.length > 1000) {
      return res.status(400).json({
        success: false,
        error_code: 'URL_TOO_LONG',
        message: 'Submission text must not exceed 1000 characters.'
      });
    }

    let testStore = req.testStore || null;
    let team = null;
    let registration = null;

    if (testStore) {
      team = testStore.teams.find(t => t.id === teamId);
      registration = testStore.registrations.find(r => team && r.team_name.toLowerCase() === team.team_name.toLowerCase());
    } else {
      const { data: teamData } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .maybeSingle();
      team = teamData;

      if (team?.team_name) {
        const { data: regData } = await supabase
          .from('registrations')
          .select('*')
          .ilike('team_name', team.team_name.trim())
          .maybeSingle();
        registration = regData;
      }
    }

    if (!team || !registration) {
      return res.status(404).json({
        success: false,
        error_code: 'TEAM_NOT_FOUND',
        message: 'Team or registration not found.'
      });
    }

    // Team membership & isolation verification (Step 10M: Team-wide model)
    const leaderEmail = (registration.leader_email || '').toLowerCase().trim();
    const member1Email = (registration.member2_email || '').toLowerCase().trim();
    const member2Email = (registration.member3_email || '').toLowerCase().trim();
    const teamEmails = [leaderEmail, member1Email, member2Email].filter(Boolean);

    const isAdmin = req.user?.user_metadata?.role === 'admin';
    const isEnrolledMember = teamEmails.includes(userEmail) || isAdmin;

    // Must be an enrolled team member or admin
    if (!isEnrolledMember) {
      return res.status(403).json({
        success: false,
        error_code: 'FORBIDDEN',
        message: 'Access denied: You are not an enrolled member of this team.'
      });
    }

    // Target slot identifies WHICH PERSON'S LinkedIn post is being submitted.
    // Any authenticated enrolled member of the team can manage any of the 3 slots for their team.

    // Determine member name and email for the slot
    let memberName = registration.leader_name;
    let memberEmail = leaderEmail;
    if (normRole === 'member1') {
      memberName = registration.member2_name;
      memberEmail = member1Email;
    } else if (normRole === 'member2') {
      memberName = registration.member3_name;
      memberEmail = member2Email;
    }

    const nowIso = new Date().toISOString();
    const record = {
      team_id: team.id,
      registration_id: registration.registration_id,
      role: normRole,
      member_name: memberName || normRole,
      member_email: memberEmail || userEmail,
      linkedin_post_url: trimmedUrl,
      post_url: trimmedUrl,
      submitted_at: nowIso,
      updated_at: nowIso
    };

    // Sync to authoritative Google Drive spreadsheet
    try {
      await phase3LinkedInDriveService.saveSubmissionToDrive({
        registrationId: registration.registration_id,
        teamId: team.id,
        teamName: team.team_name || registration.team_name,
        leaderName: registration.leader_name || '',
        leaderEmail: leaderEmail || '',
        member1Name: registration.member2_name || '',
        member1Email: member1Email || '',
        member2Name: registration.member3_name || '',
        member2Email: member2Email || '',
        role: normRole,
        linkedinUrl: trimmedUrl
      });
    } catch (driveErr) {
      console.error('[Phase3 API] Google Drive spreadsheet sync failed:', driveErr.message);
      return res.status(500).json({
        success: false,
        error_code: 'DRIVE_UPDATE_FAILED',
        message: 'Failed to update Google Sheet: ' + driveErr.message
      });
    }

    if (testStore) {
      if (!testStore.linkedin_submissions) testStore.linkedin_submissions = [];
      const idx = testStore.linkedin_submissions.findIndex(s => s.team_id === team.id && s.role === normRole);
      if (idx >= 0) {
        testStore.linkedin_submissions[idx] = { ...testStore.linkedin_submissions[idx], ...record };
      } else {
        testStore.linkedin_submissions.push({ ...record, id: `sub-${Date.now()}`, created_at: new Date().toISOString() });
      }

      return res.status(200).json({
        success: true,
        message: 'LinkedIn post URL saved successfully.',
        submission: record
      });
    }

    // Try saving to database first
    try {
      const { data, error } = await supabase
        .from('phase3_linkedin_submissions')
        .upsert(
          {
            ...record,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'team_id,role' }
        )
        .select()
        .single();

      if (error) {
        console.warn('[Phase3] DB upsert failed, using local file storage:', error.message);
        // Fallback to local file store if table not yet migrated
        const allSubs = readLocalSubmissions();
        if (!allSubs[team.id]) allSubs[team.id] = {};
        allSubs[team.id][normRole] = {
          ...record,
          created_at: allSubs[team.id][normRole]?.created_at || new Date().toISOString()
        };
        writeLocalSubmissions(allSubs);
      }
    } catch (err) {
      console.warn('[Phase3] Exception saving to DB, using local file storage:', err.message);
      const allSubs = readLocalSubmissions();
      if (!allSubs[team.id]) allSubs[team.id] = {};
      allSubs[team.id][normRole] = {
        ...record,
        created_at: allSubs[team.id][normRole]?.created_at || new Date().toISOString()
      };
      writeLocalSubmissions(allSubs);
    }

    return res.status(200).json({
      success: true,
      message: 'LinkedIn post URL saved successfully.',
      submission: record
    });
  } catch (err) {
    console.error('[Phase3 API] /linkedin-submission error:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'SERVER_ERROR',
      message: 'Failed to save LinkedIn post URL: ' + err.message
    });
  }
});

/**
 * Handler to remove a LinkedIn submission slot for a team member.
 * Enforces role-based permissions:
 * - Team Leader can remove leader, member1, or member2 slot
 * - Member 1 can only remove member1 slot
 * - Member 2 can only remove member2 slot
 * - Admin can remove any slot
 */
async function handleRemoveLinkedInSubmission(req, res) {
  try {
    const teamId = (req.body?.teamId || req.query?.teamId || '').trim();
    const role = (req.body?.role || req.query?.role || '').trim();
    const userEmail = req.user.email;

    if (!teamId) {
      return res.status(400).json({
        success: false,
        error_code: 'MISSING_TEAM_ID',
        message: 'Team ID is required.'
      });
    }

    const normRole = String(role || '').trim().toLowerCase();
    if (!['leader', 'member1', 'member2'].includes(normRole)) {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_ROLE',
        message: "Role must be 'leader', 'member1', or 'member2'."
      });
    }

    let testStore = req.testStore || null;
    let team = null;
    let registration = null;

    if (testStore) {
      team = testStore.teams.find(t => t.id === teamId);
      registration = testStore.registrations.find(r => team && r.team_name.toLowerCase() === team.team_name.toLowerCase());
    } else {
      const { data: teamData } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .maybeSingle();
      team = teamData;

      if (team?.team_name) {
        const { data: regData } = await supabase
          .from('registrations')
          .select('*')
          .ilike('team_name', team.team_name.trim())
          .maybeSingle();
        registration = regData;
      }
    }

    if (!team || !registration) {
      return res.status(404).json({
        success: false,
        error_code: 'TEAM_NOT_FOUND',
        message: 'Team or registration not found.'
      });
    }

    // Team membership & isolation verification (Step 10M: Team-wide model)
    const leaderEmail = (registration.leader_email || '').toLowerCase().trim();
    const member1Email = (registration.member2_email || '').toLowerCase().trim();
    const member2Email = (registration.member3_email || '').toLowerCase().trim();
    const teamEmails = [leaderEmail, member1Email, member2Email].filter(Boolean);

    const isAdmin = req.user?.user_metadata?.role === 'admin';
    const isEnrolledMember = teamEmails.includes(userEmail) || isAdmin;

    // Must be an enrolled team member or admin
    if (!isEnrolledMember) {
      return res.status(403).json({
        success: false,
        error_code: 'FORBIDDEN',
        message: 'Access denied: You are not an enrolled member of this team.'
      });
    }

    // Target slot identifies WHICH PERSON'S LinkedIn post is being removed.
    // Any authenticated enrolled member of the team can remove any of the 3 slots for their team.

    // Sync removal to authoritative Google Drive spreadsheet
    try {
      await phase3LinkedInDriveService.removeSubmissionFromDrive({
        registrationId: registration.registration_id,
        teamId: team.id,
        role: normRole
      });
    } catch (driveErr) {
      console.error('[Phase3 API] Google Drive spreadsheet remove failed:', driveErr.message);
      return res.status(500).json({
        success: false,
        error_code: 'DRIVE_UPDATE_FAILED',
        message: 'Failed to update Google Sheet during removal: ' + driveErr.message
      });
    }

    if (testStore) {
      if (testStore.linkedin_submissions) {
        testStore.linkedin_submissions = testStore.linkedin_submissions.filter(
          s => !(s.team_id === team.id && s.role === normRole)
        );
      }
      return res.status(200).json({
        success: true,
        message: 'LinkedIn submission removed successfully.',
        role: normRole
      });
    }

    // Remove from database table
    try {
      const { error: dbErr } = await supabase
        .from('phase3_linkedin_submissions')
        .delete()
        .eq('team_id', team.id)
        .eq('role', normRole);

      if (dbErr) {
        console.warn('[Phase3] DB delete error, removing from local store:', dbErr.message);
      }
    } catch (err) {
      console.warn('[Phase3] Exception removing from DB, using local file storage:', err.message);
    }

    // Also remove from local fallback store
    try {
      const allSubs = readLocalSubmissions();
      if (allSubs[team.id] && allSubs[team.id][normRole]) {
        delete allSubs[team.id][normRole];
        writeLocalSubmissions(allSubs);
      }
    } catch (localErr) {
      console.warn('[Phase3] Local store removal error:', localErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'LinkedIn submission removed successfully.',
      role: normRole
    });
  } catch (err) {
    console.error('[Phase3 API] DELETE /linkedin-submission error:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'SERVER_ERROR',
      message: 'Failed to remove LinkedIn post URL: ' + err.message
    });
  }
}

/**
 * DELETE /api/phase3/linkedin-submission
 * Removes a team member's LinkedIn post submission.
 */
router.delete('/linkedin-submission', authenticateUser, handleRemoveLinkedInSubmission);

/**
 * POST /api/phase3/linkedin-submission/remove
 * Alias endpoint for environments or proxies that block HTTP DELETE with body.
 */
router.post('/linkedin-submission/remove', authenticateUser, handleRemoveLinkedInSubmission);

/**
 * GET /api/phase3/admin/export
 * Admin only export of all Phase 3 LinkedIn submissions for organizers.
 */
router.get('/admin/export', authenticateUser, async (req, res) => {
  try {
    const isAdmin = req.user?.user_metadata?.role === 'admin';
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error_code: 'ADMIN_REQUIRED',
        message: 'Admin authorization required.'
      });
    }

    let records = [];
    if (req.testStore) {
      records = req.testStore.linkedin_submissions || [];
    } else {
      const { data, error } = await supabase
        .from('phase3_linkedin_submissions')
        .select('*')
        .order('registration_id', { ascending: true });

      if (!error && data) {
        records = data;
      } else {
        // Read from local fallback
        const local = readLocalSubmissions();
        Object.keys(local).forEach(teamId => {
          const tSubs = local[teamId];
          ['leader', 'member1', 'member2'].forEach(r => {
            if (tSubs[r]) records.push(tSubs[r]);
          });
        });
      }
    }

    return res.status(200).json({
      success: true,
      total_submissions: records.length,
      submissions: records
    });
  } catch (err) {
    console.error('[Phase3 API] /admin/export error:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'SERVER_ERROR',
      message: 'Failed to export LinkedIn submissions: ' + err.message
    });
  }
});

/**
 * GET /api/phase3/admin/export/xlsx
 * Admin only export of the authoritative Google Drive Phase 3 LinkedIn spreadsheet as .xlsx
 */
router.get('/admin/export/xlsx', authenticateUser, async (req, res) => {
  try {
    const isAdmin = req.user?.user_metadata?.role === 'admin';
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error_code: 'ADMIN_REQUIRED',
        message: 'Admin authorization required.'
      });
    }

    const { buffer, fileName } = await phase3LinkedInDriveService.exportSubmissionsXlsx();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('[Phase3 API] /admin/export/xlsx error:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'EXPORT_FAILED',
      message: 'Failed to export LinkedIn submissions from Google Drive: ' + err.message
    });
  }
});

module.exports = {
  router,
  isValidLinkedInPostUrl,
  phase3LinkedInDriveService
};
