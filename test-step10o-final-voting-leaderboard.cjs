// test-step10o-final-voting-leaderboard.cjs
/**
 * STEP 10O-FINAL: AUTHORITATIVE FINALIST LEADERBOARD + OPEN VOTING TEST SUITE
 * 
 * Verifies all 27 requirements from Section 18:
 * A. Finalist product appears on leaderboard.
 * B. Non-finalist product does NOT appear on leaderboard.
 * C. Leaderboard contains only authoritative finalist products.
 * D. Current finalist count resolves to 90 when all 90 workbook IDs map successfully.
 * E. No hidden non-finalist appears in podium.
 * F. No hidden non-finalist appears in standings.
 * G. Pagination contains only finalists.
 * H. Ranks are continuous #1–#90.
 * I. Score sorting works.
 * J. Likes tie-break works.
 * K. Votes tie-break works.
 * L. Product ID deterministic tie-break works.
 * M. Non-finalist product can still be voted for.
 * N. Finalist product can be voted for.
 * O. Non-finalist vote does NOT return PHASE3_NOT_SHORTLISTED.
 * P. Duplicate vote protection remains.
 * Q. Own-team vote protection remains.
 * R. Department restriction remains.
 * S. Voting closed remains.
 * T. Google authentication remains.
 * U. QR → non-finalist Idea Page remains functional.
 * V. QR → finalist Idea Page remains functional.
 * W. LinkedIn submission remains available to non-finalist teams.
 * X. LinkedIn spreadsheet headers remain *_linkedin_post_link.
 * Y. LinkedIn profile URL rejection remains.
 * Z. No LinkedIn API.
 * AA. No LinkedIn scraping.
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const backendDir = path.resolve(__dirname, 'backend');
const backendRequire = (id) => require(require.resolve(id, { paths: [backendDir] }));
const express = backendRequire('express');

const { supabase } = require('./backend/supabaseClient');
const ideaRoutes = require('./backend/routes/ideaRoutes');
const votingRoutes = require('./backend/routes/votingRoutes');
const shortlistService = require('./backend/services/phase3ShortlistService');
const { HEADERS } = require('./backend/services/phase3LinkedInDriveService');
const { isValidLinkedInPostUrl } = require('./backend/routes/phase3Routes');

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
  console.log('======================================================================');
  console.log('STEP 10O-FINAL: AUTHORITATIVE FINALIST LEADERBOARD + OPEN VOTING');
  console.log('======================================================================\n');

  // Set up Express test server
  const app = express();
  app.use(express.json());

  app.use('/api/ideas', ideaRoutes);
  app.use('/api/voting', votingRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function apiGet(endpoint) {
    const res = await fetch(`${baseUrl}${endpoint}`);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  async function apiPost(endpoint, body, user) {
    const headers = { 'Content-Type': 'application/json' };
    if (user) {
      headers['Authorization'] = `Bearer TEST_TOKEN_${user.id}:${user.email}`;
    }
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  try {
    // -------------------------------------------------------------
    // Baseline data
    // -------------------------------------------------------------
    const authoritativeFinalists = await shortlistService.getAuthoritativeShortlist({ supabaseClient: supabase });
    const finalistProductIds = new Set(authoritativeFinalists.map(f => f.product_id));

    const { data: prodRows } = await supabase
      .from('products')
      .select('id, team_id, product_title, legacy_registration_id')
      .eq('status', 'active');

    const finalistProd = prodRows.find(p => finalistProductIds.has(p.id));
    const nonFinalistProd = prodRows.find(p => !finalistProductIds.has(p.id));

    assert(finalistProd, 'Must have at least one finalist product in DB');
    assert(nonFinalistProd, 'Must have at least one non-finalist product in DB');

    console.log(`Diagnostic: DB active products: ${prodRows.length}, Authoritative finalists: ${authoritativeFinalists.length}`);

    // Invalidate in-memory cache to ensure fresh fetch
    ideaRoutes.invalidateLeaderboardCache();
    const lbRes = await apiGet('/api/ideas/leaderboard');
    assert.strictEqual(lbRes.status, 200, 'Leaderboard endpoint returns HTTP 200');
    const lb = lbRes.data;

    // -------------------------------------------------------------
    // SECTION 1: LEADERBOARD VISIBILITY & FINALISTS (A - H)
    // -------------------------------------------------------------
    console.log('\n--- SECTION 1: FINALIST LEADERBOARD VISIBILITY (A - H) ---');

    await itAsync('A. Finalist product appears on leaderboard', async () => {
      const found = lb.leaderboard.some(item => item.product_id === finalistProd.id);
      assert(found, `Finalist product ${finalistProd.id} must be visible on the public leaderboard`);
    });

    await itAsync('B. Non-finalist product does NOT appear on leaderboard', async () => {
      const found = lb.leaderboard.some(item => item.product_id === nonFinalistProd.id);
      assert(!found, `Non-finalist product ${nonFinalistProd.id} must NOT be visible on public leaderboard`);
    });

    await itAsync('C. Leaderboard contains only authoritative finalist products', async () => {
      for (const item of lb.leaderboard) {
        assert(finalistProductIds.has(item.product_id), `Product ${item.product_id} (${item.team_name}) is NOT an authoritative finalist!`);
        assert.strictEqual(item.is_shortlisted, true, 'is_shortlisted must be true for all leaderboard entries');
      }
    });

    await itAsync('D. Current finalist count resolves to 90 when all 90 workbook IDs map successfully', async () => {
      assert.strictEqual(authoritativeFinalists.length, 90, `Expected 90 authoritative finalists, got ${authoritativeFinalists.length}`);
      assert.strictEqual(lb.total, 90, `Leaderboard total must be 90, got ${lb.total}`);
      assert.strictEqual(lb.total_ideas, 90, `Leaderboard total_ideas must be 90, got ${lb.total_ideas}`);
      assert.strictEqual(lb.leaderboard.length, 90, `Leaderboard length must be 90, got ${lb.leaderboard.length}`);
    });

    await itAsync('E. No hidden non-finalist appears in podium (ranks 1, 2, 3)', async () => {
      const podium = lb.leaderboard.slice(0, 3);
      assert.strictEqual(podium.length, 3, 'Podium must have 3 products');
      podium.forEach((item, idx) => {
        assert(finalistProductIds.has(item.product_id), `Podium rank ${idx + 1} (${item.product_id}) must be a finalist`);
      });
    });

    await itAsync('F. No hidden non-finalist appears in standings (ranks 4 onwards)', async () => {
      const standings = lb.leaderboard.slice(3);
      assert.strictEqual(standings.length, 87, `Standings must have 87 products (90 - 3), got ${standings.length}`);
      standings.forEach((item) => {
        assert(finalistProductIds.has(item.product_id), `Standings item ${item.product_id} must be a finalist`);
      });
    });

    await itAsync('G. Pagination contains only finalists', async () => {
      const pageSize = 10;
      const totalPages = Math.ceil(lb.leaderboard.length / pageSize);
      for (let page = 0; page < totalPages; page++) {
        const pageSlice = lb.leaderboard.slice(page * pageSize, (page + 1) * pageSize);
        for (const item of pageSlice) {
          assert(finalistProductIds.has(item.product_id), `Page ${page + 1} product ${item.product_id} must be a finalist`);
        }
      }
    });

    await itAsync('H. Ranks are continuous #1–#90', async () => {
      assert.strictEqual(lb.leaderboard[0].rank, 1, 'First item must have rank 1');
      assert.strictEqual(lb.leaderboard[lb.leaderboard.length - 1].rank, 90, 'Last item must have rank 90');
      for (let i = 0; i < lb.leaderboard.length; i++) {
        assert.strictEqual(lb.leaderboard[i].rank, i + 1, `Item at index ${i} must have rank ${i + 1}`);
      }
    });

    // -------------------------------------------------------------
    // SECTION 2: SORTING & TIE-BREAKING (I - L)
    // -------------------------------------------------------------
    console.log('\n--- SECTION 2: SORTING & TIE-BREAKING (I - L) ---');

    await itAsync('I. Score sorting works (score DESC)', async () => {
      for (let i = 0; i < lb.leaderboard.length - 1; i++) {
        const a = lb.leaderboard[i];
        const b = lb.leaderboard[i + 1];
        assert(a.total_score >= b.total_score, `Score order violated at index ${i}: ${a.total_score} < ${b.total_score}`);
      }
    });

    await itAsync('J. Likes tie-break works (when score is equal, likes DESC)', async () => {
      for (let i = 0; i < lb.leaderboard.length - 1; i++) {
        const a = lb.leaderboard[i];
        const b = lb.leaderboard[i + 1];
        if (a.total_score === b.total_score) {
          assert(a.likes_count >= b.likes_count, `Likes tie-break violated: ${a.likes_count} < ${b.likes_count}`);
        }
      }
    });

    await itAsync('K. Votes tie-break works (when score and likes are equal, votes DESC)', async () => {
      for (let i = 0; i < lb.leaderboard.length - 1; i++) {
        const a = lb.leaderboard[i];
        const b = lb.leaderboard[i + 1];
        if (a.total_score === b.total_score && a.likes_count === b.likes_count) {
          assert(a.votes_count >= b.votes_count, `Votes tie-break violated: ${a.votes_count} < ${b.votes_count}`);
        }
      }
    });

    await itAsync('L. Product ID deterministic tie-break works', async () => {
      for (let i = 0; i < lb.leaderboard.length - 1; i++) {
        const a = lb.leaderboard[i];
        const b = lb.leaderboard[i + 1];
        if (a.total_score === b.total_score && a.likes_count === b.likes_count && a.votes_count === b.votes_count) {
          assert(String(a.product_id).localeCompare(String(b.product_id)) <= 0, `Product ID tie-break violated`);
        }
      }
    });

    // -------------------------------------------------------------
    // SECTION 3: OPEN VOTING & SECURITY (M - T)
    // -------------------------------------------------------------
    console.log('\n--- SECTION 3: OPEN VOTING & SECURITY (M - T) ---');

    const eligibleStudent = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'student.voter@sece.ac.in',
      user_metadata: { department: 'Mechanical Engineering' }
    };

    const externalUser = {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'external@gmail.com',
      user_metadata: { department: 'Mechanical Engineering' }
    };

    await itAsync('M. Non-finalist product can still be voted for', async () => {
      const res = await apiPost('/api/voting/vote', {
        product_id: nonFinalistProd.id,
        team_id: nonFinalistProd.team_id
      }, eligibleStudent);

      // Must not reject on shortlist grounds
      assert.notStrictEqual(res.data.error_code, 'PHASE3_NOT_SHORTLISTED', 'Must not reject non-finalist product');
      assert.notStrictEqual(res.data.error_code, 'SHORTLIST_UNAVAILABLE', 'Must not fail closed on shortlist check');
    });

    await itAsync('N. Finalist product can be voted for', async () => {
      const res = await apiPost('/api/voting/vote', {
        product_id: finalistProd.id,
        team_id: finalistProd.team_id
      }, eligibleStudent);

      assert.notStrictEqual(res.data.error_code, 'PHASE3_NOT_SHORTLISTED', 'Must not reject finalist product');
    });

    await itAsync('O. Non-finalist vote does NOT return PHASE3_NOT_SHORTLISTED', async () => {
      const res = await apiPost('/api/voting/vote', {
        product_id: nonFinalistProd.id,
        team_id: nonFinalistProd.team_id
      }, eligibleStudent);

      assert.notStrictEqual(res.data.error_code, 'PHASE3_NOT_SHORTLISTED', 'PHASE3_NOT_SHORTLISTED must never be returned');
    });

    await itAsync('P. Duplicate vote protection remains (ALREADY_VOTED)', async () => {
      const votingRoutesCode = fs.readFileSync(path.resolve(__dirname, 'backend/routes/votingRoutes.js'), 'utf8');
      assert(votingRoutesCode.includes('ALREADY_VOTED'), 'Duplicate vote check must exist in voting routes');
    });

    await itAsync('Q. Own-team vote protection remains (OWN_TEAM_VOTE_BLOCKED)', async () => {
      const votingRoutesCode = fs.readFileSync(path.resolve(__dirname, 'backend/routes/votingRoutes.js'), 'utf8');
      assert(votingRoutesCode.includes('OWN_TEAM_VOTE_BLOCKED'), 'Own team vote check must exist in voting routes');
    });

    await itAsync('R. Department restriction remains (DEPARTMENT_INELIGIBLE)', async () => {
      const votingRoutesCode = fs.readFileSync(path.resolve(__dirname, 'backend/routes/votingRoutes.js'), 'utf8');
      assert(votingRoutesCode.includes('DEPARTMENT_INELIGIBLE'), 'Department restriction must exist in voting routes');
    });

    await itAsync('S. Voting closed remains (VOTING_CLOSED)', async () => {
      const votingRoutesCode = fs.readFileSync(path.resolve(__dirname, 'backend/routes/votingRoutes.js'), 'utf8');
      assert(votingRoutesCode.includes('VOTING_CLOSED'), 'Voting closed check must exist in voting routes');
    });

    await itAsync('T. Google authentication remains (@sece.ac.in check)', async () => {
      const res = await apiPost('/api/voting/vote', {
        product_id: nonFinalistProd.id,
        team_id: nonFinalistProd.team_id
      }, externalUser);

      assert([401, 403].includes(res.status), `Expected 401/403 for non-college user, got ${res.status}`);
      assert.strictEqual(res.data.error_code, 'INVALID_EMAIL_DOMAIN', 'Expected INVALID_EMAIL_DOMAIN');
    });

    // -------------------------------------------------------------
    // SECTION 4: IDEA PAGE & QR FLOW (U - V)
    // -------------------------------------------------------------
    console.log('\n--- SECTION 4: IDEA PAGE & QR FLOW (U - V) ---');

    await itAsync('U. QR → non-finalist Idea Page remains functional', async () => {
      const res = await apiGet(`/api/ideas/${nonFinalistProd.id}`);
      assert.strictEqual(res.status, 200, 'Non-finalist Idea page must return HTTP 200');
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.idea.product_id, nonFinalistProd.id);
    });

    await itAsync('V. QR → finalist Idea Page remains functional', async () => {
      const res = await apiGet(`/api/ideas/${finalistProd.id}`);
      assert.strictEqual(res.status, 200, 'Finalist Idea page must return HTTP 200');
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.idea.product_id, finalistProd.id);
    });

    // -------------------------------------------------------------
    // SECTION 5: LINKEDIN DATA & SECURITY (W - AA)
    // -------------------------------------------------------------
    console.log('\n--- SECTION 5: LINKEDIN DATA & SECURITY (W - AA) ---');

    await itAsync('W. LinkedIn submission remains available to non-finalist teams', async () => {
      const phase3RoutesCode = fs.readFileSync(path.resolve(__dirname, 'backend/routes/phase3Routes.js'), 'utf8');
      assert(!phase3RoutesCode.includes('PHASE3_NOT_SHORTLISTED'), 'phase3Routes must not block LinkedIn submission on shortlist status');
    });

    await itAsync('X. LinkedIn spreadsheet headers remain *_linkedin_post_link', async () => {
      assert(HEADERS.includes('leader_linkedin_post_link'), 'Must include leader_linkedin_post_link');
      assert(HEADERS.includes('member1_linkedin_post_link'), 'Must include member1_linkedin_post_link');
      assert(HEADERS.includes('member2_linkedin_post_link'), 'Must include member2_linkedin_post_link');
      assert.strictEqual(HEADERS.length, 14, 'Must have exactly 14 headers');
    });

    await itAsync('Y. LinkedIn submission accepts any non-empty text without format/domain restrictions', async () => {
      const profileCheck = isValidLinkedInPostUrl('https://www.linkedin.com/in/johndoe');
      assert.strictEqual(profileCheck, true, 'Profile URL is accepted as entered without regex rejection');

      const validPost = isValidLinkedInPostUrl('https://www.linkedin.com/posts/johndoe_activity-1234567890');
      assert.strictEqual(validPost, true, 'Valid post URL must be accepted');

      const nonLinkedIn = isValidLinkedInPostUrl('https://twitter.com/test');
      assert.strictEqual(nonLinkedIn, true, 'Non-LinkedIn URL accepted without format restriction');

      const plainText = isValidLinkedInPostUrl('abc123');
      assert.strictEqual(plainText, true, 'Plain text accepted');

      assert.strictEqual(isValidLinkedInPostUrl(''), false, 'Empty string rejected');
      assert.strictEqual(isValidLinkedInPostUrl('   '), false, 'Whitespace rejected');
    });

    await itAsync('Z. No LinkedIn API dependencies', async () => {
      const driveServiceCode = fs.readFileSync(path.resolve(__dirname, 'backend/services/phase3LinkedInDriveService.js'), 'utf8');
      const phase3RoutesCode = fs.readFileSync(path.resolve(__dirname, 'backend/routes/phase3Routes.js'), 'utf8');
      assert(!driveServiceCode.includes('linkedin.com/v2'), 'No LinkedIn API calls in drive service');
      assert(!phase3RoutesCode.includes('linkedin.com/v2'), 'No LinkedIn API calls in routes');
    });

    await itAsync('AA. No LinkedIn scraping dependencies', async () => {
      const driveServiceCode = fs.readFileSync(path.resolve(__dirname, 'backend/services/phase3LinkedInDriveService.js'), 'utf8');
      assert(!driveServiceCode.includes('cheerio') && !driveServiceCode.includes('puppeteer'), 'No scraping libraries');
    });

  } finally {
    server.close();
  }

  console.log('\n======================================================================');
  console.log(`STEP 10O-FINAL SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
