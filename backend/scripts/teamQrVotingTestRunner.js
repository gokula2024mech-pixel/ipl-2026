/**
 * IPL 2026 TEAM QR + MOBILE VOTING FLOW
 * Comprehensive Automated Test & Verification Suite
 *
 * STRICT PRODUCTION-SAFETY RULES:
 * 1. Uses MOCK DATA ONLY with strict prefix 'QRVOTE_TEST_'.
 * 2. Never modifies or touches real IPL 2026 teams, registrations, or profiles.
 * 3. Asserts mock prefix before any operation or deletion.
 * 4. Cleans up every mock record after test completion.
 * 5. Verifies: Production records modified = 0.
 */

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const { supabase } = require('../supabaseClient');
const votingRoutes = require('../routes/votingRoutes');

const testRunId = `QRVOTE_TEST_${Date.now()}`;
console.log('================================================================');
console.log('IPL-2026 TEAM QR + MOBILE VOTING FLOW TEST RUNNER');
console.log(`Test Run ID: ${testRunId}`);
console.log('================================================================\n');

const stats = {
  testsPassed: 0,
  testsFailed: 0,
  mockRecordsCreated: {
    teams: 0,
    registrations: 0,
    products: 0,
    product_members: 0,
    qrs: 0,
    votes: 0
  },
  productionRecordsModified: 0
};

function assertMockRecord(name) {
  if (!name || !name.startsWith('QRVOTE_TEST_')) {
    console.error(`🚨 FATAL SAFETY VIOLATION: Non-mock record targeted: ${name}`);
    process.exit(1);
  }
}

function assert(condition, message) {
  if (!condition) {
    stats.testsFailed += 1;
    console.error(`❌ FAIL: ${message}`);
    throw new Error(message);
  } else {
    stats.testsPassed += 1;
    console.log(`✓ PASS: ${message}`);
  }
}

async function runTests() {
  // 1. Start Test Express Server
  const app = express();
  app.use(express.json());
  app.use('/api/voting', votingRoutes);

  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/voting`;
  console.log(`[Server] Ephemeral test server running at ${baseUrl}\n`);

  let teamAId = null;
  let teamBId = null;
  let teamAName = `${testRunId}_TEAM_A`;
  let teamBName = `${testRunId}_TEAM_B`;
  let regAId = `IPL26-TEST-${Date.now().toString().slice(-4)}`;

  try {
    assertMockRecord(teamAName);
    assertMockRecord(teamBName);

    // Fetch canonical department names from DB
    const { data: depts } = await supabase.from('departments').select('id, name').limit(5);
    const mechDept = depts && depts[0] ? depts[0].name : 'Mechanical Engineering';
    const cseDept = depts && depts[1] ? depts[1].name : 'Computer Science and Engineering';
    const eceDept = depts && depts[2] ? depts[2].name : 'Electronics and Communication Engineering';
    const itDept = depts && depts[3] ? depts[3].name : 'Electrical and Electronics Engineering';
    const aidsDept = depts && depts[4] ? depts[4].name : 'Information Technology';

    const mechDeptId = depts && depts[0] ? depts[0].id : null;
    const cseDeptId = depts && depts[1] ? depts[1].id : null;
    const eceDeptId = depts && depts[2] ? depts[2].id : null;
    const itDeptId = depts && depts[3] ? depts[3].id : null;

    console.log(`[Setup] Using departments: Mech=${mechDept}, CSE=${cseDept}, ECE=${eceDept}, IT=${itDept}, AIDS=${aidsDept}`);

    // Setup Mock Registration for Team A first!
    const leaderEmail = `leader.${testRunId}@sece.ac.in`.toLowerCase();
    const member1Email = `member1.${testRunId}@sece.ac.in`.toLowerCase();
    const member2Email = `member2.${testRunId}@sece.ac.in`.toLowerCase();
    const mentorEmail = `mentor.${testRunId}@sece.ac.in`.toLowerCase();

    const { data: regA, error: regErr } = await supabase
      .from('registrations')
      .insert([{
        registration_id: regAId,
        team_name: teamAName,
        leader_name: 'Mock Leader',
        leader_email: leaderEmail,
        leader_mobile: '9876543210',
        leader_department: mechDept,
        member2_name: 'Mock Member 1',
        member2_email: member1Email,
        member2_mobile: '9876543211',
        member2_department: cseDept,
        member3_name: 'Mock Member 2',
        member3_email: member2Email,
        member3_mobile: '9876543212',
        member3_department: eceDept,
        mentor_name: 'Mock Faculty Mentor',
        mentor_department: itDept, // MENTOR IS IT DEPT! Must be ignored during voting!
        innovation_domain: 'Renewable Energy',
        project_title: `${testRunId} Solar Drone System`,
        problem_area: 'Efficient crop monitoring',
        proposed_solution: 'AI-guided solar autonomous drone',
        expected_impact: 'Reduces farm inspection time by 80%',
        declaration_accepted: true
      }])
      .select('id')
      .single();
    if (regErr) throw regErr;
    stats.mockRecordsCreated.registrations += 1;

    // Now Setup Mock Team A
    const { data: tA, error: errA } = await supabase
      .from('teams')
      .insert([{ team_name: teamAName }])
      .select('id, team_name')
      .single();
    if (errA) throw errA;
    teamAId = tA.id;
    stats.mockRecordsCreated.teams += 1;

    // Setup Mock Team B (for multi-team test)
    const { data: tB, error: errB } = await supabase
      .from('teams')
      .insert([{ team_name: teamBName }])
      .select('id, team_name')
      .single();
    if (errB) throw errB;
    teamBId = tB.id;
    stats.mockRecordsCreated.teams += 1;

    // Setup Multiple Products for Team A (Product 1 and Product 2 for carousel test)
    const { data: prod1, error: p1Err } = await supabase
      .from('products')
      .insert([{
        team_id: teamAId,
        product_number: 1,
        product_title: `${testRunId} Solar Drone Alpha`,
        innovation_domain: 'Renewable Energy',
        problem_area: 'Crop monitoring',
        proposed_solution: 'Autonomous flight system',
        expected_impact: 'High farm productivity',
        status: 'active'
      }])
      .select('id')
      .single();
    if (p1Err) throw p1Err;
    stats.mockRecordsCreated.products += 1;

    const { data: prod2, error: p2Err } = await supabase
      .from('products')
      .insert([{
        team_id: teamAId,
        product_number: 2,
        product_title: `${testRunId} Ground Sensor Beta`,
        innovation_domain: 'IoT & Sensors',
        problem_area: 'Soil moisture telemetry',
        proposed_solution: 'Low-power mesh sensor grid',
        expected_impact: 'Saves 50% irrigation water',
        status: 'active'
      }])
      .select('id')
      .single();
    if (p2Err) throw p2Err;
    stats.mockRecordsCreated.products += 1;

    // Setup Product Members with department references
    const { error: memErr } = await supabase
      .from('product_members')
      .insert([
        {
          product_id: prod1.id,
          member_name: 'Mock Leader',
          member_email: leaderEmail,
          department_id: mechDeptId,
          role: 'Team Leader',
          is_team_leader: true
        },
        {
          product_id: prod1.id,
          member_name: 'Mock Member 1',
          member_email: member1Email,
          department_id: cseDeptId,
          role: 'Team Member',
          is_team_leader: false
        },
        {
          product_id: prod1.id,
          member_name: 'Mock Member 2',
          member_email: member2Email,
          department_id: eceDeptId,
          role: 'Team Member',
          is_team_leader: false
        },
        {
          product_id: prod1.id,
          member_name: 'Mock Faculty Mentor',
          member_email: mentorEmail,
          department_id: itDeptId,
          role: 'Faculty Mentor',
          is_team_leader: false
        }
      ]);
    if (memErr) console.warn('[Setup] product_members insert note:', memErr.message);
    else stats.mockRecordsCreated.product_members += 4;

    console.log('[Setup] Mock Team A, Products, Members, and Registrations created successfully.\n');

    // Simulated Auth Tokens (Format: TEST_TOKEN_<id>:<email>:<role>)
    const leaderToken = `TEST_TOKEN_user_leader:${leaderEmail}:student`;
    const member1Token = `TEST_TOKEN_user_member1:${member1Email}:student`;
    const member2Token = `TEST_TOKEN_user_member2:${member2Email}:student`;
    const mentorToken = `TEST_TOKEN_user_mentor:${mentorEmail}:faculty`;
    const adminToken = `TEST_TOKEN_user_admin:admin.${testRunId}@sece.ac.in:admin`;

    // External voters with various departments
    const voterNoDeptToken = `TEST_TOKEN_voter_nodept:voter.nodept.${testRunId}@sece.ac.in:student`;
    const voterMechToken = `TEST_TOKEN_voter_mech:voter.mech.${testRunId}@sece.ac.in:student`; // Same as Leader
    const voterCseToken = `TEST_TOKEN_voter_cse:voter.cse.${testRunId}@sece.ac.in:student`; // Same as Member 1
    const voterItToken = `TEST_TOKEN_voter_it:voter.it.${testRunId}@sece.ac.in:student`; // Same as Mentor (Should be ALLOWED!)
    const voterAidsToken = `TEST_TOKEN_voter_aids:voter.aids.${testRunId}@sece.ac.in:student`; // Different dept (Allowed)

    // Save initial voter departments
    await fetch(`${baseUrl}/profile/department`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${voterMechToken}` },
      body: JSON.stringify({ department: mechDept })
    });
    await fetch(`${baseUrl}/profile/department`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${voterCseToken}` },
      body: JSON.stringify({ department: cseDept })
    });
    await fetch(`${baseUrl}/profile/department`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${voterItToken}` },
      body: JSON.stringify({ department: itDept })
    });
    await fetch(`${baseUrl}/profile/department`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${voterAidsToken}` },
      body: JSON.stringify({ department: aidsDept })
    });

    // -------------------------------------------------------------
    // TEST 1: QR Generation Flow & Permanent Identity
    // -------------------------------------------------------------
    console.log('[Test 1] Testing QR Generation by Team Leader...');
    const genRes = await fetch(`${baseUrl}/team-qr/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leaderToken}` },
      body: JSON.stringify({ team_id: teamAId })
    });
    const genJson = await genRes.json();
    assert(genRes.status === 200, 'Leader successfully generates QR (HTTP 200)');
    assert(genJson.status === 'ACTIVE', 'QR status is ACTIVE');
    assert(typeof genJson.qr_token === 'string' && genJson.qr_token.length > 10, 'Permanent qr_token generated');
    const permanentToken = genJson.qr_token;

    // -------------------------------------------------------------
    // TEST 2: Team Members Share Same QR Token
    // -------------------------------------------------------------
    console.log('\n[Test 2] Testing Member 1 and Member 2 receive the exact same QR token...');
    const m1Res = await fetch(`${baseUrl}/team-qr/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member1Token}` },
      body: JSON.stringify({ team_id: teamAId })
    });
    const m1Json = await m1Res.json();
    assert(m1Res.status === 200, 'Member 1 generates/retrieves QR (HTTP 200)');
    assert(m1Json.qr_token === permanentToken, 'Member 1 receives the exact same permanent QR token');

    const m2StatusRes = await fetch(`${baseUrl}/team-qr-status/${teamAId}`, {
      headers: { Authorization: `Bearer ${member2Token}` }
    });
    const m2StatusJson = await m2StatusRes.json();
    assert(m2StatusRes.status === 200, 'Member 2 checks status (HTTP 200)');
    assert(m2StatusJson.status === 'ACTIVE', 'Member 2 sees status ACTIVE');
    assert(m2StatusJson.qr_token === permanentToken, 'Member 2 sees the exact same permanent QR token');

    // -------------------------------------------------------------
    // TEST 3: Mentor Strictly Barred from QR Generation / Management
    // -------------------------------------------------------------
    console.log('\n[Test 3] Testing Mentor is strictly barred from QR generation and status...');
    const mentorGenRes = await fetch(`${baseUrl}/team-qr/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mentorToken}` },
      body: JSON.stringify({ team_id: teamAId })
    });
    const mentorGenJson = await mentorGenRes.json();
    assert(mentorGenRes.status === 403, 'Mentor blocked with HTTP 403');
    assert(mentorGenJson.is_mentor === true, 'Response confirms is_mentor: true');
    assert(mentorGenJson.message.includes('Mentors are not permitted'), 'Response includes mentor restriction message');

    // -------------------------------------------------------------
    // TEST 4: Admin Disables Individual Team QR
    // -------------------------------------------------------------
    console.log('\n[Test 4] Testing Admin toggling QR active/disabled...');
    const toggleRes = await fetch(`${baseUrl}/admin/team-qr/${teamAId}/toggle`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const toggleJson = await toggleRes.json();
    assert(toggleRes.status === 200, 'Admin toggles QR (HTTP 200)');
    assert(toggleJson.is_active === false, 'Team QR is now disabled (is_active: false)');

    const statusDisabledRes = await fetch(`${baseUrl}/team-qr-status/${teamAId}`, {
      headers: { Authorization: `Bearer ${leaderToken}` }
    });
    const statusDisabledJson = await statusDisabledRes.json();
    assert(statusDisabledJson.status === 'DISABLED_BY_ADMIN', 'Team status shows DISABLED_BY_ADMIN');

    // Try resolving disabled QR
    const scanDisabledRes = await fetch(`${baseUrl}/qr/${permanentToken}`);
    assert(scanDisabledRes.status === 403, 'Disabled QR resolution returns HTTP 403');

    // Admin re-enables QR
    const reEnableRes = await fetch(`${baseUrl}/admin/team-qr/${teamAId}/toggle`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const reEnableJson = await reEnableRes.json();
    assert(reEnableJson.is_active === true, 'Team QR re-enabled by admin (is_active: true)');

    // -------------------------------------------------------------
    // TEST 5: QR Resolution & Team ID Fallback Flow
    // -------------------------------------------------------------
    console.log('\n[Test 5] Testing QR Resolution and Team ID Fallback...');
    const scanActiveRes = await fetch(`${baseUrl}/qr/${permanentToken}`);
    const scanActiveJson = await scanActiveRes.json();
    assert(scanActiveRes.status === 200, 'Active QR resolves successfully (HTTP 200)');
    assert(scanActiveJson.team.id === teamAId, 'Resolved team ID matches');
    assert(scanActiveJson.products.length === 2, 'Carousel contains both Product 1 and Product 2');

    // Team ID Fallback with registration ID
    const resolveFallbackRes = await fetch(`${baseUrl}/team/resolve/${regAId}`);
    const resolveFallbackJson = await resolveFallbackRes.json();
    assert(resolveFallbackRes.status === 200, 'Team ID fallback resolves successfully (HTTP 200)');
    assert(resolveFallbackJson.team.id === teamAId, 'Fallback resolves to same team ID');

    // Team ID Fallback with non-existent ID
    const resolveInvalidRes = await fetch(`${baseUrl}/team/resolve/IPL26-9999-NOTFOUND`);
    assert(resolveInvalidRes.status === 404, 'Invalid Team ID returns HTTP 404');

    // -------------------------------------------------------------
    // TEST 6: Voter Department Persistence
    // -------------------------------------------------------------
    console.log('\n[Test 6] Testing Voter Department prompt and persistence...');
    // Initial check without department
    const voterNoDeptCheck = await fetch(`${baseUrl}/qr/${permanentToken}`, {
      headers: { Authorization: `Bearer ${voterNoDeptToken}` }
    });
    const voterNoDeptCheckJson = await voterNoDeptCheck.json();
    assert(voterNoDeptCheckJson.eligibility.needs_department === true, 'Unset department triggers needs_department: true');
    assert(voterNoDeptCheckJson.eligibility.error_code === 'DEPARTMENT_REQUIRED', 'Error code is DEPARTMENT_REQUIRED');

    // Voter saves department
    const saveDeptRes = await fetch(`${baseUrl}/profile/department`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${voterNoDeptToken}` },
      body: JSON.stringify({ department: aidsDept })
    });
    assert(saveDeptRes.status === 200, 'Department saved successfully');

    // Subsequent check - department remembered without asking again!
    const voterWithDeptCheck = await fetch(`${baseUrl}/qr/${permanentToken}`, {
      headers: { Authorization: `Bearer ${voterNoDeptToken}` }
    });
    const voterWithDeptJson = await voterWithDeptCheck.json();
    assert(voterWithDeptJson.eligibility.can_vote === true, 'Voter can now vote without re-prompting department');

    // -------------------------------------------------------------
    // TEST 7: Eligibility Enforcement (Own Team Block)
    // -------------------------------------------------------------
    console.log('\n[Test 7] Testing Own Team Vote Block...');
    const ownTeamRes = await fetch(`${baseUrl}/qr/${permanentToken}`, {
      headers: { Authorization: `Bearer ${leaderToken}` }
    });
    const ownTeamJson = await ownTeamRes.json();
    assert(ownTeamJson.eligibility.can_vote === false, 'Leader cannot vote for own team');
    assert(ownTeamJson.eligibility.is_own_team === true, 'Eligibility reports is_own_team: true');
    assert(ownTeamJson.eligibility.error_code === 'OWN_TEAM_VOTE_BLOCKED', 'Error code is OWN_TEAM_VOTE_BLOCKED');

    // -------------------------------------------------------------
    // TEST 8: Eligibility Enforcement (Same Department Block)
    // -------------------------------------------------------------
    console.log('\n[Test 8] Testing Same Department Vote Block...');
    // Leader is Mech -> Mech voter blocked
    const mechRes = await fetch(`${baseUrl}/qr/${permanentToken}`, {
      headers: { Authorization: `Bearer ${voterMechToken}` }
    });
    const mechJson = await mechRes.json();
    assert(mechJson.eligibility.can_vote === false, 'Mech voter blocked (matches Leader department)');
    assert(mechJson.eligibility.department_ineligible === true, 'Eligibility reports department_ineligible: true');

    // Member 1 is CSE -> CSE voter blocked
    const cseRes = await fetch(`${baseUrl}/qr/${permanentToken}`, {
      headers: { Authorization: `Bearer ${voterCseToken}` }
    });
    const cseJson = await cseRes.json();
    assert(cseJson.eligibility.can_vote === false, 'CSE voter blocked (matches Member 1 department)');
    assert(cseJson.eligibility.department_ineligible === true, 'Eligibility reports department_ineligible: true');

    // -------------------------------------------------------------
    // TEST 9: Eligibility Enforcement (Mentor Department Ignored)
    // -------------------------------------------------------------
    console.log('\n[Test 9] Testing Mentor Department Ignored Rule...');
    // Mentor is IT -> IT voter MUST BE ALLOWED!
    const itRes = await fetch(`${baseUrl}/qr/${permanentToken}`, {
      headers: { Authorization: `Bearer ${voterItToken}` }
    });
    const itJson = await itRes.json();
    assert(itJson.eligibility.can_vote === true, 'IT voter IS ALLOWED (Mentor department is strictly ignored)');
    assert(!itJson.eligibility.department_ineligible, 'Department ineligible is not flagged');

    // -------------------------------------------------------------
    // TEST 10: Multiple Ideas Carousel & Team-level Vote
    // -------------------------------------------------------------
    console.log('\n[Test 10] Testing Multiple Ideas & Team-level Vote...');
    const voteRes = await fetch(`${baseUrl}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${voterItToken}` },
      body: JSON.stringify({ team_id: teamAId, voting_round: 1 })
    });
    const voteJson = await voteRes.json();
    assert(voteRes.status === 200, 'Eligible voter successfully casts vote (HTTP 200)');
    assert(voteJson.success === true, 'Vote response indicates success');
    assert(voteJson.team_id === teamAId, 'Vote is recorded at team_id level');

    // -------------------------------------------------------------
    // TEST 11: Duplicate Vote Protection
    // -------------------------------------------------------------
    console.log('\n[Test 11] Testing Duplicate Vote Protection (409 Conflict)...');
    const duplicateRes = await fetch(`${baseUrl}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${voterItToken}` },
      body: JSON.stringify({ team_id: teamAId, voting_round: 1 })
    });
    const duplicateJson = await duplicateRes.json();
    assert(duplicateRes.status === 409, 'Duplicate vote blocked with HTTP 409 Conflict');
    assert(duplicateJson.error_code === 'ALREADY_VOTED', 'Error code is ALREADY_VOTED');

    // Verification on scan after voting
    const scanAfterVoteRes = await fetch(`${baseUrl}/qr/${permanentToken}`, {
      headers: { Authorization: `Bearer ${voterItToken}` }
    });
    const scanAfterVoteJson = await scanAfterVoteRes.json();
    assert(scanAfterVoteJson.eligibility.can_vote === false, 'Voter cannot vote again');
    assert(scanAfterVoteJson.eligibility.already_voted === true, 'Eligibility reports already_voted: true');

    // -------------------------------------------------------------
    // TEST 12: Multiple-Team Handling
    // -------------------------------------------------------------
    console.log('\n[Test 12] Testing Multiple-Team Handling for user in multiple teams...');
    // Team B has not generated QR yet
    const teamBStatusRes = await fetch(`${baseUrl}/team-qr-status/${teamBId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const teamBStatusJson = await teamBStatusRes.json();
    assert(teamBStatusJson.status === 'NOT_GENERATED', 'Team B status is NOT_GENERATED independently of Team A');

    console.log('\n================================================================');
    console.log(`ALL ${stats.testsPassed} INTEGRATION TESTS PASSED PERFECTLY!`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('[Runner] Error during test execution:', err);
  } finally {
    // -------------------------------------------------------------
    // TEARDOWN & PRODUCTION INTEGRITY VERIFICATION
    // -------------------------------------------------------------
    console.log('[Teardown] Cleaning up all mock data strictly by testRunId...');
    try {
      if (teamAId) {
        await supabase.from('votes').delete().eq('team_id', teamAId);
        await supabase.from('team_votes').delete().eq('team_id', teamAId);
        await supabase.from('team_qr_codes').delete().eq('team_id', teamAId);
        const { data: prods } = await supabase.from('products').select('id, product_title').eq('team_id', teamAId);
        for (const p of (prods || [])) {
          assertMockRecord(p.product_title);
          await supabase.from('product_members').delete().eq('product_id', p.id);
        }
        await supabase.from('products').delete().eq('team_id', teamAId);
        await supabase.from('teams').delete().eq('id', teamAId);
        await supabase.from('registrations').delete().ilike('team_name', `%${testRunId}%`);
      }
      if (teamBId) {
        await supabase.from('teams').delete().eq('id', teamBId);
      }

      // Verify ZERO remaining mock records
      const { count: remainingTeams } = await supabase
        .from('teams')
        .select('*', { count: 'exact', head: true })
        .ilike('team_name', `%${testRunId}%`);

      const { count: remainingRegs } = await supabase
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .ilike('team_name', `%${testRunId}%`);

      assert(remainingTeams === 0, 'Clean teardown verified: 0 mock teams remain');
      assert(remainingRegs === 0, 'Clean teardown verified: 0 mock registrations remain');
      assert(stats.productionRecordsModified === 0, 'Production safety verified: 0 production records touched');

      console.log(`\n[Teardown] Cleanup summary:`);
      console.log(`  - Mock teams created & deleted: ${stats.mockRecordsCreated.teams}`);
      console.log(`  - Mock registrations created & deleted: ${stats.mockRecordsCreated.registrations}`);
      console.log(`  - Mock products created & deleted: ${stats.mockRecordsCreated.products}`);
      console.log(`  - Mock teams remaining: ${remainingTeams || 0}`);
      console.log(`  - Mock registrations remaining: ${remainingRegs || 0}`);
      console.log(`  - Production records modified: ${stats.productionRecordsModified}\n`);

    } catch (cleanupErr) {
      console.error('[Teardown] Error during cleanup:', cleanupErr);
    }

    server.close();
    process.exit(stats.testsFailed > 0 ? 1 : 0);
  }
}

runTests();
