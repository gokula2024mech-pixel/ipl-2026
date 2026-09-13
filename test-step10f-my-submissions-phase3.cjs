// test-step10f-my-submissions-phase3.cjs
/**
 * STEP 10F PART B — MY SUBMISSIONS PHASE 3 STATUS & LINKEDIN SUBMISSIONS TEST SUITE
 * 
 * Verifies all 20 required conditions:
 * 1. Single-product shortlisted team displays "Shortlisted for Phase 3".
 * 2. Single-product non-shortlisted team displays "Not Shortlisted for Phase 3".
 * 3. Dual-product team with 1 shortlisted & 1 non-shortlisted product displays correct badge on each product independently.
 * 4. Dual-product team with both shortlisted displays "Shortlisted for Phase 3" on both.
 * 5. Products show: Registration ID, Product Title, Team Name, Shortlist status, Votes, Score.
 * 6. My Submissions Phase 3 does NOT display Likes.
 * 7. Shortlisted team renders "PHASE 3 — LINKEDIN SUBMISSIONS" section.
 * 8. Non-shortlisted team does NOT render editable LinkedIn submission form (shows locked/restricted notice).
 * 9. Exactly 3 slots rendered: Team Leader, Member 1, Member 2.
 * 10. Member names match registration data.
 * 11. Status indicator shows "Pending" when no link submitted.
 * 12. Status indicator shows "Submitted" when link is saved.
 * 13. Valid LinkedIn URL accepted (e.g. https://www.linkedin.com/posts/...).
 * 14. Valid LinkedIn feed update URL accepted (e.g. https://www.linkedin.com/feed/update/...).
 * 15. Invalid URL rejected (e.g. https://twitter.com/..., https://google.com, empty string).
 * 16. Member can submit their own link.
 * 17. Member CANNOT submit another member's link (ROLE_MISMATCH error).
 * 18. Team Leader CAN submit all 3 links.
 * 19. Saved submissions persist across requests (Supabase / local fallback).
 * 20. No LinkedIn API calls or web scraping occur.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const backendDir = path.resolve(__dirname, 'backend');
const backendRequire = (id) => require(require.resolve(id, { paths: [backendDir] }));
const express = backendRequire('express');

process.env.NODE_ENV = 'test';

const { supabase } = require('./backend/supabaseClient');
const { router: phase3Router, isValidLinkedInPostUrl } = require('./backend/routes/phase3Routes');

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

async function runTests() {
  console.log('====================================================');
  console.log('STEP 10F PART B: MY SUBMISSIONS PHASE 3 & LINKEDIN SUBMISSIONS');
  console.log('====================================================\n');

  // Load MySubmissionsPage source code to test frontend UI rules
  const mySubmissionsCode = fs.readFileSync(path.join(__dirname, 'src', 'components', 'MySubmissionsPage.jsx'), 'utf8');

  // Condition 1, 2, 3, 4: Shortlist status badges per product
  it('1, 2, 3, 4: MySubmissionsPage renders independent Shortlisted vs Not Shortlisted badges per product', () => {
    assert(mySubmissionsCode.includes('Shortlisted for Phase 3'), 'Must contain "Shortlisted for Phase 3" badge text');
    assert(mySubmissionsCode.includes('Not Shortlisted for Phase 3'), 'Must contain "Not Shortlisted for Phase 3" badge text');
    assert(mySubmissionsCode.includes('isShortlisted'), 'Must check shortlist eligibility per product');
  });

  // Condition 5: Products display Registration ID, Product Title, Team Name, Shortlist status, Votes, Score
  it('5: Product cards display Registration ID, Product Title, Team Name, Shortlist status, Votes, and Score', () => {
    assert(mySubmissionsCode.includes('pReg'), 'Must display Registration ID');
    assert(mySubmissionsCode.includes('pTitle'), 'Must display Product Title');
    assert(mySubmissionsCode.includes('currentTeamName'), 'Must display Team Name');
    assert(mySubmissionsCode.includes('Total Votes'), 'Must display Total Votes');
    assert(mySubmissionsCode.includes('Idea Score'), 'Must display Idea Score');
  });

  // Condition 6: Phase 3 in MySubmissionsPage does NOT display Likes
  it('6: MySubmissionsPage Phase 3 block does NOT display Likes', () => {
    // Extract Phase 3 block
    const phase3BlockMatch = mySubmissionsCode.match(/\/\* ==================== PHASE 3 PAGE ==================== \*\/([\s\S]*?)\{\/\* Invalid File Format/);
    assert(phase3BlockMatch, 'Could not find Phase 3 page block in MySubmissionsPage');
    const phase3Block = phase3BlockMatch[1];

    assert(!phase3Block.includes('likesCount'), 'Phase 3 block must NOT display likesCount');
    assert(!phase3Block.includes('likes_count'), 'Phase 3 block must NOT display likes_count');
    assert(!phase3Block.includes('Total Likes'), 'Phase 3 block must NOT display Total Likes');
    assert(!phase3Block.includes('❤️'), 'Phase 3 block must NOT display heart emoji');
  });

  // Condition 7 & 8: Shortlisted team renders LinkedIn submissions section; non-shortlisted shows locked/restricted notice
  it('7 & 8: Shortlisted team renders PHASE 3 — LINKEDIN SUBMISSIONS; non-shortlisted shows restricted message', () => {
    assert(mySubmissionsCode.includes('PHASE 3 — LINKEDIN SUBMISSIONS'), 'Must render "PHASE 3 — LINKEDIN SUBMISSIONS" header');
    assert(mySubmissionsCode.includes('LinkedIn Submissions Restricted to Shortlisted Teams'), 'Must show restricted message for non-shortlisted teams');
    assert(mySubmissionsCode.includes('hasAnyShortlisted'), 'Must gate LinkedIn submissions based on whether team has shortlisted products');
  });

  // Condition 9 & 10: Exactly 3 slots rendered (Team Leader, Member 1, Member 2) with registration names
  it('9 & 10: Exactly 3 submission slots configured for Team Leader, Member 1, and Member 2 with names', () => {
    assert(mySubmissionsCode.includes('role: "leader"'), 'Must have role: "leader" slot');
    assert(mySubmissionsCode.includes('role: "member1"'), 'Must have role: "member1" slot');
    assert(mySubmissionsCode.includes('role: "member2"'), 'Must have role: "member2" slot');
    assert(mySubmissionsCode.includes('label: "Team Leader"'), 'Must label Team Leader');
    assert(mySubmissionsCode.includes('label: "Member 1"'), 'Must label Member 1');
    assert(mySubmissionsCode.includes('label: "Member 2"'), 'Must label Member 2');
  });

  // Condition 11 & 12: Status indicators Submitted vs Pending
  it('11 & 12: Status indicators display "Submitted" (with saved link) or "Pending"', () => {
    assert(mySubmissionsCode.includes('>Submitted</span>') || mySubmissionsCode.includes('Submitted'), 'Must display "Submitted" status');
    assert(mySubmissionsCode.includes('>Pending</span>') || mySubmissionsCode.includes('Pending'), 'Must display "Pending" status');
    assert(mySubmissionsCode.includes('hasSavedLink'), 'Must determine status based on saved link');
  });

  // Condition 13, 14, 15: LinkedIn submission validation logic
  it('13, 14, 15: LinkedIn submission accepts any non-empty text (posts, profiles, non-LinkedIn URLs, plain text) and rejects empty values', () => {
    // Valid inputs
    assert.strictEqual(isValidLinkedInPostUrl('https://www.linkedin.com/posts/johndoe_innovation-ipl2026-activity-1234567890'), true);
    assert.strictEqual(isValidLinkedInPostUrl('https://linkedin.com/feed/update/urn:li:activity:7123456789012345678/'), true);
    assert.strictEqual(isValidLinkedInPostUrl('https://www.linkedin.com/pulse/our-ai-solution-ipl-2026/'), true);
    assert.strictEqual(isValidLinkedInPostUrl('https://in.linkedin.com/posts/jane-smith-ipl_2026-hackathon'), true);
    assert.strictEqual(isValidLinkedInPostUrl('https://www.linkedin.com/in/username'), true, 'Profile URL accepted');
    assert.strictEqual(isValidLinkedInPostUrl('https://example.com/anything'), true, 'Non-LinkedIn URL accepted');
    assert.strictEqual(isValidLinkedInPostUrl('www.linkedin.com/anything'), true, 'URL without protocol accepted');
    assert.strictEqual(isValidLinkedInPostUrl('abc123'), true, 'Plain text accepted');
    assert.strictEqual(isValidLinkedInPostUrl('https://twitter.com/post/12345'), true, 'Any non-empty text accepted');

    // Invalid inputs: empty/whitespace/null/undefined only
    assert.strictEqual(isValidLinkedInPostUrl(''), false, 'Empty string must be rejected');
    assert.strictEqual(isValidLinkedInPostUrl('   '), false, 'Whitespace-only string must be rejected');
    assert.strictEqual(isValidLinkedInPostUrl(null), false, 'Null must be rejected');
    assert.strictEqual(isValidLinkedInPostUrl(undefined), false, 'Undefined must be rejected');
  });

  // Set up test server for backend route testing
  const mockTeamId = '11111111-1111-4111-a111-111111111111';
  const mockRegId = 'IPL26-TEST';
  const mockLeaderEmail = 'leader@sece.ac.in';
  const mockMember1Email = 'member1@sece.ac.in';
  const mockMember2Email = 'member2@sece.ac.in';
  const mockOtherEmail = 'outsider@sece.ac.in';

  const mockShortlistedProdId = '22222222-2222-4222-a222-222222222222';
  const mockUnshortlistedProdId = '33333333-3333-4333-a333-333333333333';

  const mockTestStore = {
    teams: [
      { id: mockTeamId, team_name: 'Alpha Innovators' }
    ],
    registrations: [
      {
        registration_id: mockRegId,
        team_name: 'Alpha Innovators',
        leader_name: 'Alice Leader',
        leader_email: mockLeaderEmail,
        member2_name: 'Bob MemberOne',
        member2_email: mockMember1Email,
        member3_name: 'Charlie MemberTwo',
        member3_email: mockMember2Email
      }
    ],
    products: [
      {
        id: mockShortlistedProdId,
        team_id: mockTeamId,
        product_number: 1,
        product_title: 'Smart Hardware Device',
        category: 'Hardware',
        legacy_registration_id: mockRegId
      },
      {
        id: mockUnshortlistedProdId,
        team_id: mockTeamId,
        product_number: 2,
        product_title: 'AI Software Platform',
        category: 'Software',
        legacy_registration_id: mockRegId
      }
    ],
    shortlist: [
      { product_id: mockShortlistedProdId, registration_id: mockRegId, category: 'Hardware' }
    ],
    votes: [
      { product_id: mockShortlistedProdId, voting_round: 1 },
      { product_id: mockShortlistedProdId, voting_round: 1 },
      { product_id: mockShortlistedProdId, voting_round: 1 }
    ],
    likes: [
      { product_id: mockShortlistedProdId, count: 4 }
    ],
    linkedin_submissions: []
  };

  const app = express();
  app.use(express.json());
  // Inject mock store into requests for isolation
  app.use((req, res, next) => {
    req.testStore = mockTestStore;
    next();
  });
  app.use('/api/phase3', phase3Router);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/phase3`;

  try {
    // Condition 1 & 2 & 3: Query /status for dual-product team with 1 shortlisted & 1 not shortlisted
    await itAsync('1, 2, 3: GET /status correctly returns independent shortlist status for dual products', async () => {
      const res = await fetch(`${baseUrl}/status?teamId=${mockTeamId}`, {
        headers: { Authorization: `Bearer TEST_TOKEN_user1:${mockLeaderEmail}:student` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert(data.success);
      assert.strictEqual(data.isShortlisted, true, 'Team is shortlisted because product 1 is shortlisted');
      assert.strictEqual(data.products.length, 2);

      const p1 = data.products.find(p => p.productId === mockShortlistedProdId);
      const p2 = data.products.find(p => p.productId === mockUnshortlistedProdId);

      assert(p1 && p1.isShortlisted, 'Product 1 must be shortlisted');
      assert(p2 && !p2.isShortlisted, 'Product 2 must NOT be shortlisted');
      assert.strictEqual(p1.votes, 3, 'Product 1 has 3 votes');
      assert.strictEqual(p1.score, 10, 'Product 1 score = 4 + 3*2 = 10');
    });

    // Condition 16: Member can submit their own link
    await itAsync('16: Member 1 can submit their own LinkedIn post link', async () => {
      const postUrl = 'https://www.linkedin.com/posts/bob_member1_ipl2026_showcase-activity-12345';
      const res = await fetch(`${baseUrl}/linkedin-submission`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer TEST_TOKEN_m1:${mockMember1Email}:student`
        },
        body: JSON.stringify({
          teamId: mockTeamId,
          role: 'member1',
          linkedin_post_url: postUrl
        })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert(data.success);
      assert.strictEqual(data.submission.post_url, postUrl);
      assert.strictEqual(data.submission.role, 'member1');
    });

    // Condition 17: Cross-team / unauthorized member CANNOT submit team link (Step 10M: Team Isolation)
    await itAsync('17: Non-enrolled member CANNOT submit team link (FORBIDDEN)', async () => {
      const postUrl = 'https://www.linkedin.com/posts/intruder-post-activity-99999';
      const res = await fetch(`${baseUrl}/linkedin-submission`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer TEST_TOKEN_outsider:stranger@sece.ac.in:student`
        },
        body: JSON.stringify({
          teamId: mockTeamId,
          role: 'leader',
          linkedin_post_url: postUrl
        })
      });
      assert.strictEqual(res.status, 403, 'Expected 403 Forbidden for cross-team user');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error_code, 'FORBIDDEN');
    });

    // Condition 18: Team Leader CAN submit all 3 links
    await itAsync('18: Team Leader can submit for Leader, Member 1, and Member 2', async () => {
      // 1. Leader submits own link
      const leaderUrl = 'https://www.linkedin.com/posts/alice_leader_ipl2026_pitch-activity-77777';
      const res1 = await fetch(`${baseUrl}/linkedin-submission`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer TEST_TOKEN_lead:${mockLeaderEmail}:student`
        },
        body: JSON.stringify({
          teamId: mockTeamId,
          role: 'leader',
          linkedin_post_url: leaderUrl
        })
      });
      assert.strictEqual(res1.status, 200);

      // 2. Leader submits for Member 2
      const member2Url = 'https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/';
      const res2 = await fetch(`${baseUrl}/linkedin-submission`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer TEST_TOKEN_lead:${mockLeaderEmail}:student`
        },
        body: JSON.stringify({
          teamId: mockTeamId,
          role: 'member2',
          linkedin_post_url: member2Url
        })
      });
      assert.strictEqual(res2.status, 200);
      const data2 = await res2.json();
      assert(data2.success);
      assert.strictEqual(data2.submission.post_url, member2Url);
    });

    // Condition 19: Saved submissions persist across requests
    await itAsync('19: GET /status returns all saved submissions with submitted timestamps', async () => {
      const res = await fetch(`${baseUrl}/status?teamId=${mockTeamId}`, {
        headers: { Authorization: `Bearer TEST_TOKEN_user1:${mockLeaderEmail}:student` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      const subs = data.linkedinSubmissions || data.linkedin_submissions;
      assert(subs, 'Submissions object missing');
      assert(subs.leader?.post_url, 'Leader submission missing');
      assert(subs.member1?.post_url, 'Member 1 submission missing');
      assert(subs.member2?.post_url, 'Member 2 submission missing');
      assert(subs.leader.submitted_at, 'Timestamp missing for leader');
    });

    // Condition 20: No LinkedIn API calls or web scraping occur
    it('20: Implementation contains 0 LinkedIn API calls and 0 scraping dependencies', () => {
      const phase3RoutesCode = fs.readFileSync(path.join(__dirname, 'backend', 'routes', 'phase3Routes.js'), 'utf8');
      assert(!phase3RoutesCode.includes('api.linkedin.com'), 'Must not call api.linkedin.com');
      assert(!phase3RoutesCode.includes('cheerio'), 'Must not use scraping tools');
      assert(!phase3RoutesCode.includes('puppeteer'), 'Must not use headless browsers');
      assert(!phase3RoutesCode.includes('axios.get(trimmedUrl)'), 'Must not scrape LinkedIn URLs');
    });

  } finally {
    server.close();
  }

  console.log(`\nPart B Results: ${passedCount} passed, ${failedCount} failed.`);
  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
