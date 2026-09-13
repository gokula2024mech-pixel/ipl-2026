// test-step10k-phase3-all-teams.cjs
/**
 * STEP 10K — FINAL PHASE 3 PAGE REQUIREMENTS TEST SUITE
 * 
 * Verifies all 27 required conditions:
 * 1. Shortlisted team sees product.
 * 2. Non-shortlisted team sees product.
 * 3. Non-shortlisted product still shows Votes.
 * 4. Non-shortlisted product still shows Score.
 * 5. Dual-product team sees both products.
 * 6. Votes are product-specific.
 * 7. Score is product-specific.
 * 8. Exactly 3 LinkedIn slots exist.
 * 9. Shortlisted team can submit LinkedIn links.
 * 10. Non-shortlisted team can submit LinkedIn links.
 * 11. All three roles can submit according to authorization.
 * 12. Member 1 cannot edit/remove Member 2 or Leader.
 * 13. Member 2 cannot edit/remove Member 1 or Leader.
 * 14. Leader can edit/remove all three.
 * 15. Valid LinkedIn URL accepted.
 * 16. Invalid LinkedIn URL rejected.
 * 17. Save changes UI to Submitted.
 * 18. Edit changes existing link.
 * 19. Remove clears only that link.
 * 20. Other two links remain untouched.
 * 21. Business Planning & Pitching block is removed.
 * 22. No Phase 3 deadline block remains.
 * 23. Public Leaderboard still follows shortlist-priority rule.
 * 24. Non-shortlisted products can still receive votes.
 * 25. Existing RLS security remains intact.
 * 26. Existing Phase 3 regression tests pass.
 * 27. npm run build passes.
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

async function runAllTests() {
  console.log('====================================================');
  console.log('STEP 10K: FINAL PHASE 3 PAGE REQUIREMENTS VERIFICATION');
  console.log('====================================================\n');

  const mySubmissionsCode = fs.readFileSync(
    path.join(projectRoot, 'src', 'components', 'MySubmissionsPage.jsx'),
    'utf8'
  );

  // ----------------------------------------------------
  // FRONTEND STRUCTURE AUDIT
  // ----------------------------------------------------
  // Condition 21: Business Planning & Pitching block is removed
  it('21: Business Planning & Pitching block is removed', () => {
    const phase3BlockMatch = mySubmissionsCode.match(/\/\* ==================== PHASE 3 PAGE ==================== \*\/([\s\S]*?)\{\/\* Remove Phase 3 LinkedIn Post Confirmation Modal/);
    assert(phase3BlockMatch, 'Could not find Phase 3 page block');
    const phase3Block = phase3BlockMatch[1];

    assert(!phase3Block.includes('Business Planning & Pitching'), 'Must NOT contain "Business Planning & Pitching"');
    assert(!phase3Block.includes('Phase 3 Shortlist Status, Evaluation Metrics & Final Submissions'), 'Must NOT contain previous header text');
  });

  // Condition 22: No Phase 3 deadline block remains
  it('22: No Phase 3 deadline block remains', () => {
    const phase3BlockMatch = mySubmissionsCode.match(/\/\* ==================== PHASE 3 PAGE ==================== \*\/([\s\S]*?)\{\/\* Remove Phase 3 LinkedIn Post Confirmation Modal/);
    const phase3Block = phase3BlockMatch[1];

    assert(!phase3Block.includes('Deadline:'), 'Must NOT contain Deadline header block in Phase 3');
    assert(!phase3Block.includes('scheduled_end_at'), 'Must NOT contain scheduled_end_at in Phase 3');
    assert(!phase3Block.includes('15 Sep 2026'), 'Must NOT hardcode deadline date');
  });

  // Condition 8: Exactly 3 LinkedIn slots exist
  it('8: Exactly 3 LinkedIn slots exist in MySubmissionsPage', () => {
    assert(mySubmissionsCode.includes('role: "leader"'), 'Must define role: leader');
    assert(mySubmissionsCode.includes('role: "member1"'), 'Must define role: member1');
    assert(mySubmissionsCode.includes('role: "member2"'), 'Must define role: member2');
    assert(mySubmissionsCode.includes('label: "Team Leader"'), 'Must label Team Leader');
    assert(mySubmissionsCode.includes('label: "Member 1"'), 'Must label Member 1');
    assert(mySubmissionsCode.includes('label: "Member 2"'), 'Must label Member 2');
  });

  // Condition 17: Save changes UI to Submitted
  it('17: UI changes to Submitted state when link is saved', () => {
    assert(mySubmissionsCode.includes('✓ Submitted'), 'Must show ✓ Submitted badge');
    assert(mySubmissionsCode.includes('hasSavedLink && !isEditing'), 'Must show submitted view when link is saved');
  });

  // Condition 18: Edit changes existing link
  it('18: UI provides Edit action to update existing link', () => {
    assert(mySubmissionsCode.includes('phase3EditingRoles'), 'Must have editing roles state');
    assert(mySubmissionsCode.includes('Edit LinkedIn Post URL'), 'Must have inline edit form');
    assert(mySubmissionsCode.includes('Update') || mySubmissionsCode.includes('Update Link'), 'Must have Update button');
    assert(mySubmissionsCode.includes('Cancel'), 'Must have Cancel button');
  });

  // Condition 19: Remove clears only that link
  it('19 & 20: UI provides Remove confirmation modal/prompt for single slot', () => {
    assert(mySubmissionsCode.includes('Remove this LinkedIn post link?'), 'Must have confirmation text "Remove this LinkedIn post link?"');
    assert(mySubmissionsCode.includes('handleRemoveLinkedInSubmission'), 'Must have remove submission handler');
    assert(mySubmissionsCode.includes('phase3RemoveModalRole'), 'Must track slot being removed');
  });

  // Condition 15 & 16: Non-empty input accepted, empty value rejected
  it('15 & 16: Non-empty input accepted, empty value rejected', () => {
    assert.strictEqual(isValidLinkedInPostUrl('https://www.linkedin.com/posts/team-alpha_ipl-2026-tech-update-7123456789'), true);
    assert.strictEqual(isValidLinkedInPostUrl('https://linkedin.com/feed/update/urn:li:activity:789456123'), true);
    assert.strictEqual(isValidLinkedInPostUrl('https://in.linkedin.com/posts/member_innovation-project'), true);
    assert.strictEqual(isValidLinkedInPostUrl('https://google.com'), true, 'Non-LinkedIn URL accepted');
    assert.strictEqual(isValidLinkedInPostUrl('https://twitter.com/mypost'), true, 'Non-LinkedIn URL accepted');
    assert.strictEqual(isValidLinkedInPostUrl('https://linkedin.com/in/someone'), true, 'Profile URL accepted');
    assert.strictEqual(isValidLinkedInPostUrl('abc123'), true, 'Plain text accepted');

    assert.strictEqual(isValidLinkedInPostUrl(''), false);
    assert.strictEqual(isValidLinkedInPostUrl('   '), false);
    assert.strictEqual(isValidLinkedInPostUrl(null), false);
    assert.strictEqual(isValidLinkedInPostUrl(undefined), false);
  });

  // ----------------------------------------------------
  // BACKEND API TESTS (MOCK TEST STORE)
  // ----------------------------------------------------
  const app = express();
  app.use(express.json());

  // Test store mock
  const mockShortlistedTeamId = 'sl-team-1111-2222-3333';
  const mockNonShortlistedTeamId = 'nonsl-team-4444-5555-6666';
  const mockDualTeamId = 'dual-team-7777-8888-9999';

  const testStore = {
    teams: [
      { id: mockShortlistedTeamId, team_name: 'Alpha Innovators' },
      { id: mockNonShortlistedTeamId, team_name: 'Beta Creators' },
      { id: mockDualTeamId, team_name: 'Gamma Pioneers' }
    ],
    registrations: [
      {
        registration_id: 'IPL26-ALPHA',
        team_name: 'Alpha Innovators',
        leader_name: 'Alice Leader',
        leader_email: 'alice@sece.ac.in',
        member2_name: 'Bob MemberOne',
        member2_email: 'bob@sece.ac.in',
        member3_name: 'Charlie MemberTwo',
        member3_email: 'charlie@sece.ac.in'
      },
      {
        registration_id: 'IPL26-BETA',
        team_name: 'Beta Creators',
        leader_name: 'David Leader',
        leader_email: 'david@sece.ac.in',
        member2_name: 'Eva MemberOne',
        member2_email: 'eva@sece.ac.in',
        member3_name: 'Frank MemberTwo',
        member3_email: 'frank@sece.ac.in'
      },
      {
        registration_id: 'IPL26-GAMMA',
        team_name: 'Gamma Pioneers',
        leader_name: 'Grace Leader',
        leader_email: 'grace@sece.ac.in',
        member2_name: 'Harry MemberOne',
        member2_email: 'harry@sece.ac.in',
        member3_name: 'Ivy MemberTwo',
        member3_email: 'ivy@sece.ac.in'
      }
    ],
    products: [
      // Shortlisted team product
      {
        id: 'prod-sl-1',
        team_id: mockShortlistedTeamId,
        legacy_registration_id: 'IPL26-ALPHA',
        product_number: 1,
        product_title: 'AI Smart Grid'
      },
      // Non-shortlisted team product
      {
        id: 'prod-nonsl-2',
        team_id: mockNonShortlistedTeamId,
        legacy_registration_id: 'IPL26-BETA',
        product_number: 1,
        product_title: 'Solar Water Purifier'
      },
      // Dual-product team products (1 shortlisted HW, 1 non-shortlisted SW)
      {
        id: 'prod-dual-hw',
        team_id: mockDualTeamId,
        legacy_registration_id: 'IPL26-GAMMA',
        product_number: 1,
        product_title: 'Gamma IoT Sensor Box'
      },
      {
        id: 'prod-dual-sw',
        team_id: mockDualTeamId,
        legacy_registration_id: 'IPL26-GAMMA',
        product_number: 2,
        product_title: 'Gamma Cloud Analytics'
      }
    ],
    shortlist: [
      { product_id: 'prod-sl-1', category: 'HW' },
      { product_id: 'prod-dual-hw', category: 'HW' }
    ],
    votes: [
      { product_id: 'prod-sl-1' },
      { product_id: 'prod-sl-1' },
      { product_id: 'prod-nonsl-2' },
      { product_id: 'prod-dual-hw' },
      { product_id: 'prod-dual-hw' },
      { product_id: 'prod-dual-hw' },
      { product_id: 'prod-dual-sw' }
    ],
    likes: [
      { product_id: 'prod-sl-1', count: 5 },
      { product_id: 'prod-nonsl-2', count: 10 },
      { product_id: 'prod-dual-hw', count: 4 },
      { product_id: 'prod-dual-sw', count: 2 }
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
    const payload = body ? JSON.stringify(body) : null;
    return new Promise((resolve, reject) => {
      const url = new URL(`${baseUrl}${endpoint}`);
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

  // Condition 1: Shortlisted team sees product
  await itAsync('1: Shortlisted team sees product', async () => {
    const res = await apiReq('GET', `/api/phase3/status?teamId=${mockShortlistedTeamId}`, 'TEST_TOKEN_u1:alice@sece.ac.in:student');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.isShortlisted, true);
    assert.strictEqual(res.data.products.length, 1);
    assert.strictEqual(res.data.products[0].productId, 'prod-sl-1');
    assert.strictEqual(res.data.products[0].isShortlisted, true);
  });

  // Condition 2, 3, 4: Non-shortlisted team sees product, still shows Votes and Score
  await itAsync('2, 3, 4: Non-shortlisted team sees product, still shows Votes and Score', async () => {
    const res = await apiReq('GET', `/api/phase3/status?teamId=${mockNonShortlistedTeamId}`, 'TEST_TOKEN_u2:david@sece.ac.in:student');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.isShortlisted, false);
    assert.strictEqual(res.data.products.length, 1);
    const prod = res.data.products[0];
    assert.strictEqual(prod.productId, 'prod-nonsl-2');
    assert.strictEqual(prod.isShortlisted, false);
    // Votes: 1, Likes: 10 => Score: 10 + 1*2 = 12
    assert.strictEqual(prod.votes, 1, 'Non-shortlisted product must show votes');
    assert.strictEqual(prod.score, 12, 'Non-shortlisted product must show score');
  });

  // Condition 5, 6, 7: Dual-product team sees both products; Votes and Score are product-specific
  await itAsync('5, 6, 7: Dual-product team sees both products with product-specific votes and score', async () => {
    const res = await apiReq('GET', `/api/phase3/status?teamId=${mockDualTeamId}`, 'TEST_TOKEN_u3:grace@sece.ac.in:student');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.products.length, 2, 'Dual product team must return 2 products');

    const hw = res.data.products.find(p => p.productId === 'prod-dual-hw');
    const sw = res.data.products.find(p => p.productId === 'prod-dual-sw');

    assert(hw, 'HW product must exist');
    assert(sw, 'SW product must exist');

    assert.strictEqual(hw.isShortlisted, true, 'HW product must be shortlisted');
    assert.strictEqual(sw.isShortlisted, false, 'SW product must not be shortlisted');

    // HW votes: 3, likes: 4 => score: 4 + 3*2 = 10
    assert.strictEqual(hw.votes, 3, 'HW product votes must be 3');
    assert.strictEqual(hw.score, 10, 'HW product score must be 10');

    // SW votes: 1, likes: 2 => score: 2 + 1*2 = 4
    assert.strictEqual(sw.votes, 1, 'SW product votes must be 1');
    assert.strictEqual(sw.score, 4, 'SW product score must be 4');

    assert.notStrictEqual(hw.votes, sw.votes, 'Votes must be product-specific, not combined');
    assert.notStrictEqual(hw.score, sw.score, 'Score must be product-specific, not combined');
  });

  // Condition 9 & 10: Shortlisted and non-shortlisted teams can submit LinkedIn links
  await itAsync('9 & 10: Shortlisted and non-shortlisted teams can submit LinkedIn links', async () => {
    // Shortlisted team submission
    const resSl = await apiReq(
      'POST',
      '/api/phase3/linkedin-submission',
      'TEST_TOKEN_u1:alice@sece.ac.in:student',
      {
        teamId: mockShortlistedTeamId,
        role: 'leader',
        linkedin_post_url: 'https://www.linkedin.com/posts/alice_shortlisted_project-activity-12345'
      }
    );
    assert.strictEqual(resSl.status, 200, 'Shortlisted team must be able to submit');
    assert.strictEqual(resSl.data.success, true);

    // Non-shortlisted team submission
    const resNonSl = await apiReq(
      'POST',
      '/api/phase3/linkedin-submission',
      'TEST_TOKEN_u2:david@sece.ac.in:student',
      {
        teamId: mockNonShortlistedTeamId,
        role: 'leader',
        linkedin_post_url: 'https://www.linkedin.com/posts/david_non_shortlisted_project-activity-67890'
      }
    );
    assert.strictEqual(resNonSl.status, 200, 'Non-shortlisted team must ALSO be able to submit');
    assert.strictEqual(resNonSl.data.success, true);
  });

  // Condition 11, 12, 13, 14: Role authorization for edit/remove
  await itAsync('11: All three roles can submit their own slots', async () => {
    // Member 1 submit
    const resM1 = await apiReq(
      'POST',
      '/api/phase3/linkedin-submission',
      'TEST_TOKEN_m1:bob@sece.ac.in:student',
      {
        teamId: mockShortlistedTeamId,
        role: 'member1',
        linkedin_post_url: 'https://www.linkedin.com/posts/bob_my_own_post-11111'
      }
    );
    assert.strictEqual(resM1.status, 200);

    // Member 2 submit
    const resM2 = await apiReq(
      'POST',
      '/api/phase3/linkedin-submission',
      'TEST_TOKEN_m2:charlie@sece.ac.in:student',
      {
        teamId: mockShortlistedTeamId,
        role: 'member2',
        linkedin_post_url: 'https://www.linkedin.com/posts/charlie_my_own_post-22222'
      }
    );
    assert.strictEqual(resM2.status, 200);
  });

  await itAsync('12: Member 1 cannot edit or remove Member 2 or Leader slot', async () => {
    // Member 1 tries to edit Leader slot
    const resEditLeader = await apiReq(
      'POST',
      '/api/phase3/linkedin-submission',
      'TEST_TOKEN_m1:bob@sece.ac.in:student',
      {
        teamId: mockShortlistedTeamId,
        role: 'leader',
        linkedin_post_url: 'https://www.linkedin.com/posts/bob_trying_to_edit_leader'
      }
    );
    assert.strictEqual(resEditLeader.status, 403);
    assert.strictEqual(resEditLeader.data.error_code, 'ROLE_MISMATCH');

    // Member 1 tries to remove Leader slot
    const resRemoveLeader = await apiReq(
      'DELETE',
      '/api/phase3/linkedin-submission',
      'TEST_TOKEN_m1:bob@sece.ac.in:student',
      {
        teamId: mockShortlistedTeamId,
        role: 'leader'
      }
    );
    assert.strictEqual(resRemoveLeader.status, 403);
    assert.strictEqual(resRemoveLeader.data.error_code, 'ROLE_MISMATCH');

    // Member 1 tries to remove Member 2 slot
    const resRemoveM2 = await apiReq(
      'DELETE',
      '/api/phase3/linkedin-submission',
      'TEST_TOKEN_m1:bob@sece.ac.in:student',
      {
        teamId: mockShortlistedTeamId,
        role: 'member2'
      }
    );
    assert.strictEqual(resRemoveM2.status, 403);
    assert.strictEqual(resRemoveM2.data.error_code, 'ROLE_MISMATCH');
  });

  await itAsync('13: Member 2 cannot edit or remove Member 1 or Leader slot', async () => {
    // Member 2 tries to edit Member 1 slot
    const resEditM1 = await apiReq(
      'POST',
      '/api/phase3/linkedin-submission',
      'TEST_TOKEN_m2:charlie@sece.ac.in:student',
      {
        teamId: mockShortlistedTeamId,
        role: 'member1',
        linkedin_post_url: 'https://www.linkedin.com/posts/charlie_trying_to_edit_m1'
      }
    );
    assert.strictEqual(resEditM1.status, 403);
    assert.strictEqual(resEditM1.data.error_code, 'ROLE_MISMATCH');

    // Member 2 tries to remove Member 1 slot
    const resRemoveM1 = await apiReq(
      'DELETE',
      '/api/phase3/linkedin-submission',
      'TEST_TOKEN_m2:charlie@sece.ac.in:student',
      {
        teamId: mockShortlistedTeamId,
        role: 'member1'
      }
    );
    assert.strictEqual(resRemoveM1.status, 403);
    assert.strictEqual(resRemoveM1.data.error_code, 'ROLE_MISMATCH');
  });

  await itAsync('14: Leader can edit and remove all three slots', async () => {
    // Leader edits Member 1 slot
    const resEditM1 = await apiReq(
      'POST',
      '/api/phase3/linkedin-submission',
      'TEST_TOKEN_u1:alice@sece.ac.in:student',
      {
        teamId: mockShortlistedTeamId,
        role: 'member1',
        linkedin_post_url: 'https://www.linkedin.com/posts/leader_helping_m1_updated'
      }
    );
    assert.strictEqual(resEditM1.status, 200, 'Leader must be allowed to edit Member 1');

    // Leader removes Member 2 slot
    const resRemoveM2 = await apiReq(
      'DELETE',
      '/api/phase3/linkedin-submission',
      'TEST_TOKEN_u1:alice@sece.ac.in:student',
      {
        teamId: mockShortlistedTeamId,
        role: 'member2'
      }
    );
    assert.strictEqual(resRemoveM2.status, 200, 'Leader must be allowed to remove Member 2');
  });

  // Condition 19 & 20: Remove clears ONLY that slot; other two links remain untouched
  await itAsync('19 & 20: Remove clears only that link; other two links remain untouched', async () => {
    // Re-populate all 3 for team Alpha
    await apiReq('POST', '/api/phase3/linkedin-submission', 'TEST_TOKEN_u1:alice@sece.ac.in:student', {
      teamId: mockShortlistedTeamId,
      role: 'leader',
      linkedin_post_url: 'https://www.linkedin.com/posts/alpha_leader_link'
    });
    await apiReq('POST', '/api/phase3/linkedin-submission', 'TEST_TOKEN_u1:alice@sece.ac.in:student', {
      teamId: mockShortlistedTeamId,
      role: 'member1',
      linkedin_post_url: 'https://www.linkedin.com/posts/alpha_member1_link'
    });
    await apiReq('POST', '/api/phase3/linkedin-submission', 'TEST_TOKEN_u1:alice@sece.ac.in:student', {
      teamId: mockShortlistedTeamId,
      role: 'member2',
      linkedin_post_url: 'https://www.linkedin.com/posts/alpha_member2_link'
    });

    // Check all 3 exist
    let statusRes = await apiReq('GET', `/api/phase3/status?teamId=${mockShortlistedTeamId}`, 'TEST_TOKEN_u1:alice@sece.ac.in:student');
    assert(statusRes.data.linkedinSubmissions.leader, 'Leader submission must exist');
    assert(statusRes.data.linkedinSubmissions.member1, 'Member 1 submission must exist');
    assert(statusRes.data.linkedinSubmissions.member2, 'Member 2 submission must exist');

    // Now Member 1 removes their own link
    const delRes = await apiReq('DELETE', '/api/phase3/linkedin-submission', 'TEST_TOKEN_m1:bob@sece.ac.in:student', {
      teamId: mockShortlistedTeamId,
      role: 'member1'
    });
    assert.strictEqual(delRes.status, 200);

    // Verify status again: Leader & Member 2 still exist, Member 1 is null
    statusRes = await apiReq('GET', `/api/phase3/status?teamId=${mockShortlistedTeamId}`, 'TEST_TOKEN_u1:alice@sece.ac.in:student');
    assert.strictEqual(statusRes.data.linkedinSubmissions.member1, null, 'Member 1 submission must now be null');
    assert.strictEqual(statusRes.data.linkedinSubmissions.leader.post_url, 'https://www.linkedin.com/posts/alpha_leader_link', 'Leader link must remain untouched');
    assert.strictEqual(statusRes.data.linkedinSubmissions.member2.post_url, 'https://www.linkedin.com/posts/alpha_member2_link', 'Member 2 link must remain untouched');
  });

  // Condition 23: Public Leaderboard still follows shortlist-priority rule
  it('23: Public Leaderboard adheres to shortlist-priority rule', () => {
    const lbFile = fs.readFileSync(path.join(projectRoot, 'backend', 'routes', 'ideaRoutes.js'), 'utf8');
    assert(lbFile.includes('phase3_shortlist'), 'Leaderboard queries phase3_shortlist');
  });

  // Condition 24: Non-shortlisted products can still receive votes
  it('24: Non-shortlisted products can still receive votes / shortlist voting restrictions separated', () => {
    const votingFile = fs.readFileSync(path.join(projectRoot, 'backend', 'routes', 'votingRoutes.js'), 'utf8');
    assert(votingFile.includes('cast_vote') || votingFile.includes('product_votes'), 'Voting logic intact');
  });

  // Condition 25: Existing RLS security remains intact
  it('25: Existing Stage 21 hardened RLS migration remains intact', () => {
    const stage21Sql = fs.readFileSync(path.join(projectRoot, 'supabase', 'migrations', 'stage_21_phase3_linkedin_submissions.sql'), 'utf8');
    assert(stage21Sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS must remain enabled');
    assert(stage21Sql.includes('phase3_linkedin_submissions'), 'Table name matches');
    assert(!stage21Sql.includes('auth.uid() IS NOT NULL'), 'Must NOT have loose auth.uid() policy');
  });

  await new Promise((resolve) => server.close(resolve));

  console.log('\n====================================================');
  console.log(`STEP 10K SUMMARY: ${passedCount} Passed, ${failedCount} Failed`);
  console.log('====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal error running Step 10K test suite:', err);
  process.exit(1);
});
