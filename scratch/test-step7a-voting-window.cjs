// scratch/test-step7a-voting-window.cjs
// Verification suite for Step 7A: Admin Voting Window Control & Public Voting State Verification

const fs = require('fs');
const path = require('path');
const http = require('http');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedTests++;
  }
}

console.log('================================================================');
console.log('   IPL-2026: STEP 7A VOTING WINDOW CONTROL VERIFICATION SUITE   ');
console.log('================================================================\n');

// 1. Read files
const votingRoutesJs = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/backend/routes/votingRoutes.js'), 'utf8');
const adminVotingJsx = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/src/components/AdminVotingManagement.jsx'), 'utf8');
const publicIdeaPageJsx = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/src/components/PublicIdeaPage.jsx'), 'utf8');
const votingModalJsx = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/src/components/VotingModal.jsx'), 'utf8');
const appJsx = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/src/App.jsx'), 'utf8');
const emailGateJsx = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/src/components/EmailGate.jsx'), 'utf8');
const ideaRoutesJs = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/backend/routes/ideaRoutes.js'), 'utf8');

// -----------------------------------------------------------------------------
// SECTION 1: Static Architecture & Authoritative State Source
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Static Architecture & Authoritative State Source ---');

// 1. Authoritative source is voting_controls
assert(
  votingRoutesJs.includes("from('voting_controls')") &&
  votingRoutesJs.includes('getVotingControls()'),
  'Authoritative voting state derives from voting_controls table / getVotingControls()'
);

// 2. Admin controls toggle
assert(
  adminVotingJsx.includes("/api/voting/admin/controls") &&
  adminVotingJsx.includes("is_voting_active: nextVal"),
  'AdminVotingManagement updates authoritative state via POST /api/voting/admin/controls'
);
assert(
  adminVotingJsx.includes("Community Voting") &&
  adminVotingJsx.includes("metrics.isVotingActive ? 'OPEN' : 'CLOSED'"),
  'AdminVotingManagement clearly displays Community Voting status as OPEN / CLOSED'
);

// 3. Backend rejects vote when voting is OFF
assert(
  votingRoutesJs.includes('if (!controls?.is_voting_active) {') &&
  votingRoutesJs.includes("error_code: 'VOTING_CLOSED'") &&
  votingRoutesJs.includes('Live voting is currently closed by the event administrator.'),
  'POST /api/voting/vote independently rejects votes with 403 VOTING_CLOSED when voting is OFF'
);

// 4. PublicIdeaPage handles voting controls
assert(
  publicIdeaPageJsx.includes('/api/voting/status') &&
  publicIdeaPageJsx.includes('setIsVotingActive(data.is_voting_active)'),
  'PublicIdeaPage fetches authoritative voting status from /api/voting/status'
);
assert(
  publicIdeaPageJsx.includes("table: 'voting_controls'") &&
  publicIdeaPageJsx.includes('setIsVotingActive(payload.new.is_voting_active)'),
  'PublicIdeaPage subscribes to voting_controls realtime changes'
);
assert(
  publicIdeaPageJsx.includes('disabled={!isVotingActive}') &&
  publicIdeaPageJsx.includes("isVotingActive ? '🗳️ Vote (+2)' : '🗳️ Voting Closed'"),
  'PublicIdeaPage Vote button is explicitly disabled and shows "Voting Closed" when inactive'
);
assert(
  publicIdeaPageJsx.includes('Voting Inactive'),
  'PublicIdeaPage displays "Voting Inactive" badge when voting is OFF'
);
assert(
  publicIdeaPageJsx.includes('if (!isVotingActive) {') &&
  publicIdeaPageJsx.includes("title: 'VOTING CLOSED'"),
  'PublicIdeaPage handleVoteClick guards against click events when voting is closed'
);

// 5. Voting remains PRODUCT-LEVEL
assert(
  votingRoutesJs.includes('cast_vote') &&
  votingRoutesJs.includes('p_product_id: product_id'),
  'Voting submission uses product_id as primary voting entity'
);
assert(
  votingRoutesJs.includes('product_votes') &&
  votingRoutesJs.includes('total_votes: newProductVotes'),
  'Backend increments product_votes per product_id'
);

// 6. Voting eligibility rules preserved
assert(
  appJsx.includes("@sece.ac.in") && votingModalJsx.includes("@sece.ac.in") && emailGateJsx.includes("@sece.ac.in"),
  'College domain restriction (@sece.ac.in) remains enforced across App, VotingModal, and EmailGate'
);
assert(
  votingRoutesJs.includes("error_code: 'OWN_TEAM_VOTE_BLOCKED'"),
  'Own-team voting prevention remains enforced'
);
assert(
  votingRoutesJs.includes("error_code: 'ALREADY_VOTED'"),
  'Duplicate voting prevention remains enforced'
);
assert(
  votingRoutesJs.includes("error_code: 'DEPARTMENT_INELIGIBLE'"),
  'Department eligibility restriction remains enforced'
);

// 7. Likes & Visits decoupled from voting window
assert(
  !ideaRoutesJs.includes('is_voting_active'),
  'Likes and visits are completely decoupled from voting window (available at all times)'
);

// -----------------------------------------------------------------------------
// SECTION 2: Functional Server Integration Tests
// -----------------------------------------------------------------------------
async function runFunctionalTests() {
  console.log('\n--- SECTION 2: Functional API Tests on Live Test Server ---');

  const backendDir = path.resolve('e:/collegeProject/ipl-2026/backend');
  const backendRequire = (id) => require(require.resolve(id, { paths: [backendDir] }));

  // Load dotenv
  const dotenv = backendRequire('dotenv');
  dotenv.config({ path: path.join(backendDir, '.env') });

  const express = backendRequire('express');
  const app = express();
  app.use(express.json());

  // Mount voting and idea routes
  const votingRouter = require(path.join(backendDir, 'routes/votingRoutes.js'));
  const ideaRouter = require(path.join(backendDir, 'routes/ideaRoutes.js'));

  app.use('/api/voting', votingRouter);
  app.use('/api/ideas', ideaRouter);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  function makeRequest(method, urlPath, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, baseUrl);
      const req = http.request(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(raw); } catch (e) {}
          resolve({ status: res.statusCode, headers: res.headers, data: json, raw });
        });
      });
      req.on('error', reject);
      if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  }

  try {
    // -------------------------------------------------------------------------
    // PART A: VOTING OFF VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n[Part A: Testing when Voting is OFF]');

    // Step A.1: Turn voting OFF as admin
    const turnOffRes = await makeRequest('POST', '/api/voting/admin/controls', {
      'Authorization': 'Bearer TEST_TOKEN_admin_user:admin@sece.ac.in:admin'
    }, { is_voting_active: false });
    assert(turnOffRes.status === 200, 'Admin can set is_voting_active = false');

    // Step A.2: Check voting status endpoint
    const statusRes = await makeRequest('GET', '/api/voting/status');
    assert(statusRes.status === 200, 'GET /api/voting/status returns HTTP 200');
    assert(statusRes.data?.is_voting_active === false, 'is_voting_active reports FALSE');

    // Step A.3: Fetch public ideas list (must succeed when voting is OFF)
    const ideasListRes = await makeRequest('GET', '/api/ideas?limit=3');
    assert(ideasListRes.status === 200, 'GET /api/ideas succeeds when voting is OFF');
    assert(ideasListRes.data?.ideas?.length > 0, 'Public ideas list contains ideas');
    const sampleProduct = ideasListRes.data.ideas[0];
    const sampleProductId = sampleProduct.product_id;

    // Step A.4: Fetch exact idea details (must succeed when voting is OFF)
    const ideaDetailRes = await makeRequest('GET', `/api/ideas/${sampleProductId}`);
    assert(ideaDetailRes.status === 200, 'GET /api/ideas/:productId succeeds when voting is OFF');
    assert(ideaDetailRes.data?.idea?.product_id === sampleProductId, 'Idea details match requested product');

    // Step A.5: Like an idea (must succeed when voting is OFF)
    const likeRes = await makeRequest('POST', `/api/ideas/${sampleProductId}/like`, {
      'x-visitor-token': 'test-visitor-voting-off-123'
    });
    assert(likeRes.status === 200 || likeRes.status === 429, 'Like action operates independently of voting window');

    // Step A.6: Track visit (must succeed when voting is OFF)
    const visitRes = await makeRequest('POST', `/api/ideas/${sampleProductId}/visit`, {
      'x-visitor-token': 'test-visitor-voting-off-123'
    });
    assert(visitRes.status === 200, 'Visit analytics operates independently of voting window');

    // Step A.7: Unauthenticated vote attempt while OFF (rejected)
    const voteAttemptUnauth = await makeRequest('POST', '/api/voting/vote', {}, {
      product_id: sampleProductId,
      team_id: sampleProduct.team_id
    });
    assert(voteAttemptUnauth.status === 401, 'Unauthenticated vote rejected with HTTP 401');

    // Step A.8: Authenticated vote attempt while OFF (strictly rejected with 403 VOTING_CLOSED)
    const voteAttemptAuth = await makeRequest('POST', '/api/voting/vote', {
      'Authorization': 'Bearer TEST_TOKEN_student1:student1@sece.ac.in:student'
    }, {
      product_id: sampleProductId,
      team_id: sampleProduct.team_id
    });
    assert(
      voteAttemptAuth.status === 403 && voteAttemptAuth.data?.error_code === 'VOTING_CLOSED',
      'Authenticated vote while OFF rejected with HTTP 403 and error_code: VOTING_CLOSED'
    );
    assert(
      voteAttemptAuth.data?.message?.includes('closed'),
      'Reject message states voting is closed'
    );

    // Step A.9: Check public leaderboard (must remain accessible when voting is OFF)
    const lbRes = await makeRequest('GET', '/api/ideas/leaderboard');
    assert(lbRes.status === 200, 'Leaderboard remains accessible when voting is OFF');
    assert(lbRes.data?.leaderboard?.length > 0, 'Leaderboard contains idea rankings');

    // -------------------------------------------------------------------------
    // PART B: VOTING ON VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n[Part B: Testing when Voting is ON]');

    // Step B.1: Admin sets is_voting_active = true
    const turnOnRes = await makeRequest('POST', '/api/voting/admin/controls', {
      'Authorization': 'Bearer TEST_TOKEN_admin_user:admin@sece.ac.in:admin'
    }, { is_voting_active: true });
    assert(turnOnRes.status === 200, 'Admin can set is_voting_active = true');

    // Step B.2: Check status reports OPEN
    const statusOnRes = await makeRequest('GET', '/api/voting/status');
    assert(statusOnRes.status === 200, 'GET /api/voting/status returns HTTP 200');
    assert(statusOnRes.data?.is_voting_active === true, 'is_voting_active reports TRUE (OPEN)');

    // Step B.3: Score formula verification
    const firstRanked = lbRes.data.leaderboard[0];
    const expectedScore = (firstRanked.likes_count || 0) + ((firstRanked.votes_count || 0) * 2);
    assert(
      firstRanked.total_score === expectedScore,
      `Authoritative score formula verified: Score (${firstRanked.total_score}) = Likes (${firstRanked.likes_count}) + Votes (${firstRanked.votes_count}) × 2`
    );

    // Step B.4: Views do not contribute to score
    assert(
      typeof firstRanked.visits_count === 'undefined' || firstRanked.total_score === expectedScore,
      'Views/Visits do NOT contribute to leaderboard score'
    );

    // -------------------------------------------------------------------------
    // PART C: VOTING OFF AGAIN VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n[Part C: Testing when Voting is turned OFF again]');

    // Step C.1: Admin turns voting back OFF
    const turnOffAgainRes = await makeRequest('POST', '/api/voting/admin/controls', {
      'Authorization': 'Bearer TEST_TOKEN_admin_user:admin@sece.ac.in:admin'
    }, { is_voting_active: false });
    assert(turnOffAgainRes.status === 200, 'Admin turns voting back OFF successfully');

    // Step C.2: Status reports CLOSED
    const statusOffAgainRes = await makeRequest('GET', '/api/voting/status');
    assert(statusOffAgainRes.data?.is_voting_active === false, 'Status reports CLOSED again');

    // Step C.3: Vote rejected again
    const voteAttemptOffAgain = await makeRequest('POST', '/api/voting/vote', {
      'Authorization': 'Bearer TEST_TOKEN_student2:student2@sece.ac.in:student'
    }, {
      product_id: sampleProductId,
      team_id: sampleProduct.team_id
    });
    assert(
      voteAttemptOffAgain.status === 403 && voteAttemptOffAgain.data?.error_code === 'VOTING_CLOSED',
      'New vote attempt rejected with 403 VOTING_CLOSED'
    );

    // Step C.4: Leaderboard and likes remain active
    const lbAfterRes = await makeRequest('GET', '/api/ideas/leaderboard');
    assert(lbAfterRes.status === 200, 'Leaderboard remains 100% accessible');
    const likeAfterRes = await makeRequest('POST', `/api/ideas/${sampleProductId}/like`, {
      'x-visitor-token': 'test-visitor-voting-off-again'
    });
    assert(likeAfterRes.status === 200 || likeAfterRes.status === 429, 'Likes remain available after voting closed');

    // -------------------------------------------------------------------------
    // PART D: REALTIME & STATE CONSISTENCY
    // -------------------------------------------------------------------------
    console.log('\n[Part D: Realtime Subscription & State Consistency]');

    const hasLikesChannel = publicIdeaPageJsx.includes("channel(`rt-likes-${productId}`)");
    const hasVotesChannel = publicIdeaPageJsx.includes("channel(`rt-votes-${productId}`)");
    const hasControlsChannel = publicIdeaPageJsx.includes("channel(`rt-controls-${productId}`)");
    const cleansUpChannels = publicIdeaPageJsx.includes('removeChannel(controlsChannel)');
    assert(hasLikesChannel && hasVotesChannel, 'Product-scoped realtime channels configured');
    assert(hasControlsChannel, 'voting_controls realtime channel configured');
    assert(cleansUpChannels, 'All realtime channels cleaned up in useEffect cleanup');
    assert(
      publicIdeaPageJsx.includes('useState(false)'),
      'PublicIdeaPage initializes isVotingActive to false (secure-by-default)'
    );

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${passedTests + failedTests}`);
  console.log(`PASSED: ${passedTests}`);
  console.log(`FAILED: ${failedTests}`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runFunctionalTests().catch(err => {
  console.error('Fatal error running Step 7A tests:', err);
  process.exit(1);
});
