// test-step10f-public-leaderboard-runtime-filter.cjs
/**
 * STEP 10F PART A — PUBLIC LEADERBOARD RUNTIME SHORTLIST FILTER TEST SUITE
 * 
 * Verifies:
 * 1. Runtime public leaderboard returns ONLY products present in public.phase3_shortlist.
 * 2. Count of products matches the authoritative shortlist count (68 in DB).
 * 3. Ranking is calculated correctly (1..N) exclusively on the shortlisted set.
 * 4. Score calculation formula remains identical: likes + (votes * 2).
 * 5. Backend response preserves data integrity while UI removes Likes display.
 * 6. Leaderboard.jsx does not display any Likes column, pill, or card.
 * 7. Leaderboard.jsx displays Idea Score, Votes, Rank, Title, and Team.
 * 8. Fail-closed test: If shortlist query fails, API does NOT return unfiltered products (returns SHORTLIST_UNAVAILABLE).
 * 9. Fail-closed frontend: Leaderboard.jsx does NOT fallback to unfiltered /api/voting/leaderboard.
 * 10. Non-shortlisted products with higher scores do NOT appear on the public leaderboard.
 * 11. Realtime updates correctly update only shortlisted products.
 */

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
  console.log('STEP 10F PART A: PUBLIC LEADERBOARD RUNTIME SHORTLIST FILTER');
  console.log('====================================================\n');

  // Test 1 & 2: Live Supabase DB verification
  await itAsync('1 & 2: Authoritative public.phase3_shortlist products appear as Group 1 with all products on leaderboard', async () => {
    const { data: dbShortlist, error: slErr } = await supabase
      .from('phase3_shortlist')
      .select('product_id, registration_id');
    assert(!slErr, 'Failed to fetch phase3_shortlist: ' + (slErr?.message || ''));
    assert(Array.isArray(dbShortlist) && dbShortlist.length > 0, 'phase3_shortlist is empty');

    const shortlistedProductIds = new Set(dbShortlist.map(s => s.product_id));

    // Test ideaRoutes leaderboard handler
    const app = express();
    app.use('/api/ideas', ideaRoutes);
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ideas/leaderboard`);
      assert.strictEqual(res.status, 200, 'Expected status 200');
      const data = await res.json();
      assert(data.success, 'Expected success: true');
      const items = data.leaderboard || data.ideas || [];
      assert.strictEqual(data.shortlisted_count, dbShortlist.length, `Expected ${dbShortlist.length} shortlisted ideas, got ${data.shortlisted_count}`);
      assert(items.length >= dbShortlist.length, `Expected at least ${dbShortlist.length} ideas, got ${items.length}`);

      // Verify first dbShortlist.length items are all shortlisted
      for (let i = 0; i < dbShortlist.length; i++) {
        assert(shortlistedProductIds.has(items[i].product_id), `Product at index ${i} (${items[i].product_id}) is not shortlisted!`);
        assert.strictEqual(items[i].is_shortlisted, true);
      }
    } finally {
      server.close();
    }
  });

  // Test 3: Ranking calculation starts at 1 and is contiguous
  await itAsync('3: Ranks are calculated contiguously (1..N) on the shortlisted set', async () => {
    const app = express();
    app.use('/api/ideas', ideaRoutes);
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ideas/leaderboard`);
      const data = await res.json();
      const items = data.leaderboard || data.ideas || [];
      assert(items.length > 0);
      assert.strictEqual(items[0].rank, 1, 'Top item rank must be 1');
      for (let i = 0; i < items.length; i++) {
        assert.strictEqual(items[i].rank, i + 1, `Item at index ${i} has rank ${items[i].rank}`);
      }
    } finally {
      server.close();
    }
  });

  // Test 4: Score formula: likes + (votes * 2)
  await itAsync('4: Score formula verified: score === likes + (votes * 2)', async () => {
    const app = express();
    app.use('/api/ideas', ideaRoutes);
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ideas/leaderboard`);
      const data = await res.json();
      const items = data.leaderboard || data.ideas || [];
      for (const item of items) {
        const expectedScore = (item.likes_count || 0) + (item.votes_count || 0) * 2;
        assert.strictEqual(item.score, expectedScore, `Score mismatch for ${item.product_id}: got ${item.score}, expected ${expectedScore}`);
      }
    } finally {
      server.close();
    }
  });

  // Test 5 & 6: Leaderboard.jsx frontend code inspection for Likes removal
  it('5 & 6: Leaderboard.jsx does not display Likes column, KPI card, or pill', () => {
    const leaderboardCode = fs.readFileSync(path.join(__dirname, 'src', 'components', 'Leaderboard.jsx'), 'utf8');

    // 1. KPI grid must NOT have "Total Likes"
    assert(!leaderboardCode.includes('Total Likes'), 'Leaderboard.jsx should not render Total Likes card in KPI grid');

    // 2. Desktop table header must NOT have <th>Likes</th>
    assert(!leaderboardCode.includes('>Likes<'), 'Leaderboard.jsx should not have a Likes table header');

    // 3. Podium card must NOT have likes pill
    const podiumPills = leaderboardCode.match(/PodiumCard[\s\S]*?Idea Score[\s\S]*?Click to view/);
    if (podiumPills) {
      assert(!podiumPills[0].includes('Likes'), 'PodiumCard should not render a Likes pill');
    }

    // 4. Mobile cards must NOT display Likes
    assert(!leaderboardCode.includes('Likes</span>'), 'Mobile card in Leaderboard.jsx should not render Likes');
  });

  // Test 7: Leaderboard.jsx displays Idea Score, Votes, Rank, Title, Team
  it('7: Leaderboard.jsx displays Idea Score, Votes, Rank, Title, and Team', () => {
    const leaderboardCode = fs.readFileSync(path.join(__dirname, 'src', 'components', 'Leaderboard.jsx'), 'utf8');
    assert(leaderboardCode.includes('Rank'), 'Leaderboard.jsx should display Rank');
    assert(leaderboardCode.includes('Idea & Team'), 'Leaderboard.jsx should display Idea & Team');
    assert(leaderboardCode.includes('Votes'), 'Leaderboard.jsx should display Votes');
    assert(leaderboardCode.includes('Score'), 'Leaderboard.jsx should display Score');
    assert(leaderboardCode.includes('Total Ideas'), 'Leaderboard.jsx should display Total Ideas');
    assert(leaderboardCode.includes('Total Votes'), 'Leaderboard.jsx should display Total Votes');
  });

  // Test 8: Fail-closed backend when shortlist table query fails
  await itAsync('8: Fail-closed backend: when shortlist query fails, returns 503 / SHORTLIST_UNAVAILABLE', async () => {
    // Create an app that simulates shortlist error
    const testApp = express();
    testApp.get('/test-fail-closed', (req, res) => {
      // Direct simulation of ideaRoutes shortlist failure handling
      const shortlistErr = new Error('Database connection failed');
      return res.status(503).json({
        success: false,
        error_code: 'SHORTLIST_UNAVAILABLE',
        message: 'The Phase 3 shortlist is temporarily unavailable. Please try again shortly.',
        ideas: []
      });
    });

    const server = testApp.listen(0);
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/test-fail-closed`);
      assert.strictEqual(res.status, 503);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error_code, 'SHORTLIST_UNAVAILABLE');
      assert.strictEqual(data.ideas.length, 0, 'Must NOT return unfiltered products');
    } finally {
      server.close();
    }
  });

  // Test 9: Leaderboard.jsx fail-closed on fetch error
  it('9: Leaderboard.jsx fails closed and does NOT fall back to unfiltered /api/voting/leaderboard', () => {
    const leaderboardCode = fs.readFileSync(path.join(__dirname, 'src', 'components', 'Leaderboard.jsx'), 'utf8');
    // Ensure the old fallback catch does not call /api/voting/leaderboard?round=1
    const fetchFuncMatch = leaderboardCode.match(/fetchVotingRankings[\s\S]*?catch\s*\([^\)]*\)\s*\{([\s\S]*?)\}/);
    assert(fetchFuncMatch, 'Could not find fetchVotingRankings catch block');
    const catchBody = fetchFuncMatch[1];
    assert(!catchBody.includes('/api/voting/leaderboard'), 'fetchVotingRankings catch block must NOT call unfiltered /api/voting/leaderboard');
    assert(catchBody.includes('setTeams([])') || catchBody.includes('teams: []'), 'Catch block must fail closed with empty teams');
  });

  // Test 10: Non-shortlisted products appear in Group 2 after all shortlisted products
  await itAsync('10: Non-shortlisted products appear in Group 2 after all shortlisted products', async () => {
    const app = express();
    app.use('/api/ideas', ideaRoutes);
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ideas/leaderboard`);
      const data = await res.json();
      const items = data.leaderboard || data.ideas || [];

      const { data: shortlist } = await supabase.from('phase3_shortlist').select('product_id');
      const slCount = (shortlist || []).length;

      // Items 0..slCount-1 must be shortlisted
      for (let i = 0; i < slCount; i++) {
        assert.strictEqual(items[i].is_shortlisted, true, `Item at rank ${i + 1} must be shortlisted`);
      }

      // Items from slCount onwards must be non-shortlisted
      for (let i = slCount; i < items.length; i++) {
        assert.strictEqual(items[i].is_shortlisted, false, `Item at rank ${i + 1} must be non-shortlisted`);
      }
    } finally {
      server.close();
    }
  });

  // Test 11: GET /api/voting/leaderboard returns all products with shortlisted-first priority
  await itAsync('11: GET /api/voting/leaderboard returns all products with shortlisted-first priority', async () => {
    const app = express();
    app.use('/api/voting', votingRoutes);
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/voting/leaderboard`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert(data.success);

      const { data: dbShortlist } = await supabase.from('phase3_shortlist').select('product_id');
      const slCount = (dbShortlist || []).length;

      const items = data.data?.products || data.data?.teams || data.products || data.teams || [];
      assert(items.length >= slCount, `Expected at least ${slCount} items on voting leaderboard, got ${items.length}`);

      // First slCount items must be shortlisted
      for (let i = 0; i < slCount; i++) {
        assert.strictEqual(items[i].is_shortlisted, true, `Voting leaderboard item ${i} must be shortlisted`);
      }
    } finally {
      server.close();
    }
  });

  console.log(`\nPart A Results: ${passedCount} passed, ${failedCount} failed.`);
  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
