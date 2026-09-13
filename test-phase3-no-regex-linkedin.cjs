// test-phase3-no-regex-linkedin.cjs
/**
 * PHASE 3: REMOVE LINKEDIN POST URL REGEX VALIDATION TEST SUITE
 * 
 * Verifies all 15 requirements:
 * 1. A normal LinkedIn post URL can be submitted.
 * 2. A LinkedIn URL that does not match the old regex can still be submitted (e.g. profile URL /in/, /events/, /learning/, custom params).
 * 3. The URL is stored exactly after trimming.
 * 4. No LinkedIn-specific regex rejection occurs.
 * 5. Empty submission is still handled according to existing required-field behavior (rejected with 400).
 * 6. Edit still works.
 * 7. Remove still works.
 * 8. Updating one member does not overwrite the other slots.
 * 9. One row per team remains.
 * 10. Team-wide permission remains (any enrolled member can submit any slot).
 * 11. Cross-team access remains blocked (403 FORBIDDEN).
 * 12. Google Sheet storage remains functional.
 * 13. XLSX export remains functional.
 * 14. No LinkedIn API is introduced.
 * 15. No LinkedIn scraping is introduced.
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const backendDir = path.resolve(__dirname, 'backend');
const backendRequire = (id) => require(require.resolve(id, { paths: [backendDir] }));
const express = backendRequire('express');

const { router: phase3Router, isValidLinkedInPostUrl } = require('./backend/routes/phase3Routes');
const phase3LinkedInDriveService = require('./backend/services/phase3LinkedInDriveService');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================================');
  console.log('PHASE 3: NO-REGEX LINKEDIN URL VALIDATION & SUBMISSION TEST SUITE');
  console.log('======================================================================\n');

  // Unit Check: Any non-empty text accepted, only empty rejected
  it('Unit: Any non-empty text accepted (LinkedIn, non-LinkedIn, plain text, arbitrary text)', () => {
    // LinkedIn URLs
    assert.strictEqual(isValidLinkedInPostUrl('https://www.linkedin.com/posts/johndoe_innovation-activity-1234567890'), true);
    assert.strictEqual(isValidLinkedInPostUrl('https://linkedin.com/feed/update/urn:li:activity:7123456789012345678/'), true);
    assert.strictEqual(isValidLinkedInPostUrl('https://www.linkedin.com/in/johndoe-profile-12345/'), true, 'Profile URL must be accepted');
    assert.strictEqual(isValidLinkedInPostUrl('https://linkedin.com/in/leader-name'), true, 'Short profile URL must be accepted');
    assert.strictEqual(isValidLinkedInPostUrl('https://lnkd.in/customShare123'), true, 'Shortened link must be accepted');
    assert.strictEqual(isValidLinkedInPostUrl('www.linkedin.com/anything'), true, 'Without protocol accepted');

    // Non-LinkedIn URLs and plain text
    assert.strictEqual(isValidLinkedInPostUrl('https://example.com/anything'), true, 'Non-LinkedIn URL accepted');
    assert.strictEqual(isValidLinkedInPostUrl('https://google.com'), true, 'Google URL accepted');
    assert.strictEqual(isValidLinkedInPostUrl('abc123'), true, 'Plain text accepted');
    assert.strictEqual(isValidLinkedInPostUrl('any other non-empty text'), true, 'Arbitrary text accepted');
  });

  it('Unit: Empty, null, undefined, or whitespace-only value rejected', () => {
    assert.strictEqual(isValidLinkedInPostUrl(''), false, 'Empty string must be rejected');
    assert.strictEqual(isValidLinkedInPostUrl('   '), false, 'Whitespace-only string must be rejected');
    assert.strictEqual(isValidLinkedInPostUrl(null), false, 'Null must be rejected');
    assert.strictEqual(isValidLinkedInPostUrl(undefined), false, 'Undefined must be rejected');
  });

  // Test Server Setup
  const app = express();
  app.use(express.json());

  const mockTeamA = {
    id: '11111111-1111-4111-a111-111111111111',
    team_name: 'Alpha Innovators'
  };

  const mockRegA = {
    registration_id: 'IPL26-0001',
    team_name: 'Alpha Innovators',
    leader_name: 'Alice Leader',
    leader_email: 'alice.leader@sece.ac.in',
    member2_name: 'Bob MemberOne',
    member2_email: 'bob.member1@sece.ac.in',
    member3_name: 'Charlie MemberTwo',
    member3_email: 'charlie.member2@sece.ac.in'
  };

  const mockTeamB = {
    id: '22222222-2222-4222-a222-222222222222',
    team_name: 'Beta Creators'
  };

  const mockRegB = {
    registration_id: 'IPL26-0002',
    team_name: 'Beta Creators',
    leader_name: 'David LeaderB',
    leader_email: 'david.leaderb@sece.ac.in',
    member2_name: 'Eve MemberB1',
    member2_email: 'eve.memberb1@sece.ac.in'
  };

  const mockStore = {
    teams: [mockTeamA, mockTeamB],
    registrations: [mockRegA, mockRegB],
    products: [],
    shortlist: [],
    votes: [],
    likes: [],
    linkedin_submissions: []
  };

  let mockDriveRows = [];
  phase3LinkedInDriveService.setMockStoreForTesting(mockDriveRows);

  app.use((req, res, next) => {
    req.testStore = mockStore;
    next();
  });

  app.use('/api/phase3', phase3Router);

  const server = app.listen(0);
  const port = server.address().port;

  const tokens = {
    teamA_leader: 'TEST_TOKEN_1:alice.leader@sece.ac.in:participant',
    teamA_member1: 'TEST_TOKEN_2:bob.member1@sece.ac.in:participant',
    teamA_member2: 'TEST_TOKEN_3:charlie.member2@sece.ac.in:participant',
    teamB_leader: 'TEST_TOKEN_4:david.leaderb@sece.ac.in:participant',
    outsider: 'TEST_TOKEN_5:stranger@sece.ac.in:participant'
  };

  function apiPost(endpoint, body, token) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const req = http.request({
        hostname: 'localhost',
        port,
        path: endpoint,
        method: 'POST',
        headers
      }, (res) => {
        let resBody = '';
        res.on('data', chunk => resBody += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(resBody) });
          } catch (e) {
            resolve({ status: res.statusCode, data: resBody });
          }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  function apiGet(endpoint, token) {
    return new Promise((resolve, reject) => {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const req = http.request({
        hostname: 'localhost',
        port,
        path: endpoint,
        method: 'GET',
        headers
      }, (res) => {
        let resBody = '';
        res.on('data', chunk => resBody += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(resBody) });
          } catch (e) {
            resolve({ status: res.statusCode, data: resBody });
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  function apiDelete(endpoint, body, token) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const req = http.request({
        hostname: 'localhost',
        port,
        path: endpoint,
        method: 'DELETE',
        headers
      }, (res) => {
        let resBody = '';
        res.on('data', chunk => resBody += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(resBody) });
          } catch (e) {
            resolve({ status: res.statusCode, data: resBody });
          }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  try {
    // 1. Valid LinkedIn URL accepted
    await itAsync('1. Valid LinkedIn URL accepted', async () => {
      const res = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'leader',
        linkedin_post_url: 'https://www.linkedin.com/posts/alice-leader-activity-9999999999'
      }, tokens.teamA_leader);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
    });

    // 2. LinkedIn profile URL accepted
    await itAsync('2. LinkedIn profile URL accepted', async () => {
      const res = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'member1',
        linkedin_post_url: 'https://www.linkedin.com/in/bob-member1'
      }, tokens.teamA_member1);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
    });

    // 3. LinkedIn post URL accepted
    await itAsync('3. LinkedIn post URL accepted', async () => {
      const res = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'member2',
        linkedin_post_url: 'https://linkedin.com/feed/update/urn:li:activity:7123456789012345678/'
      }, tokens.teamA_member2);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
    });

    // 4. Non-LinkedIn URL accepted
    await itAsync('4. Non-LinkedIn URL accepted', async () => {
      const res = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'member1',
        linkedin_post_url: 'https://example.com/anything'
      }, tokens.teamA_member1);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
    });

    // 5. URL without https accepted
    await itAsync('5. URL without https accepted', async () => {
      const res = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'member1',
        linkedin_post_url: 'www.linkedin.com/anything'
      }, tokens.teamA_member1);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
    });

    // 6. Plain text accepted
    await itAsync('6. Plain text accepted', async () => {
      const res = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'member1',
        linkedin_post_url: 'abc123'
      }, tokens.teamA_member1);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
    });

    // 7. Arbitrary non-empty text accepted
    await itAsync('7. Arbitrary non-empty text accepted', async () => {
      const res = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'member1',
        linkedin_post_url: 'any other non-empty text'
      }, tokens.teamA_member1);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
    });

    // 7b. Explicit required regression test values
    await itAsync('7b. Explicit required regression test values are all accepted', async () => {
      const testInputs = [
        'abc123',
        'my LinkedIn post',
        'https://example.com/test',
        'https://lnkd.in/abc123',
        'https://www.linkedin.com/posts/test'
      ];
      for (const input of testInputs) {
        const res = await apiPost('/api/phase3/linkedin-submission', {
          teamId: mockTeamA.id,
          role: 'member1',
          linkedin_post_url: input
        }, tokens.teamA_member1);
        assert.strictEqual(res.status, 200, `Failed to accept input: ${input}`);
        assert.strictEqual(res.data.submission.linkedin_post_url, input);
      }
    });

    // 8. Query-string URL accepted
    await itAsync('8. Query-string URL accepted', async () => {
      const res = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'member1',
        linkedin_post_url: 'https://example.com/post?id=123&ref=share&tracking_tag=ipl_2026'
      }, tokens.teamA_member1);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
    });

    // 9. Long but reasonable non-empty text follows field length rule (<=1000 accepted, >1000 rejected)
    await itAsync('9. Long non-empty text follows field length rule', async () => {
      const validLong = 'https://example.com/' + 'a'.repeat(400);
      const resValid = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'member1',
        linkedin_post_url: validLong
      }, tokens.teamA_member1);
      assert.strictEqual(resValid.status, 200);

      const tooLong = 'https://example.com/' + 'a'.repeat(1050);
      const resTooLong = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'member1',
        linkedin_post_url: tooLong
      }, tokens.teamA_member1);
      assert.strictEqual(resTooLong.status, 400);
      assert.strictEqual(resTooLong.data.error_code, 'URL_TOO_LONG');
    });

    // 10. Empty value rejected
    await itAsync('10. Empty value rejected', async () => {
      const res = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'member1',
        linkedin_post_url: ''
      }, tokens.teamA_member1);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.error_code, 'MISSING_URL');
    });

    // 11. Whitespace-only value rejected
    await itAsync('11. Whitespace-only value rejected', async () => {
      const res = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'member1',
        linkedin_post_url: '     '
      }, tokens.teamA_member1);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.error_code, 'MISSING_URL');
    });

    // 12. Leading/trailing whitespace is trimmed before storage
    await itAsync('12. Leading/trailing whitespace is trimmed before storage', async () => {
      const inputVal = '   https://example.com/my-post   ';
      const expectedTrimmed = 'https://example.com/my-post';

      const res = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'member1',
        linkedin_post_url: inputVal
      }, tokens.teamA_member1);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.submission.linkedin_post_url, expectedTrimmed);

      const driveRows = await phase3LinkedInDriveService.readSubmissionsFromDrive();
      const driveRow = driveRows.find(r => r.team_id === mockTeamA.id);
      assert.strictEqual(driveRow.member1_linkedin_post_link, expectedTrimmed);
    });

    // 13. Edit works
    await itAsync('13. Edit works (updating slot modifies it in Drive)', async () => {
      const updatedVal = 'new_updated_submission_value_456';
      const res = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'member1',
        linkedin_post_url: updatedVal
      }, tokens.teamA_leader);

      assert.strictEqual(res.status, 200);
      const driveRows = await phase3LinkedInDriveService.readSubmissionsFromDrive();
      const driveRow = driveRows.find(r => r.team_id === mockTeamA.id);
      assert.strictEqual(driveRow.member1_linkedin_post_link, updatedVal);
      // Other slots preserved
      assert(driveRow.leader_linkedin_post_link.length > 0, 'Leader slot preserved');
      assert(driveRow.member2_linkedin_post_link.length > 0, 'Member 2 slot preserved');
    });

    // 14. Remove works
    await itAsync('14. Remove works (resets single slot to empty string)', async () => {
      const res = await apiDelete('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'member2'
      }, tokens.teamA_member2);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);

      const driveRows = await phase3LinkedInDriveService.readSubmissionsFromDrive();
      const driveRow = driveRows.find(r => r.team_id === mockTeamA.id);
      assert.strictEqual(driveRow.member2_linkedin_post_link, '', 'Removed slot must be empty');
      assert(driveRow.leader_linkedin_post_link.length > 0, 'Leader slot must remain intact');
      assert(driveRow.member1_linkedin_post_link.length > 0, 'Member 1 slot must remain intact');
    });

    // 15. Team-wide permission remains
    await itAsync('15. Team-wide permission remains (any team member can update any slot)', async () => {
      const member2NewVal = 'charlie_new_post_by_bob';
      const res = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamA.id,
        role: 'member2',
        linkedin_post_url: member2NewVal
      }, tokens.teamA_member1); // Submitted by Member 1 for Member 2 slot

      assert.strictEqual(res.status, 200);
      const driveRows = await phase3LinkedInDriveService.readSubmissionsFromDrive();
      const driveRow = driveRows.find(r => r.team_id === mockTeamA.id);
      assert.strictEqual(driveRow.member2_linkedin_post_link, member2NewVal);
    });

    // 16. Cross-team access remains blocked
    await itAsync('16. Cross-team access remains blocked (403 FORBIDDEN)', async () => {
      const res = await apiPost('/api/phase3/linkedin-submission', {
        teamId: mockTeamB.id,
        role: 'leader',
        linkedin_post_url: 'https://example.com/unauthorized'
      }, tokens.teamA_member1); // Team A member attempting to write to Team B

      assert.strictEqual(res.status, 403, 'Cross-team submission must be forbidden');
      assert.strictEqual(res.data.error_code, 'FORBIDDEN');
    });

    // 17. Google Drive storage remains functional
    await itAsync('17. Google Drive storage remains functional (single row per team and XLSX export)', async () => {
      const driveRows = await phase3LinkedInDriveService.readSubmissionsFromDrive();
      const teamARows = driveRows.filter(r => r.team_id === mockTeamA.id);
      assert.strictEqual(teamARows.length, 1, 'Only one row per team must exist');

      const exported = await phase3LinkedInDriveService.exportSubmissionsXlsx();
      assert(exported.buffer, 'Exported XLSX buffer must exist');
      assert(Buffer.isBuffer(exported.buffer), 'Must be a Buffer');
      assert(exported.buffer.length > 1000, 'XLSX must have valid file content');
    });

    // Safety checks: No LinkedIn API or scraping dependencies
    it('Bonus: No LinkedIn API or scraping dependencies exist', () => {
      const routesCode = fs.readFileSync(path.resolve(__dirname, 'backend/routes/phase3Routes.js'), 'utf8');
      const driveCode = fs.readFileSync(path.resolve(__dirname, 'backend/services/phase3LinkedInDriveService.js'), 'utf8');

      assert(!routesCode.includes('api.linkedin.com'), 'No LinkedIn API calls in routes');
      assert(!driveCode.includes('api.linkedin.com'), 'No LinkedIn API calls in drive service');
      assert(!driveCode.includes('cheerio') && !driveCode.includes('puppeteer'), 'No scraping tools in drive service');
      assert(!routesCode.includes('cheerio') && !routesCode.includes('puppeteer'), 'No scraping tools in routes');
    });

  } finally {
    server.close();
  }

  console.log('\n======================================================================');
  console.log(`PHASE 3 NO-REGEX SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
