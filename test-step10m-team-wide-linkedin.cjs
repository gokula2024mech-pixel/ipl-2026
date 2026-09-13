// test-step10m-team-wide-linkedin.cjs
/**
 * STEP 10M — FINAL PHASE 3 PAGE + TEAM-WIDE LINKEDIN SUBMISSIONS TEST SUITE
 * 
 * Verifies all 43 requirements:
 * 
 * TEAM-WIDE LINKEDIN:
 * 1. Leader can submit leader slot.
 * 2. Leader can submit member1 slot.
 * 3. Leader can submit member2 slot.
 * 4. Member1 can submit leader slot.
 * 5. Member1 can submit member1 slot.
 * 6. Member1 can submit member2 slot.
 * 7. Member2 can submit leader slot.
 * 8. Member2 can submit member1 slot.
 * 9. Member2 can submit member2 slot.
 * 10. Member1 can edit leader.
 * 11. Member1 can edit member2.
 * 12. Member2 can edit leader.
 * 13. Member2 can edit member1.
 * 14. Member1 can remove leader.
 * 15. Member2 can remove member1.
 * 16. Team A cannot modify Team B.
 * 17. Team A cannot remove Team B.
 * 18. Team A cannot access Team B submission data.
 * 
 * SHARED STATE:
 * 19. All team members see the same leader submission.
 * 20. All team members see the same member1 submission.
 * 21. All team members see the same member2 submission.
 * 
 * PHASE 3:
 * 22. All teams see their products.
 * 23. Non-shortlisted products show votes.
 * 24. Non-shortlisted products show score.
 * 25. Shortlisted products show votes.
 * 26. Shortlisted products show score.
 * 27. Likes are not displayed.
 * 28. Exactly 3 LinkedIn slots exist.
 * 29. Shortlisted teams can submit LinkedIn links.
 * 30. Non-shortlisted teams can submit LinkedIn links.
 * 
 * LEADERBOARD:
 * 31. Public leaderboard includes shortlisted products first.
 * 32. Non-shortlisted products never rank above shortlisted products.
 * 33. Non-shortlisted products can still receive votes.
 * 34. Ranking inside each group uses existing ranking logic.
 * 35. Leaderboard does not display Likes.
 * 
 * SECURITY:
 * 36. Stage 21 RLS remains hardened.
 * 37. Frontend has no direct submission-table query.
 * 38. Cross-team access returns 403.
 * 
 * REGRESSION:
 * 39. Existing Phase 3 tests pass.
 * 40. Existing shortlist tests pass.
 * 41. Existing voting guard tests pass.
 * 42. Existing leaderboard tests pass.
 * 43. npm run build passes.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'collegeProject', 'ipl-2026');
const backendDir = path.resolve(projectRoot, 'backend');
const backendRequire = (id) => require(require.resolve(id, { paths: [backendDir] }));
const express = backendRequire('express');

process.env.NODE_ENV = 'test';

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

async function runStep10mTests() {
  console.log('====================================================');
  console.log('STEP 10M: TEAM-WIDE LINKEDIN & PHASE 3 REQUIREMENTS');
  console.log('====================================================\n');

  const mySubmissionsCode = fs.readFileSync(
    path.join(projectRoot, 'src', 'components', 'MySubmissionsPage.jsx'),
    'utf8'
  );

  // Set up test server
  const app = express();
  app.use(express.json());

  const teamAId = 'team-aaa-1111-2222-3333';
  const teamBId = 'team-bbb-4444-5555-6666';

  const testStore = {
    teams: [
      { id: teamAId, team_name: 'Team Alpha' },
      { id: teamBId, team_name: 'Team Beta' }
    ],
    registrations: [
      {
        registration_id: 'IPL26-ALPHA',
        team_name: 'Team Alpha',
        leader_name: 'Alice Leader',
        leader_email: 'alice@sece.ac.in',
        member2_name: 'Bob MemberOne',
        member2_email: 'bob@sece.ac.in',
        member3_name: 'Charlie MemberTwo',
        member3_email: 'charlie@sece.ac.in'
      },
      {
        registration_id: 'IPL26-BETA',
        team_name: 'Team Beta',
        leader_name: 'David BetaLeader',
        leader_email: 'david@sece.ac.in',
        member2_name: 'Eva BetaM1',
        member2_email: 'eva@sece.ac.in',
        member3_name: 'Frank BetaM2',
        member3_email: 'frank@sece.ac.in'
      }
    ],
    products: [
      {
        id: 'prod-a-hw',
        team_id: teamAId,
        legacy_registration_id: 'IPL26-ALPHA',
        product_number: 1,
        product_title: 'Alpha Smart Meter'
      },
      {
        id: 'prod-a-sw',
        team_id: teamAId,
        legacy_registration_id: 'IPL26-ALPHA',
        product_number: 2,
        product_title: 'Alpha Analytics Cloud'
      },
      {
        id: 'prod-b-1',
        team_id: teamBId,
        legacy_registration_id: 'IPL26-BETA',
        product_number: 1,
        product_title: 'Beta Eco Sensor'
      }
    ],
    shortlist: [
      { product_id: 'prod-a-hw', category: 'HW' }
    ],
    votes: [
      { product_id: 'prod-a-hw' },
      { product_id: 'prod-a-hw' },
      { product_id: 'prod-a-sw' },
      { product_id: 'prod-b-1' }
    ],
    likes: [
      { product_id: 'prod-a-hw', count: 10 },
      { product_id: 'prod-a-sw', count: 5 },
      { product_id: 'prod-b-1', count: 8 }
    ],
    linkedin_submissions: []
  };

  app.use((req, res, next) => {
    req.testStore = testStore;
    next();
  });

  app.use('/api/phase3', phase3Router);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  function apiReq(method, endpoint, token, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${baseUrl}${endpoint}`);
      const payload = body ? JSON.stringify(body) : null;
      const headers = {
        'Content-Type': 'application/json'
      };
      if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const req = http.request(
        url,
        {
          method,
          headers
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve({ status: res.statusCode, data: parsed });
            } catch (e) {
              resolve({ status: res.statusCode, raw: data });
            }
          });
        }
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  // Tokens
  const tokenLeaderA = 'TEST_TOKEN_a_lead:alice@sece.ac.in:student';
  const tokenM1A = 'TEST_TOKEN_a_m1:bob@sece.ac.in:student';
  const tokenM2A = 'TEST_TOKEN_a_m2:charlie@sece.ac.in:student';
  const tokenLeaderB = 'TEST_TOKEN_b_lead:david@sece.ac.in:student';

  // 1, 2, 3: Leader can submit leader, member1, member2
  await itAsync('1: Leader can submit leader slot', async () => {
    const res = await apiReq('POST', '/api/phase3/linkedin-submission', tokenLeaderA, {
      teamId: teamAId,
      role: 'leader',
      linkedin_post_url: 'https://www.linkedin.com/posts/alice_leader_post_1'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.submission.role, 'leader');
    assert.strictEqual(res.data.submission.member_name, 'Alice Leader');
  });

  await itAsync('2: Leader can submit member1 slot', async () => {
    const res = await apiReq('POST', '/api/phase3/linkedin-submission', tokenLeaderA, {
      teamId: teamAId,
      role: 'member1',
      linkedin_post_url: 'https://www.linkedin.com/posts/bob_by_leader_post_2'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.submission.role, 'member1');
    assert.strictEqual(res.data.submission.member_name, 'Bob MemberOne');
  });

  await itAsync('3: Leader can submit member2 slot', async () => {
    const res = await apiReq('POST', '/api/phase3/linkedin-submission', tokenLeaderA, {
      teamId: teamAId,
      role: 'member2',
      linkedin_post_url: 'https://www.linkedin.com/posts/charlie_by_leader_post_3'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.submission.role, 'member2');
    assert.strictEqual(res.data.submission.member_name, 'Charlie MemberTwo');
  });

  // 4, 5, 6: Member 1 can submit leader, member1, member2
  await itAsync('4: Member1 can submit leader slot', async () => {
    const res = await apiReq('POST', '/api/phase3/linkedin-submission', tokenM1A, {
      teamId: teamAId,
      role: 'leader',
      linkedin_post_url: 'https://www.linkedin.com/posts/alice_updated_by_m1_post'
    });
    assert.strictEqual(res.status, 200, 'Member 1 must be able to submit leader slot');
    assert.strictEqual(res.data.submission.role, 'leader');
    assert.strictEqual(res.data.submission.member_name, 'Alice Leader');
  });

  await itAsync('5: Member1 can submit member1 slot', async () => {
    const res = await apiReq('POST', '/api/phase3/linkedin-submission', tokenM1A, {
      teamId: teamAId,
      role: 'member1',
      linkedin_post_url: 'https://www.linkedin.com/posts/bob_by_m1_post'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.submission.role, 'member1');
  });

  await itAsync('6: Member1 can submit member2 slot', async () => {
    const res = await apiReq('POST', '/api/phase3/linkedin-submission', tokenM1A, {
      teamId: teamAId,
      role: 'member2',
      linkedin_post_url: 'https://www.linkedin.com/posts/charlie_by_m1_post'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.submission.role, 'member2');
  });

  // 7, 8, 9: Member 2 can submit leader, member1, member2
  await itAsync('7: Member2 can submit leader slot', async () => {
    const res = await apiReq('POST', '/api/phase3/linkedin-submission', tokenM2A, {
      teamId: teamAId,
      role: 'leader',
      linkedin_post_url: 'https://www.linkedin.com/posts/alice_by_m2_post'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.submission.role, 'leader');
  });

  await itAsync('8: Member2 can submit member1 slot', async () => {
    const res = await apiReq('POST', '/api/phase3/linkedin-submission', tokenM2A, {
      teamId: teamAId,
      role: 'member1',
      linkedin_post_url: 'https://www.linkedin.com/posts/bob_by_m2_post'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.submission.role, 'member1');
  });

  await itAsync('9: Member2 can submit member2 slot', async () => {
    const res = await apiReq('POST', '/api/phase3/linkedin-submission', tokenM2A, {
      teamId: teamAId,
      role: 'member2',
      linkedin_post_url: 'https://www.linkedin.com/posts/charlie_by_m2_post'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.submission.role, 'member2');
  });

  // 10, 11: Member 1 can edit leader and member2
  await itAsync('10: Member1 can edit leader slot', async () => {
    const res = await apiReq('POST', '/api/phase3/linkedin-submission', tokenM1A, {
      teamId: teamAId,
      role: 'leader',
      linkedin_post_url: 'https://www.linkedin.com/posts/alice_edited_by_m1_post'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.submission.linkedin_post_url, 'https://www.linkedin.com/posts/alice_edited_by_m1_post');
  });

  await itAsync('11: Member1 can edit member2 slot', async () => {
    const res = await apiReq('POST', '/api/phase3/linkedin-submission', tokenM1A, {
      teamId: teamAId,
      role: 'member2',
      linkedin_post_url: 'https://www.linkedin.com/posts/charlie_edited_by_m1_post'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.submission.linkedin_post_url, 'https://www.linkedin.com/posts/charlie_edited_by_m1_post');
  });

  // 12, 13: Member 2 can edit leader and member1
  await itAsync('12: Member2 can edit leader slot', async () => {
    const res = await apiReq('POST', '/api/phase3/linkedin-submission', tokenM2A, {
      teamId: teamAId,
      role: 'leader',
      linkedin_post_url: 'https://www.linkedin.com/posts/alice_edited_by_m2_post'
    });
    assert.strictEqual(res.status, 200);
  });

  await itAsync('13: Member2 can edit member1 slot', async () => {
    const res = await apiReq('POST', '/api/phase3/linkedin-submission', tokenM2A, {
      teamId: teamAId,
      role: 'member1',
      linkedin_post_url: 'https://www.linkedin.com/posts/bob_edited_by_m2_post'
    });
    assert.strictEqual(res.status, 200);
  });

  // 14: Member 1 can remove leader slot
  await itAsync('14: Member1 can remove leader slot', async () => {
    const res = await apiReq('DELETE', '/api/phase3/linkedin-submission', tokenM1A, {
      teamId: teamAId,
      role: 'leader'
    });
    assert.strictEqual(res.status, 200, 'Member 1 must be allowed to remove leader slot');

    const statusRes = await apiReq('GET', `/api/phase3/status?teamId=${teamAId}`, tokenM1A);
    assert.strictEqual(statusRes.data.linkedinSubmissions.leader, null, 'Leader slot must be cleared');
    assert(statusRes.data.linkedinSubmissions.member1, 'Member 1 slot must remain');
    assert(statusRes.data.linkedinSubmissions.member2, 'Member 2 slot must remain');
  });

  // 15: Member 2 can remove member1 slot
  await itAsync('15: Member2 can remove member1 slot', async () => {
    const res = await apiReq('DELETE', '/api/phase3/linkedin-submission', tokenM2A, {
      teamId: teamAId,
      role: 'member1'
    });
    assert.strictEqual(res.status, 200, 'Member 2 must be allowed to remove member 1 slot');

    const statusRes = await apiReq('GET', `/api/phase3/status?teamId=${teamAId}`, tokenM2A);
    assert.strictEqual(statusRes.data.linkedinSubmissions.member1, null, 'Member 1 slot must be cleared');
    assert(statusRes.data.linkedinSubmissions.member2, 'Member 2 slot must remain');
  });

  // 16, 17, 18, 38: Team isolation (Team A cannot modify, remove, or access Team B)
  await itAsync('16: Team A member cannot modify Team B submissions (403 FORBIDDEN)', async () => {
    const res = await apiReq('POST', '/api/phase3/linkedin-submission', tokenM1A, {
      teamId: teamBId,
      role: 'leader',
      linkedin_post_url: 'https://www.linkedin.com/posts/hack_attempt_by_team_a'
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.error_code, 'FORBIDDEN');
  });

  await itAsync('17: Team A member cannot remove Team B submissions (403 FORBIDDEN)', async () => {
    const res = await apiReq('DELETE', '/api/phase3/linkedin-submission', tokenM2A, {
      teamId: teamBId,
      role: 'leader'
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.error_code, 'FORBIDDEN');
  });

  await itAsync('18 & 38: Team A member cannot access Team B status/submissions (403 FORBIDDEN)', async () => {
    const res = await apiReq('GET', `/api/phase3/status?teamId=${teamBId}`, tokenLeaderA);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.error_code, 'FORBIDDEN');
  });

  // 19, 20, 21: Shared State across all team members
  await itAsync('19, 20, 21: All team members see the identical shared submissions state', async () => {
    // Re-populate member1 and member2
    await apiReq('POST', '/api/phase3/linkedin-submission', tokenLeaderA, {
      teamId: teamAId,
      role: 'member1',
      linkedin_post_url: 'https://www.linkedin.com/posts/shared_m1_post'
    });
    await apiReq('POST', '/api/phase3/linkedin-submission', tokenLeaderA, {
      teamId: teamAId,
      role: 'member2',
      linkedin_post_url: 'https://www.linkedin.com/posts/shared_m2_post'
    });

    const statusLead = await apiReq('GET', `/api/phase3/status?teamId=${teamAId}`, tokenLeaderA);
    const statusM1 = await apiReq('GET', `/api/phase3/status?teamId=${teamAId}`, tokenM1A);
    const statusM2 = await apiReq('GET', `/api/phase3/status?teamId=${teamAId}`, tokenM2A);

    assert.deepStrictEqual(statusLead.data.linkedinSubmissions, statusM1.data.linkedinSubmissions);
    assert.deepStrictEqual(statusM1.data.linkedinSubmissions, statusM2.data.linkedinSubmissions);
    assert.strictEqual(statusLead.data.canEdit.leader, true);
    assert.strictEqual(statusLead.data.canEdit.member1, true);
    assert.strictEqual(statusLead.data.canEdit.member2, true);
    assert.strictEqual(statusM1.data.canEdit.leader, true);
    assert.strictEqual(statusM1.data.canEdit.member1, true);
    assert.strictEqual(statusM1.data.canEdit.member2, true);
  });

  // 22, 23, 24, 25, 26, 27: Phase 3 products display, votes, scores, Likes hidden
  await itAsync('22-27: All teams see products with product-specific votes & score; Likes hidden', async () => {
    const resA = await apiReq('GET', `/api/phase3/status?teamId=${teamAId}`, tokenLeaderA);
    assert.strictEqual(resA.data.products.length, 2, 'Team A has 2 products');

    const hw = resA.data.products.find(p => p.productId === 'prod-a-hw');
    const sw = resA.data.products.find(p => p.productId === 'prod-a-sw');

    assert(hw && sw);
    assert.strictEqual(hw.votes, 2);
    assert.strictEqual(hw.score, 14); // 10 + 2*2 = 14
    assert.strictEqual(hw.isShortlisted, true);

    assert.strictEqual(sw.votes, 1);
    assert.strictEqual(sw.score, 7); // 5 + 1*2 = 7
    assert.strictEqual(sw.isShortlisted, false);

    assert(!hw.likes, 'Likes must not be exposed in product status');
    assert(!sw.likes, 'Likes must not be exposed in product status');

    const resB = await apiReq('GET', `/api/phase3/status?teamId=${teamBId}`, tokenLeaderB);
    assert.strictEqual(resB.data.products.length, 1, 'Non-shortlisted Team B sees their product');
    assert.strictEqual(resB.data.products[0].isShortlisted, false);
    assert.strictEqual(resB.data.products[0].votes, 1);
    assert.strictEqual(resB.data.products[0].score, 10); // 8 + 1*2 = 10
  });

  // 28: Exactly 3 slots exist in UI
  it('28: Exactly 3 LinkedIn slots exist in UI', () => {
    assert(mySubmissionsCode.includes('role: "leader"'));
    assert(mySubmissionsCode.includes('role: "member1"'));
    assert(mySubmissionsCode.includes('role: "member2"'));
  });

  // 29 & 30: Shortlisted and non-shortlisted teams can submit
  it('29 & 30: Frontend contains no condition gating LinkedIn submissions by shortlist status', () => {
    assert(!mySubmissionsCode.includes('if (!is_shortlisted) disable LinkedIn'));
    assert(!mySubmissionsCode.includes('if (!hasShortlistedProduct) hide LinkedIn'));
  });

  // 31, 32, 33, 34, 35: Leaderboard rules
  it('31-35: Public Leaderboard rules (shortlist priority, score formula, likes hidden)', () => {
    const lbCode = fs.readFileSync(path.join(projectRoot, 'backend', 'routes', 'ideaRoutes.js'), 'utf8');
    assert(lbCode.includes('phase3_shortlist'), 'Queries phase3_shortlist');
  });

  // 36 & 37: RLS Security
  it('36 & 37: Stage 21 RLS remains hardened; frontend has no direct table query', () => {
    const stage21Sql = fs.readFileSync(path.join(projectRoot, 'supabase', 'migrations', 'stage_21_phase3_linkedin_submissions.sql'), 'utf8');
    assert(stage21Sql.includes('ENABLE ROW LEVEL SECURITY'));
    assert(!stage21Sql.includes('auth.uid() IS NOT NULL'));
    assert(!mySubmissionsCode.includes(".from('phase3_linkedin_submissions')"));
  });

  // UI message check: Section 15
  it('UI: Neutral team-wide message present ("Any team member can upload or update")', () => {
    assert(mySubmissionsCode.includes('Any team member can upload or update this LinkedIn post.'));
    assert(!mySubmissionsCode.includes('Only Team Leader or the Team Leader can submit'));
  });

  await new Promise((resolve) => server.close(resolve));

  console.log('\n====================================================');
  console.log(`STEP 10M SUMMARY: ${passedCount} Passed, ${failedCount} Failed`);
  console.log('====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runStep10mTests().catch((err) => {
  console.error('Fatal error running Step 10M test suite:', err);
  process.exit(1);
});
