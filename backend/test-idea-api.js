// backend/test-idea-api.js
// Automated Integration & Safety Test Suite for Public Idea APIs
// Tests public discovery, idea details, multi-product resolution, QR resolution,
// confidentiality sanitization, input validation, and non-destructive RPC routing.

const express = require('express');
const path = require('path');
const fs = require('fs');

// Create test app with mounted idea router
const app = express();
app.use(express.json());
app.use('/api/ideas', require('./routes/ideaRoutes'));
app.use('/api/voting', require('./routes/votingRoutes'));

let server;
let baseUrl;

async function startServer() {
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`[Test Suite] Test server running on ${baseUrl}`);
      resolve();
    });
  });
}

function stopServer() {
  if (server) server.close();
}

async function runTests() {
  await startServer();
  console.log('================================================================');
  console.log('         IPL-2026: STEP 3A BACKEND IDEA API TEST SUITE          ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // --------------------------------------------------------------------------
    // TEST 1: GET /api/ideas (Public Discovery List)
    // --------------------------------------------------------------------------
    console.log('1. Testing GET /api/ideas (Discovery List & Schema Sanitization)...');
    const res1 = await fetch(`${baseUrl}/api/ideas?page=1&limit=5`);
    const data1 = await res1.json();

    assert(res1.status === 200, 'GET /api/ideas returns HTTP 200');
    assert(data1.success === true, 'Response success is true');
    assert(data1.page === 1 && data1.limit === 5, 'Pagination parameters reflected');
    assert(data1.total > 0, `Total ideas count reported (${data1.total})`);
    assert(Array.isArray(data1.ideas) && data1.ideas.length > 0, 'Returns array of ideas');

    // Check confidentiality on list
    const firstIdea = data1.ideas[0];
    assert(firstIdea.product_id && firstIdea.product_title && firstIdea.team_name, 'Idea has product_id, product_title, team_name');
    assert(firstIdea.member_email === undefined, 'No student emails exposed in list');
    assert(firstIdea.member_mobile === undefined, 'No student mobile numbers exposed in list');
    assert(firstIdea.leader_email === undefined, 'No leader emails exposed in list');

    // --------------------------------------------------------------------------
    // TEST 2: Pagination, Search & Sorting
    // --------------------------------------------------------------------------
    console.log('\n2. Testing Pagination, Search & Sorting...');
    const res2 = await fetch(`${baseUrl}/api/ideas?page=2&limit=3`);
    const data2 = await res2.json();
    assert(data2.page === 2 && data2.limit === 3, 'Pagination page=2 limit=3 handled');
    assert(data2.ideas.length <= 3, 'Page length respects limit');

    const resSearch = await fetch(`${baseUrl}/api/ideas?search=System&limit=5`);
    const dataSearch = await resSearch.json();
    assert(dataSearch.success === true, 'Search filter query succeeded');
    const matchesSearch = dataSearch.ideas.every(i =>
      i.product_title.toLowerCase().includes('system') || i.team_name.toLowerCase().includes('system')
    );
    assert(matchesSearch, 'Search query strictly filters by product_title or team_name');

    const resSort = await fetch(`${baseUrl}/api/ideas?sort=recent&limit=3`);
    const dataSort = await resSort.json();
    assert(dataSort.success === true, 'Sort by recent succeeded');

    // --------------------------------------------------------------------------
    // TEST 3: GET /api/ideas/:productId (Public Idea Details)
    // --------------------------------------------------------------------------
    console.log('\n3. Testing GET /api/ideas/:productId (Idea Details & Contact Sanitization)...');
    const sampleProductId = firstIdea.product_id;
    const res3 = await fetch(`${baseUrl}/api/ideas/${sampleProductId}`);
    const data3 = await res3.json();

    assert(res3.status === 200, `HTTP 200 for product ${sampleProductId}`);
    assert(data3.success === true, 'Idea details success is true');
    assert(data3.idea.product_id === sampleProductId, 'Matches requested product_id');
    assert(data3.idea.team_name, `Includes team name: ${data3.idea.team_name}`);
    assert(Array.isArray(data3.idea.members), 'Includes members array');
    assert(data3.idea.stats && typeof data3.idea.stats.total_score === 'number', 'Includes stats with total_score');
    assert(typeof data3.idea.stats.visits_count === 'number', 'Includes visits_count as aggregate number');
    assert(data3.idea.viewer_state && typeof data3.idea.viewer_state.has_liked === 'boolean', 'Includes viewer_state.has_liked boolean');

    // Strict Contact Sanitization Assertion
    let contactInfoLeaked = false;
    for (const m of data3.idea.members) {
      if (m.member_email || m.member_mobile || m.email || m.mobile || m.phone) {
        contactInfoLeaked = true;
      }
    }
    assert(!contactInfoLeaked, 'STRICT SANITIZATION: Zero member emails or phone numbers exposed');
    assert(data3.idea.leader_email === undefined && data3.idea.leader_mobile === undefined, 'No leader contact fields exposed');

    // --------------------------------------------------------------------------
    // TEST 4: Route Order & Resolution (GET /api/ideas/resolve/:identifier)
    // --------------------------------------------------------------------------
    console.log('\n4. Testing GET /api/ideas/resolve/:identifier (Route Ordering & Multi-Product Safety)...');

    // 4a. Direct Product UUID
    const resResolveProd = await fetch(`${baseUrl}/api/ideas/resolve/${sampleProductId}`);
    const dataResolveProd = await resResolveProd.json();
    assert(resResolveProd.status === 200, 'Resolve endpoint reached (Route order correct: not hijacked by /:productId)');
    assert(dataResolveProd.resolution_type === 'direct_product', 'Product UUID resolves to direct_product');
    assert(dataResolveProd.product_id === sampleProductId, 'Direct product ID matches');

    // 4b. Single-Product Team UUID
    const sampleTeamId = firstIdea.team_id;
    const resResolveTeam = await fetch(`${baseUrl}/api/ideas/resolve/${sampleTeamId}`);
    const dataResolveTeam = await resResolveTeam.json();
    assert(resResolveTeam.status === 200, 'Team UUID resolution returns HTTP 200');
    assert(
      dataResolveTeam.resolution_type === 'team_single' || dataResolveTeam.resolution_type === 'team_multi',
      `Team UUID resolves to ${dataResolveTeam.resolution_type}`
    );

    // 4c. Multi-Product Team UUID (ChameleX has 2 products)
    const chamelexTeamId = '95a5a40c-cc97-4312-8235-158355b3675d';
    const resChamelex = await fetch(`${baseUrl}/api/ideas/resolve/${chamelexTeamId}`);
    const dataChamelex = await resChamelex.json();
    assert(resChamelex.status === 200, 'ChameleX team ID resolution returns HTTP 200');
    assert(dataChamelex.resolution_type === 'team_multi', 'MULTI-PRODUCT SAFETY: ChameleX resolves to team_multi');
    assert(dataChamelex.total_products === 2, 'MULTI-PRODUCT SAFETY: Exactly 2 products returned without silent guessing');
    assert(Array.isArray(dataChamelex.products) && dataChamelex.products.length === 2, 'Products array has both ideas');

    // 4d. QR Token Resolution (Team QR with NULL product_id)
    const chamelexQrToken = '397bfe03c3926358880af7f4919cc952';
    const resQr = await fetch(`${baseUrl}/api/ideas/resolve/${chamelexQrToken}`);
    const dataQr = await resQr.json();
    assert(resQr.status === 200, 'QR token resolution returns HTTP 200');
    assert(dataQr.resolution_type === 'qr_team_multi', 'QR COMPATIBILITY: Legacy QR resolves to qr_team_multi');
    assert(dataQr.total_products === 2, 'QR COMPATIBILITY: Returns all products for legacy team QR');

    // 4e. Invalid Identifier Resolution
    const resInvalid = await fetch(`${baseUrl}/api/ideas/resolve/non-existent-token-xyz-1234`);
    assert(resInvalid.status === 404, 'Invalid identifier returns HTTP 404');
    const dataInvalid = await resInvalid.json();
    assert(dataInvalid.error_code === 'IDEA_NOT_FOUND', 'Safe error code IDEA_NOT_FOUND returned');

    // --------------------------------------------------------------------------
    // TEST 5: Input Validation on Like & Visit Endpoints
    // --------------------------------------------------------------------------
    console.log('\n5. Testing Input Validation on Like & Visit Endpoints...');

    // 5a. Non-UUID Product ID
    const resLikeBad = await fetch(`${baseUrl}/api/ideas/invalid-uuid/like`, { method: 'POST' });
    assert(resLikeBad.status === 400, 'POST /like with invalid UUID returns HTTP 400');
    const dataLikeBad = await resLikeBad.json();
    assert(dataLikeBad.error_code === 'INVALID_PRODUCT_ID', 'Returns INVALID_PRODUCT_ID error');

    const resVisitBad = await fetch(`${baseUrl}/api/ideas/invalid-uuid/visit`, { method: 'POST' });
    assert(resVisitBad.status === 400, 'POST /visit with invalid UUID returns HTTP 400');

    // 5b. Non-existent Product ID
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const resLikeFake = await fetch(`${baseUrl}/api/ideas/${fakeUuid}/like`, { method: 'POST' });
    assert(resLikeFake.status === 404, 'POST /like for non-existent product returns HTTP 404');
    const dataLikeFake = await resLikeFake.json();
    assert(dataLikeFake.error_code === 'PRODUCT_NOT_FOUND', 'Returns PRODUCT_NOT_FOUND error');

    const resVisitFake = await fetch(`${baseUrl}/api/ideas/${fakeUuid}/visit`, { method: 'POST' });
    assert(resVisitFake.status === 404, 'POST /visit for non-existent product returns HTTP 404');

    // --------------------------------------------------------------------------
    // TEST 6: Static Code Safety Assertions (No direct table INSERTs)
    // --------------------------------------------------------------------------
    console.log('\n6. Checking Static Code Safety in ideaRoutes.js...');
    const routeCode = fs.readFileSync(path.join(__dirname, 'routes', 'ideaRoutes.js'), 'utf8');

    const hasDirectLikeInsert = /\.from\(['"`]idea_likes['"`]\)\.insert\(/i.test(routeCode);
    assert(!hasDirectLikeInsert, 'SECURITY: Zero direct table INSERTs into idea_likes in backend code');

    const hasDirectVisitInsert = /\.from\(['"`]idea_visits['"`]\)\.insert\(/i.test(routeCode);
    assert(!hasDirectVisitInsert, 'SECURITY: Zero direct table INSERTs into idea_visits in backend code');

    const usesLikeRpc = /supabase\.rpc\(['"`]record_idea_like['"`]/i.test(routeCode);
    assert(usesLikeRpc, 'ARCHITECTURE: Uses record_idea_like RPC exclusively');

    const usesVisitRpc = /supabase\.rpc\(['"`]record_idea_visit['"`]/i.test(routeCode);
    assert(usesVisitRpc, 'ARCHITECTURE: Uses record_idea_visit RPC exclusively');

    // --------------------------------------------------------------------------
    // TEST 7: Existing Voting Route Regression Check
    // --------------------------------------------------------------------------
    console.log('\n7. Checking Existing Voting Route Integrity...');
    const resVoting = await fetch(`${baseUrl}/api/voting/qr/test-non-existent-token-for-check`);
    assert(resVoting.status === 404 || resVoting.status === 400 || resVoting.status === 401 || resVoting.status === 403, 'Existing /api/voting routes respond without collision');

  } catch (err) {
    console.error('Unhandled test exception:', err);
    failed++;
  } finally {
    stopServer();
  }

  console.log('\n================================================================');
  console.log(` TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
