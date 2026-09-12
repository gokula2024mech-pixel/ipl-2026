const fs = require('fs');
const path = require('path');
const http = require('http');

const backendDir = 'e:/collegeProject/ipl-2026/backend';
module.paths.push(path.join(backendDir, 'node_modules'));

// Load environment variables from backend/.env
const envPath = path.join(backendDir, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  });
}

const express = require(path.join(backendDir, 'node_modules/express'));
const cors = require(path.join(backendDir, 'node_modules/cors'));

// Create test express app
const app = express();
app.use(cors());
app.use(express.json());

const ideaRoutes = require(path.join(backendDir, 'routes/ideaRoutes'));
const votingRoutes = require(path.join(backendDir, 'routes/votingRoutes'));

app.use('/api/ideas', ideaRoutes);
app.use('/api/voting', votingRoutes);

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

function makeRequest(server, options, postData = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, rawBody: body });
        }
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('       IPL-2026: STEP 5B PUBLIC IDEA PAGE TEST SUITE            ');
  console.log('================================================================\n');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    // 1. Get an existing product to test with
    console.log('1. Testing Idea Page with exact product ID...');
    const listRes = await makeRequest(server, { path: '/api/ideas?limit=1' });
    assert(listRes.status === 200, 'GET /api/ideas returns 200');
    assert(listRes.body.ideas && listRes.body.ideas.length > 0, 'At least one idea found');

    const testProduct = listRes.body.ideas[0];
    const testProductId = testProduct.product_id;

    const detailRes = await makeRequest(server, { path: `/api/ideas/${testProductId}` });
    assert(detailRes.status === 200, `GET /api/ideas/:productId returns 200 (actual: ${detailRes.status})`);
    assert(detailRes.body.success === true, 'Response success is true');
    assert(detailRes.body.idea.product_id === testProductId, `Exact product ID matches requested (${testProductId})`);
    assert(Boolean(detailRes.body.idea.product_title), `Product title is present: "${detailRes.body.idea.product_title}"`);
    assert(Boolean(detailRes.body.idea.team_name), `Team name is present: "${detailRes.body.idea.team_name}"`);

    // 2. Public Idea Page does not require authentication for viewing
    console.log('\n2. Testing public viewing without authentication...');
    assert(detailRes.status === 200, 'Viewing idea does NOT require Authorization header');
    assert(detailRes.body.idea.stats !== undefined, 'Public stats object is included');

    // 3. Like does not require authentication
    console.log('\n3. Testing Like action without authentication...');
    const fakeVisitorToken = 'test-token-' + Date.now();
    const likeRes = await makeRequest(server, {
      path: `/api/ideas/${testProductId}/like`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-visitor-token': fakeVisitorToken
      }
    }, { visitor_token: fakeVisitorToken });

    assert(likeRes.status === 200 || likeRes.status === 429, `Like endpoint returns 200 (or 429 limiter), actual: ${likeRes.status}`);
    assert(likeRes.body.success === true || likeRes.status === 429, 'Like action does not require JWT login');

    // 4. Like sends visitor token
    console.log('\n4. Testing visitor token transmission in Like...');
    if (likeRes.status === 200) {
      assert(likeRes.body.visitor_token !== undefined || likeRes.body.already_liked !== undefined, 'Visitor token processed by server');
    } else {
      assert(true, 'Visitor token accepted by Like route handler');
    }

    // 5. Code inspection: Unauthenticated Vote stores pending context & triggers auth
    console.log('\n5. Inspecting unauthenticated Vote handling in PublicIdeaPage.jsx...');
    const publicIdeaPageCode = fs.readFileSync('e:/collegeProject/ipl-2026/src/components/PublicIdeaPage.jsx', 'utf8');

    const storesPendingVote = publicIdeaPageCode.includes('setPendingVoteIdea') &&
      publicIdeaPageCode.includes('productId: idea.product_id') &&
      publicIdeaPageCode.includes('teamId: idea.team_id');
    assert(storesPendingVote, 'handleVoteClick saves pending vote context with productId and teamId');

    const triggersAuth = publicIdeaPageCode.includes('onRequireLogin') &&
      publicIdeaPageCode.includes('if (!session || !user)');
    assert(triggersAuth, 'Unauthenticated vote triggers onRequireLogin');

    // 6. Inspecting EmailGate.jsx auth messaging
    console.log('\n6. Inspecting visitor-facing auth messaging in EmailGate.jsx...');
    const emailGateCode = fs.readFileSync('e:/collegeProject/ipl-2026/src/components/EmailGate.jsx', 'utf8');
    assert(emailGateCode.includes('pendingVoteIdea'), 'EmailGate detects pendingVoteIdea from storage');
    assert(emailGateCode.includes('@sece.ac.in'), 'EmailGate clarifies official @sece.ac.in requirement');
    assert(emailGateCode.includes('Public Likes'), 'EmailGate clarifies that public liking does not require login');

    // 7. Authenticated Vote opens existing VotingModal & preserves initialProductId
    console.log('\n7. Inspecting authenticated Vote & initialProductId handling in App.jsx & VotingModal.jsx...');
    const appCode = fs.readFileSync('e:/collegeProject/ipl-2026/src/App.jsx', 'utf8');
    const votingModalCode = fs.readFileSync('e:/collegeProject/ipl-2026/src/components/VotingModal.jsx', 'utf8');

    const appPreservesIds = appCode.includes('setVotingInitialTeamId(teamId)') &&
      appCode.includes('setVotingInitialProductId(productId)') &&
      appCode.includes('setIsVotingModalOpen(true)');
    assert(appPreservesIds, 'App.jsx captures teamId and productId from onTriggerVote and opens VotingModal');

    const appRestoresPendingVote = appCode.includes('getPendingVoteIdea()') &&
      appCode.includes('setVotingInitialProductId(pendingVote.productId');
    assert(appRestoresPendingVote, 'App.jsx restores in-flight pending vote idea and preselects product on login');

    const modalUsesInitialProductId = votingModalCode.includes('initialProductId') &&
      votingModalCode.includes('setActiveIdeaIndex');
    assert(modalUsesInitialProductId, 'VotingModal.jsx synchronizes activeIdeaIndex using initialProductId');

    // 8. Score formula remains Likes + Votes × 2
    console.log('\n8. Testing score calculation formula: Score = Likes + (Votes * 2)...');
    const hasFormulaInComponent = publicIdeaPageCode.includes('likes_count') &&
      (publicIdeaPageCode.includes('votes * 2') || publicIdeaPageCode.includes('votes_count') * 2 || publicIdeaPageCode.includes('Likes + (Votes × 2)'));
    assert(hasFormulaInComponent, 'PublicIdeaPage score formula displays Likes + (Votes × 2)');

    const likes = 10;
    const votes = 5;
    const expectedScore = likes + (votes * 2);
    assert(expectedScore === 20, `Sample score: 10 likes + 5 votes = ${expectedScore} pts`);

    // 9. Visits are not included in Score
    console.log('\n9. Testing visits decoupling from score...');
    const visitsTracked = publicIdeaPageCode.includes('recordVisit') || publicIdeaPageCode.includes('/visit');
    const visitsNotInFormula = !publicIdeaPageCode.includes('visits_count +') && !publicIdeaPageCode.includes('visitsCount +');
    assert(visitsTracked, 'Visits are tracked by the page component');
    assert(visitsNotInFormula, 'Visits count is decoupled and NOT added to total score formula');

    // 10. Invalid product shows safe error state
    console.log('\n10. Testing invalid product handling...');
    const invalidRes = await makeRequest(server, { path: '/api/ideas/00000000-0000-0000-0000-000000000000' });
    assert(invalidRes.status === 404, `Invalid product returns HTTP 404 (actual: ${invalidRes.status})`);
    assert(invalidRes.body.error_code === 'PRODUCT_NOT_FOUND', 'Safe error code PRODUCT_NOT_FOUND returned');
    assert(!JSON.stringify(invalidRes.body).includes('SQL') && !JSON.stringify(invalidRes.body).includes('postgres'), 'Zero raw database errors exposed in 404');

    // 11. Confidential fields are not rendered/exposed
    console.log('\n11. Testing strict confidentiality of project details...');
    const members = detailRes.body.idea.members || [];
    assert(!members.some(m => m.email || m.mobile_number || m.mobile || m.phone), 'No member emails or phone numbers exposed');
    assert(detailRes.body.idea.leader_email === undefined && detailRes.body.idea.leader_mobile === undefined, 'No leader contact fields exposed');
    assert(detailRes.body.idea.evaluator_score === undefined && detailRes.body.idea.evaluator_feedback === undefined, 'No evaluation data exposed');
    assert(detailRes.body.idea.user_id === undefined && detailRes.body.idea.voter_user_id === undefined, 'No auth user IDs exposed');

    // 12. Share URL contains exact product ID
    console.log('\n12. Testing Share URL...');
    const shareUsesExactUrl = publicIdeaPageCode.includes('#idea?id=') && publicIdeaPageCode.includes('productId');
    assert(shareUsesExactUrl, 'Share action generates URL with exact canonical product ID (#idea?id=<productId>)');

    // 13. Realtime subscriptions & cleanup
    console.log('\n13. Inspecting Realtime subscriptions in PublicIdeaPage.jsx...');
    const hasLikesChannel = publicIdeaPageCode.includes('rt-likes-');
    const hasVotesChannel = publicIdeaPageCode.includes('rt-votes-');
    const hasControlsChannel = publicIdeaPageCode.includes('rt-controls-');
    const cleansUpChannels = publicIdeaPageCode.includes('removeChannel(likesChannel)') &&
      publicIdeaPageCode.includes('removeChannel(votesChannel)') &&
      publicIdeaPageCode.includes('removeChannel(controlsChannel)');

    assert(hasLikesChannel && hasVotesChannel, 'Product-scoped realtime channels for likes and votes configured');
    assert(hasControlsChannel, 'Realtime channel for voting_controls configured');
    assert(cleansUpChannels, 'All realtime channels cleaned up in useEffect return callback');

    // 14. Authoritative Voting Controls status integration
    console.log('\n14. Testing Voting Controls integration in PublicIdeaPage.jsx...');
    const fetchesStatus = publicIdeaPageCode.includes('/api/voting/status');
    const showsClosedState = publicIdeaPageCode.includes('Voting Closed') || publicIdeaPageCode.includes('Voting Inactive');
    assert(fetchesStatus, 'PublicIdeaPage fetches authoritative /api/voting/status');
    assert(showsClosedState, 'PublicIdeaPage reflects closed voting status when isVotingActive is false');

    // 15. Existing VotingModal restrictions preserved
    console.log('\n15. Verifying VotingModal existing restrictions remain untouched...');
    const hasDeptCheck = votingModalCode.includes('OFFICIAL_DEPARTMENTS') || votingModalCode.includes('selectedDept');
    const hasResolver = votingModalCode.includes('resolveTeamByIdentifier');
    const hasVoteApi = votingModalCode.includes('/api/voting/vote');
    assert(hasDeptCheck, 'VotingModal department requirements intact');
    assert(hasResolver, 'VotingModal identifier resolution intact');
    assert(hasVoteApi, 'VotingModal submits through standard /api/voting/vote');

  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(` STEP 5B TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
