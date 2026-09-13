/**
 * test-phase3-sheet-reconciliation.cjs
 * 
 * Comprehensive Test Suite for Phase 3 LinkedIn:
 * - Part 1 & 10: Google Sheet Header Styling & Visual Distinction
 * - Part 2: Website Remove -> Google Sheet Cell Cleared & Database Cleared
 * - Part 3 & 4: Manual Sheet Deletion / Update -> Website Reconciliation (Operational Source of Truth)
 * - Part 5: Stale State Avoidance
 * - Part 7: Team-wide Permissions Maintained
 * - Part 8: Stable Identifier Row Lookup (No duplicate rows)
 * - Scenarios A through J
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const XLSX = require('xlsx');

const projectRoot = __dirname;
const backendDir = path.resolve(projectRoot, 'backend');
const backendRequire = (id) => require(path.join(backendDir, 'node_modules', id));
const express = backendRequire('express');

process.env.NODE_ENV = 'test';

const driveService = require(path.join(backendDir, 'services', 'phase3LinkedInDriveService'));
const { router: phase3Router, isValidLinkedInPostUrl } = require(path.join(backendDir, 'routes', 'phase3Routes'));

let passedCount = 0;
let failedCount = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ ${desc}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ ${desc}`);
    console.error(`     Error: ${err.message}`);
    failedCount++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ ${desc}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ ${desc}`);
    console.error(`     Error: ${err.message}`);
    failedCount++;
  }
}

async function runReconciliationTestSuite() {
  console.log('======================================================================');
  console.log('PHASE 3 LINKEDIN: GOOGLE SHEET POLISH & RECONCILIATION TEST SUITE');
  console.log('======================================================================\n');

  // ==========================================
  // PART 10: GOOGLE SHEET FORMATTING TESTS
  // ==========================================
  console.log('--- PART 1 & 10: GOOGLE SHEET FORMATTING ---');

  it('10.1: Exactly 14 canonical columns in required order preserved without renaming', () => {
    const expectedHeaders = [
      'registration_id',
      'team_id',
      'team_name',
      'leader_name',
      'leader_email',
      'leader_linkedin_post_link',
      'member1_name',
      'member1_email',
      'member1_linkedin_post_link',
      'member2_name',
      'member2_email',
      'member2_linkedin_post_link',
      'last_updated',
      'created_at'
    ];
    assert.strictEqual(driveService.HEADERS.length, 14);
    assert.deepStrictEqual(driveService.HEADERS, expectedHeaders);
  });

  it('10.2: Header styling has bold, white text, centered, wrap text, and sensible widths', () => {
    const ws = XLSX.utils.json_to_sheet([], { header: driveService.HEADERS });
    driveService.applyHeaderFormatting(ws);

    // Columns width
    assert(Array.isArray(ws['!cols']) && ws['!cols'].length === 14, 'Cols width array must have 14 entries');
    assert(ws['!cols'][0].wch >= 15, 'registration_id width sensible');
    assert(ws['!cols'][5].wch >= 40, 'leader_linkedin_post_link width sensible');

    // Row height 32pt
    assert(Array.isArray(ws['!rows']) && ws['!rows'][0].hpt === 32, 'Header row height must be 32pt');

    // Frozen top row
    assert(ws['!freeze'] && ws['!freeze'].ySplit === "2", 'Top row must be frozen');
    assert(ws['!views'] && ws['!views'][0].state === 'frozen', 'View must be frozen at row 1');

    // Standard columns navy background #0B1B3A
    const cellA1 = ws['A1'];
    assert(cellA1 && cellA1.s, 'A1 must have style');
    assert.strictEqual(cellA1.s.font.bold, true, 'A1 text must be bold');
    assert.strictEqual(cellA1.s.font.color.rgb, 'FFFFFF', 'A1 text color must be white');
    assert.strictEqual(cellA1.s.fill.fgColor.rgb, '0B1B3A', 'A1 fill must be Navy #0B1B3A');
    assert.strictEqual(cellA1.s.alignment.horizontal, 'center');
    assert.strictEqual(cellA1.s.alignment.vertical, 'center');
    assert.strictEqual(cellA1.s.alignment.wrapText, true);
  });

  it('10.3: LinkedIn columns (F, I, L) are visually distinct from general columns', () => {
    const ws = XLSX.utils.json_to_sheet([], { header: driveService.HEADERS });
    driveService.applyHeaderFormatting(ws);

    const linkedInCells = ['F1', 'I1', 'L1'];
    linkedInCells.forEach(addr => {
      const cell = ws[addr];
      assert(cell && cell.s, `${addr} must have style`);
      assert.strictEqual(cell.s.font.bold, true);
      assert.strictEqual(cell.s.font.color.rgb, 'FFFFFF');
      assert.strictEqual(cell.s.fill.fgColor.rgb, '1E3A8A', `${addr} must have distinctive accent Navy #1E3A8A`);
      assert.strictEqual(cell.isLinkedInHeader, true, `${addr} must be marked as LinkedIn header`);
    });
  });

  // ==========================================
  // SERVER SETUP FOR SCENARIOS A - J
  // ==========================================
  console.log('\n--- SCENARIOS A THROUGH J: RECONCILIATION & SYNC ---');

  const teamId1 = 'team-reconcile-001';
  const regId1 = 'IPL26-REC1';
  const leaderEmail1 = 'leader1@sece.ac.in';
  const member1Email1 = 'm1@sece.ac.in';
  const member2Email1 = 'm2@sece.ac.in';

  const otherTeamId = 'team-reconcile-999';
  const otherRegId = 'IPL26-OTHER';
  const otherLeaderEmail = 'other@sece.ac.in';

  let testStore = {
    teams: [
      { id: teamId1, team_name: 'Reconcile Titans' },
      { id: otherTeamId, team_name: 'Other Team' }
    ],
    registrations: [
      {
        registration_id: regId1,
        team_name: 'Reconcile Titans',
        leader_name: 'Titan Leader',
        leader_email: leaderEmail1,
        member2_name: 'Titan Member1',
        member2_email: member1Email1,
        member3_name: 'Titan Member2',
        member3_email: member2Email1
      },
      {
        registration_id: otherRegId,
        team_name: 'Other Team',
        leader_name: 'Other Leader',
        leader_email: otherLeaderEmail,
        member2_name: 'Other M1',
        member2_email: 'otherm1@sece.ac.in',
        member3_name: 'Other M2',
        member3_email: 'otherm2@sece.ac.in'
      }
    ],
    products: [
      { id: 'prod-rec-1', team_id: teamId1, product_title: 'Titan Product', legacy_registration_id: regId1 }
    ],
    shortlist: [
      { product_id: 'prod-rec-1', registration_id: regId1 }
    ],
    votes: [],
    likes: [],
    linkedin_submissions: []
  };

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.testStore = testStore;
    next();
  });
  app.use('/api/phase3', phase3Router);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/phase3`;

  function apiCall(method, endpoint, token, body = null) {
    return new Promise((resolve, reject) => {
      const u = new URL(baseUrl + endpoint);
      const payload = body ? JSON.stringify(body) : null;
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      if (payload) {
        headers['Content-Length'] = Buffer.byteLength(payload);
      }

      const req = http.request(u, {
        method,
        headers
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (_) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  try {
    // Initial setup: Team 1 has all 3 slots submitted
    driveService.setMockStoreForTesting([
      {
        registration_id: regId1,
        team_id: teamId1,
        team_name: 'Reconcile Titans',
        leader_name: 'Titan Leader',
        leader_email: leaderEmail1,
        leader_linkedin_post_link: 'https://www.linkedin.com/posts/titan-lead-post',
        member1_name: 'Titan Member1',
        member1_email: member1Email1,
        member1_linkedin_post_link: 'https://www.linkedin.com/posts/titan-m1-post',
        member2_name: 'Titan Member2',
        member2_email: member2Email1,
        member2_linkedin_post_link: 'https://www.linkedin.com/posts/titan-m2-post',
        last_updated: new Date().toISOString(),
        created_at: new Date().toISOString()
      }
    ]);

    testStore.linkedin_submissions = [
      {
        team_id: teamId1,
        registration_id: regId1,
        role: 'leader',
        linkedin_post_url: 'https://www.linkedin.com/posts/titan-lead-post',
        post_url: 'https://www.linkedin.com/posts/titan-lead-post'
      },
      {
        team_id: teamId1,
        registration_id: regId1,
        role: 'member1',
        linkedin_post_url: 'https://www.linkedin.com/posts/titan-m1-post',
        post_url: 'https://www.linkedin.com/posts/titan-m1-post'
      },
      {
        team_id: teamId1,
        registration_id: regId1,
        role: 'member2',
        linkedin_post_url: 'https://www.linkedin.com/posts/titan-m2-post',
        post_url: 'https://www.linkedin.com/posts/titan-m2-post'
      }
    ];

    // SCENARIO A: Website Remove -> Google Sheet (Leader)
    await itAsync('A. Website Remove (Leader): clears DB, clears Sheet cell, preserves M1/M2, returns Pending', async () => {
      const res = await apiCall('DELETE', '/linkedin-submission', `TEST_TOKEN_lead:${leaderEmail1}:student`, {
        teamId: teamId1,
        role: 'leader'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);

      // Verify Google Sheet cell became blank
      const sheetRows = await driveService.readSubmissionsFromDrive();
      const teamRow = sheetRows.find(r => r.registration_id === regId1);
      assert(teamRow, 'Team row must exist in sheet');
      assert.strictEqual(teamRow.leader_linkedin_post_link, '', 'leader_linkedin_post_link must be blank in sheet');
      assert.strictEqual(teamRow.member1_linkedin_post_link, 'https://www.linkedin.com/posts/titan-m1-post', 'member1 slot preserved');
      assert.strictEqual(teamRow.member2_linkedin_post_link, 'https://www.linkedin.com/posts/titan-m2-post', 'member2 slot preserved');

      // Verify testStore / DB cleared
      const leadSub = testStore.linkedin_submissions.find(s => s.team_id === teamId1 && s.role === 'leader');
      assert(!leadSub, 'Leader submission must be removed from DB/store');

      // Verify status endpoint reflects Pending for Leader, Submitted for M1 & M2
      const statusRes = await apiCall('GET', `/status?teamId=${teamId1}`, `TEST_TOKEN_lead:${leaderEmail1}:student`);
      assert.strictEqual(statusRes.status, 200);
      const subs = statusRes.data.linkedinSubmissions;
      assert.strictEqual(subs.leader, null, 'Leader must be Pending');
      assert(subs.member1 && subs.member1.post_url, 'Member 1 must be Submitted');
      assert(subs.member2 && subs.member2.post_url, 'Member 2 must be Submitted');
    });

    // SCENARIO B: Website Remove (Member 1)
    await itAsync('B. Website Remove (Member 1): clears member1_linkedin_post_link only', async () => {
      const res = await apiCall('DELETE', '/linkedin-submission', `TEST_TOKEN_m1:${member1Email1}:student`, {
        teamId: teamId1,
        role: 'member1'
      });
      assert.strictEqual(res.status, 200);

      const sheetRows = await driveService.readSubmissionsFromDrive();
      const teamRow = sheetRows.find(r => r.registration_id === regId1);
      assert.strictEqual(teamRow.member1_linkedin_post_link, '', 'member1_linkedin_post_link must be blank');
      assert.strictEqual(teamRow.member2_linkedin_post_link, 'https://www.linkedin.com/posts/titan-m2-post', 'member2 preserved');

      const statusRes = await apiCall('GET', `/status?teamId=${teamId1}`, `TEST_TOKEN_m1:${member1Email1}:student`);
      const subs = statusRes.data.linkedinSubmissions;
      assert.strictEqual(subs.member1, null, 'Member 1 must be Pending');
      assert(subs.member2 && subs.member2.post_url, 'Member 2 must remain Submitted');
    });

    // SCENARIO C: Website Remove (Member 2)
    await itAsync('C. Website Remove (Member 2): clears member2_linkedin_post_link only', async () => {
      const res = await apiCall('DELETE', '/linkedin-submission', `TEST_TOKEN_m2:${member2Email1}:student`, {
        teamId: teamId1,
        role: 'member2'
      });
      assert.strictEqual(res.status, 200);

      const sheetRows = await driveService.readSubmissionsFromDrive();
      const teamRow = sheetRows.find(r => r.registration_id === regId1);
      assert.strictEqual(teamRow.member2_linkedin_post_link, '', 'member2_linkedin_post_link must be blank');

      const statusRes = await apiCall('GET', `/status?teamId=${teamId1}`, `TEST_TOKEN_m2:${member2Email1}:student`);
      const subs = statusRes.data.linkedinSubmissions;
      assert.strictEqual(subs.leader, null, 'Leader Pending');
      assert.strictEqual(subs.member1, null, 'Member 1 Pending');
      assert.strictEqual(subs.member2, null, 'Member 2 Pending');
    });

    // Reset to all 3 submitted in Sheet & DB for testing D, E, F, G
    function setAllThreeSubmitted() {
      driveService.setMockStoreForTesting([
        {
          registration_id: regId1,
          team_id: teamId1,
          team_name: 'Reconcile Titans',
          leader_name: 'Titan Leader',
          leader_email: leaderEmail1,
          leader_linkedin_post_link: 'https://linkedin.com/posts/titan-leader-init',
          member1_name: 'Titan Member1',
          member1_email: member1Email1,
          member1_linkedin_post_link: 'https://linkedin.com/posts/titan-m1-init',
          member2_name: 'Titan Member2',
          member2_email: member2Email1,
          member2_linkedin_post_link: 'https://linkedin.com/posts/titan-m2-init',
          last_updated: new Date().toISOString()
        }
      ]);
      testStore.linkedin_submissions = [
        { team_id: teamId1, role: 'leader', post_url: 'https://linkedin.com/posts/titan-leader-init' },
        { team_id: teamId1, role: 'member1', post_url: 'https://linkedin.com/posts/titan-m1-init' },
        { team_id: teamId1, role: 'member2', post_url: 'https://linkedin.com/posts/titan-m2-init' }
      ];
    }

    // SCENARIO D: Manual Google Sheet deletion (Leader)
    await itAsync('D. Manual Google Sheet deletion (Leader): Leader=Pending, M1=Submitted, M2=Submitted', async () => {
      setAllThreeSubmitted();

      // Manually simulate: organizer clears leader cell in Google Sheet
      const sheetRows = await driveService.readSubmissionsFromDrive();
      sheetRows[0].leader_linkedin_post_link = '   '; // simulates manual blank/empty space in sheet
      driveService.setMockStoreForTesting(sheetRows);

      // Trigger reconciliation via GET /status
      const statusRes = await apiCall('GET', `/status?teamId=${teamId1}`, `TEST_TOKEN_lead:${leaderEmail1}:student`);
      assert.strictEqual(statusRes.status, 200);
      const subs = statusRes.data.linkedinSubmissions;

      assert.strictEqual(subs.leader, null, 'Leader must reconcile to Pending (null)');
      assert(subs.member1 && subs.member1.post_url === 'https://linkedin.com/posts/titan-m1-init', 'M1 must be Submitted');
      assert(subs.member2 && subs.member2.post_url === 'https://linkedin.com/posts/titan-m2-init', 'M2 must be Submitted');

      // Also verify testStore/DB was cleaned up
      const dbLead = testStore.linkedin_submissions.find(s => s.team_id === teamId1 && s.role === 'leader');
      assert(!dbLead, 'Leader must be removed from DB on reconciliation');
    });

    // SCENARIO E: Manual Google Sheet deletion (Member 1)
    await itAsync('E. Manual deletion of Member 1: Leader=Submitted, M1=Pending, M2=Submitted', async () => {
      setAllThreeSubmitted();

      const sheetRows = await driveService.readSubmissionsFromDrive();
      sheetRows[0].member1_linkedin_post_link = '';
      driveService.setMockStoreForTesting(sheetRows);

      const statusRes = await apiCall('GET', `/status?teamId=${teamId1}`, `TEST_TOKEN_m1:${member1Email1}:student`);
      const subs = statusRes.data.linkedinSubmissions;

      assert(subs.leader && subs.leader.post_url === 'https://linkedin.com/posts/titan-leader-init', 'Leader must be Submitted');
      assert.strictEqual(subs.member1, null, 'M1 must reconcile to Pending (null)');
      assert(subs.member2 && subs.member2.post_url === 'https://linkedin.com/posts/titan-m2-init', 'M2 must be Submitted');
    });

    // SCENARIO F: Manual Google Sheet deletion (Member 2)
    await itAsync('F. Manual deletion of Member 2: Leader=Submitted, M1=Submitted, M2=Pending', async () => {
      setAllThreeSubmitted();

      const sheetRows = await driveService.readSubmissionsFromDrive();
      sheetRows[0].member2_linkedin_post_link = '';
      driveService.setMockStoreForTesting(sheetRows);

      const statusRes = await apiCall('GET', `/status?teamId=${teamId1}`, `TEST_TOKEN_m2:${member2Email1}:student`);
      const subs = statusRes.data.linkedinSubmissions;

      assert(subs.leader && subs.leader.post_url === 'https://linkedin.com/posts/titan-leader-init', 'Leader Submitted');
      assert(subs.member1 && subs.member1.post_url === 'https://linkedin.com/posts/titan-m1-init', 'M1 Submitted');
      assert.strictEqual(subs.member2, null, 'M2 must reconcile to Pending (null)');
    });

    // SCENARIO G: Manual Sheet value update
    await itAsync('G. Manual sheet value update: reconciles to Submitted and updates DB with new value', async () => {
      setAllThreeSubmitted();

      const newPostUrl = 'https://linkedin.com/posts/titan-leader-updated-from-sheet';
      const sheetRows = await driveService.readSubmissionsFromDrive();
      sheetRows[0].leader_linkedin_post_link = newPostUrl;
      driveService.setMockStoreForTesting(sheetRows);

      const statusRes = await apiCall('GET', `/status?teamId=${teamId1}`, `TEST_TOKEN_lead:${leaderEmail1}:student`);
      const subs = statusRes.data.linkedinSubmissions;

      assert(subs.leader, 'Leader must be Submitted');
      assert.strictEqual(subs.leader.post_url, newPostUrl, 'Leader must display updated sheet value');

      // Verify DB synchronized
      const dbLead = testStore.linkedin_submissions.find(s => s.team_id === teamId1 && s.role === 'leader');
      assert(dbLead && dbLead.post_url === newPostUrl, 'DB must be synchronized with new sheet value');
    });

    // SCENARIO H: Cross-team protection
    await itAsync('H. Cross-team protection: Other team member cannot update/remove Team 1 submissions (403)', async () => {
      const updateRes = await apiCall('POST', '/linkedin-submission', `TEST_TOKEN_other:${otherLeaderEmail}:student`, {
        teamId: teamId1,
        role: 'leader',
        linkedin_post_url: 'https://linkedin.com/posts/malicious'
      });
      assert.strictEqual(updateRes.status, 403, 'Cross-team submission must return 403');

      const removeRes = await apiCall('DELETE', '/linkedin-submission', `TEST_TOKEN_other:${otherLeaderEmail}:student`, {
        teamId: teamId1,
        role: 'leader'
      });
      assert.strictEqual(removeRes.status, 403, 'Cross-team removal must return 403');
    });

    // SCENARIO I: Team-wide permissions
    await itAsync('I. Team-wide permissions: Member 2 can edit and remove Leader slot for own team', async () => {
      // Member 2 saves for Leader
      const saveRes = await apiCall('POST', '/linkedin-submission', `TEST_TOKEN_m2:${member2Email1}:student`, {
        teamId: teamId1,
        role: 'leader',
        linkedin_post_url: 'https://linkedin.com/posts/m2-editing-leader'
      });
      assert.strictEqual(saveRes.status, 200, 'Member 2 can save Leader slot');

      // Member 1 removes Leader slot
      const removeRes = await apiCall('DELETE', '/linkedin-submission', `TEST_TOKEN_m1:${member1Email1}:student`, {
        teamId: teamId1,
        role: 'leader'
      });
      assert.strictEqual(removeRes.status, 200, 'Member 1 can remove Leader slot');
    });

    // SCENARIO J: No URL format restriction
    it('J. No URL restriction: Any non-empty text accepted, only empty rejected', () => {
      assert.strictEqual(isValidLinkedInPostUrl('https://linkedin.com/posts/anything'), true);
      assert.strictEqual(isValidLinkedInPostUrl('https://lnkd.in/test123'), true);
      assert.strictEqual(isValidLinkedInPostUrl('https://example.com/arbitrary'), true);
      assert.strictEqual(isValidLinkedInPostUrl('plain text post link'), true);
      assert.strictEqual(isValidLinkedInPostUrl('abc123'), true);
      assert.strictEqual(isValidLinkedInPostUrl('m'), true);

      assert.strictEqual(isValidLinkedInPostUrl(''), false);
      assert.strictEqual(isValidLinkedInPostUrl('   '), false);
      assert.strictEqual(isValidLinkedInPostUrl(null), false);
      assert.strictEqual(isValidLinkedInPostUrl(undefined), false);
    });

  } finally {
    server.close();
    driveService.resetCacheForTesting();
  }

  console.log('======================================================================');
  console.log(`RECONCILIATION SUMMARY: ${passedCount} Passed, ${failedCount} Failed`);
  console.log('======================================================================');
  if (failedCount > 0) {
    process.exit(1);
  }
}

runReconciliationTestSuite();
