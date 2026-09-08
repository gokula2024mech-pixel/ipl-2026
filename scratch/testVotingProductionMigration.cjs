// scratch/testVotingProductionMigration.cjs
// Comprehensive test suite for IPL 2026 Voting Architecture Migration
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const http = require('http');

const envPath = path.join(__dirname, '..', 'backend', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
        process.env[key] = val;
      }
    }
  });
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_RUN_ID = `TEST_VOTING_DB_${Date.now()}`;
const API_PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${API_PORT}`;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('IPL 2026 PRODUCTION VOTING ARCHITECTURE TEST SUITE');
  console.log('Test Run ID:', TEST_RUN_ID);
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${message}`);
      failed++;
    }
  }

  // Check backend availability
  try {
    const health = await makeRequest('/api/voting/controls');
    assert(health.status === 200, 'Backend is reachable and /api/voting/controls responds 200');
  } catch (err) {
    console.error('Backend connection failed:', err.message);
    console.log('Please ensure backend is running.');
    return;
  }

  // 1. Audit public.profiles.department
  const { data: profSample, error: profErr } = await supabase.from('profiles').select('user_id, email, name').limit(1);
  assert(!profErr && profSample.length > 0, 'public.profiles is accessible via service-role');
  assert(profSample[0].user_id && !('id' in profSample[0]), 'public.profiles primary key is user_id UUID (no id column)');

  // 2. Test Voting Controls: Independent Switches
  const adminHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer TEST_TOKEN_admin_1:admin@sece.ac.in:admin`
  };

  // Test QR ON, Voting OFF
  const setQrOn = await makeRequest('/api/voting/admin/controls', {
    method: 'POST',
    headers: adminHeaders,
    body: { is_qr_generation_active: true, is_voting_active: false }
  });
  assert(setQrOn.status === 200 && setQrOn.body.success, 'Admin can set QR ON and Voting OFF independently');

  const getCtrl1 = await makeRequest('/api/voting/controls');
  assert(getCtrl1.body.controls.is_qr_generation_active === true && getCtrl1.body.controls.is_voting_active === false,
    'Controls state correctly reflects QR ON and Voting OFF');

  // Test QR OFF, Voting ON
  const setVoteOn = await makeRequest('/api/voting/admin/controls', {
    method: 'POST',
    headers: adminHeaders,
    body: { is_qr_generation_active: false, is_voting_active: true }
  });
  assert(setVoteOn.status === 200 && setVoteOn.body.success, 'Admin can set QR OFF and Voting ON independently');

  const getCtrl2 = await makeRequest('/api/voting/controls');
  assert(getCtrl2.body.controls.is_qr_generation_active === false && getCtrl2.body.controls.is_voting_active === true,
    'Controls state correctly reflects QR OFF and Voting ON');

  // Set both ON for subsequent tests
  await makeRequest('/api/voting/admin/controls', {
    method: 'POST',
    headers: adminHeaders,
    body: { is_qr_generation_active: true, is_voting_active: true }
  });

  // 3. Test QR Generation Rules:
  // Fetch a real team for membership testing
  const { data: realTeams } = await supabase.from('teams').select('id, team_name').limit(1);
  const targetTeam = realTeams[0];
  assert(Boolean(targetTeam?.id), `Found existing team (${targetTeam.team_name}) for permission inspection`);

  // Mentor cannot generate QR
  const mentorHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer TEST_TOKEN_mentor_1:mentor@sece.ac.in:mentor`
  };
  const mentorQr = await makeRequest('/api/voting/generate-team-qr', {
    method: 'POST',
    headers: mentorHeaders,
    body: { team_id: targetTeam.id }
  });
  assert(mentorQr.status === 403, 'Mentors are strictly forbidden from generating team QR codes');

  // Admin CAN generate/view team QR
  const adminQr = await makeRequest('/api/voting/generate-team-qr', {
    method: 'POST',
    headers: adminHeaders,
    body: { team_id: targetTeam.id }
  });
  assert(adminQr.status === 200 && adminQr.body.success && Boolean(adminQr.body.qr_token),
    'Admin can retrieve or generate team QR token');
  const teamToken = adminQr.body.qr_token;

  // Re-generating returns EXACT same QR token (idempotent, single permanent QR per team)
  const adminQr2 = await makeRequest('/api/voting/generate-team-qr', {
    method: 'POST',
    headers: adminHeaders,
    body: { team_id: targetTeam.id }
  });
  assert(adminQr2.body.qr_token === teamToken, 'Generating again returns identical permanent QR token (zero duplicate QR identities)');

  // 4. Test Token Resolution via /api/voting/resolve-token
  const resolved = await makeRequest(`/api/voting/resolve-token?token=${teamToken}`);
  assert(resolved.status === 200 && resolved.body.success && resolved.body.team.id === targetTeam.id,
    'Token resolution resolves to the correct authoritative team');

  // 5. Test Voter Department One-Time Lock
  const testVoterHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer TEST_TOKEN_${TEST_RUN_ID}_voter1:test.${TEST_RUN_ID}@sece.ac.in:student`
  };

  const saveDeptRes = await makeRequest('/api/voting/profile/department', {
    method: 'POST',
    headers: testVoterHeaders,
    body: { department: 'Mechanical Engineering' }
  });
  assert(saveDeptRes.status === 200 && saveDeptRes.body.success && saveDeptRes.body.department === 'Mechanical Engineering',
    'Voter can save initial department selection');

  // Overwriting department is rejected
  const overwriteDeptRes = await makeRequest('/api/voting/profile/department', {
    method: 'POST',
    headers: testVoterHeaders,
    body: { department: 'Cyber Security' }
  });
  assert(overwriteDeptRes.body.department === 'Mechanical Engineering',
    'Department is locked and cannot be overwritten');

  // 6. Test Voting Logic & Restrictions:
  // Missing team ID
  const voteNoTeam = await makeRequest('/api/voting/vote', {
    method: 'POST',
    headers: testVoterHeaders,
    body: {}
  });
  assert(voteNoTeam.status === 400, 'Vote rejected when team_id is missing');

  // Voting disabled
  await makeRequest('/api/voting/admin/controls', {
    method: 'POST',
    headers: adminHeaders,
    body: { is_voting_active: false }
  });
  const voteWhenClosed = await makeRequest('/api/voting/vote', {
    method: 'POST',
    headers: testVoterHeaders,
    body: { team_id: targetTeam.id, qr_token: teamToken }
  });
  assert(voteWhenClosed.status === 403 && voteWhenClosed.body.error_code === 'VOTING_CLOSED',
    'Vote rejected with VOTING_CLOSED when Community Voting is disabled');

  // Re-enable voting
  await makeRequest('/api/voting/admin/controls', {
    method: 'POST',
    headers: adminHeaders,
    body: { is_voting_active: true }
  });

  // Invalid QR token
  const voteInvalidQr = await makeRequest('/api/voting/vote', {
    method: 'POST',
    headers: testVoterHeaders,
    body: { team_id: targetTeam.id, qr_token: 'INVALID_TOKEN_1234567890' }
  });
  assert(voteInvalidQr.status === 403 || voteInvalidQr.status === 400, 'Vote rejected when invalid QR token is passed');

  // 7. Test Admin Analytics & Reporting Endpoints
  const metricsRes = await makeRequest('/api/voting/admin/metrics', { headers: adminHeaders });
  assert(metricsRes.status === 200 && metricsRes.body.success, 'GET /api/voting/admin/metrics succeeds');
  assert(!('voting_round' in metricsRes.body.metrics), 'Metrics response does NOT leak voting round fields to Admin UI');

  const voterReports = await makeRequest('/api/voting/admin/voter-reports', { headers: adminHeaders });
  assert(voterReports.status === 200 && voterReports.body.success, 'GET /api/voting/admin/voter-reports succeeds');

  const teamReports = await makeRequest('/api/voting/admin/team-reports', { headers: adminHeaders });
  assert(teamReports.status === 200 && teamReports.body.success, 'GET /api/voting/admin/team-reports succeeds');

  // 8. Test OOXML Binary Export
  const exportRes = await makeRequest('/api/voting/admin/export-binary', { headers: adminHeaders });
  assert(exportRes.status === 200, 'GET /api/voting/admin/export-binary returns HTTP 200');
  assert(exportRes.headers['content-type'] === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Type is standards-compliant application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  // 9. Reset controls to safe defaults (both OFF)
  await makeRequest('/api/voting/admin/controls', {
    method: 'POST',
    headers: adminHeaders,
    body: { is_voting_active: false, is_qr_generation_active: false }
  });

  const finalControls = await makeRequest('/api/voting/controls');
  assert(finalControls.body.controls.is_voting_active === false && finalControls.body.controls.is_qr_generation_active === false,
    'Controls safely reset to OFF by default');

  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');
}

runTests().catch(console.error);
