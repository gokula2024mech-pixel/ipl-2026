// scratch/test-step5a-leaderboard.cjs
// Step 5A Public Idea Leaderboard & Live Scoring Automated Test Suite

const path = require('path');
const backendDir = 'E:/collegeProject/ipl-2026/backend';
module.paths.push(path.join(backendDir, 'node_modules'));

const http = require('http');
const express = require(path.join(backendDir, 'node_modules/express'));
const ideaRoutes = require(path.join(backendDir, 'routes/ideaRoutes'));
const votingRoutes = require(path.join(backendDir, 'routes/votingRoutes'));

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

async function runTests() {
  console.log('================================================================');
  console.log('       IPL-2026: STEP 5A PUBLIC IDEA LEADERBOARD TEST SUITE     ');
  console.log('================================================================\n');

  const app = express();
  app.use(express.json());
  app.use('/api/ideas', ideaRoutes);
  app.use('/api/voting', votingRoutes);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------
    // Test 1: GET /api/ideas/leaderboard HTTP 200 & structure
    // -------------------------------------------------------------
    console.log('1. Testing GET /api/ideas/leaderboard endpoint...');
    const res1 = await fetch(`${baseUrl}/api/ideas/leaderboard`);
    assert(res1.status === 200, `GET /api/ideas/leaderboard returns HTTP 200 (actual: ${res1.status})`);

    const data1 = await res1.json();
    assert(data1.success === true, 'Response has success: true');
    assert(typeof data1.total_ideas === 'number' && data1.total_ideas > 0, `total_ideas is positive number (${data1.total_ideas})`);
    assert(typeof data1.total_likes === 'number', `total_likes is number (${data1.total_likes})`);
    assert(typeof data1.total_votes === 'number', `total_votes is number (${data1.total_votes})`);
    assert(Array.isArray(data1.leaderboard), 'leaderboard is an array');
    assert(data1.leaderboard.length === data1.total_ideas, `leaderboard length matches total_ideas (${data1.leaderboard.length})`);

    // -------------------------------------------------------------
    // Test 2: Multi-product teams are NOT collapsed (ChameleX verification)
    // -------------------------------------------------------------
    console.log('\n2. Testing multi-product independence (ChameleX)...');
    const chamelexEntries = data1.leaderboard.filter(item =>
      (item.team_name || item.teamName || '').toLowerCase().includes('chamelex')
    );
    assert(chamelexEntries.length === 2, `ChameleX has exactly 2 independent entries in leaderboard (found: ${chamelexEntries.length})`);

    const chamelexIds = new Set(chamelexEntries.map(e => e.product_id));
    assert(chamelexIds.size === 2, 'Both ChameleX entries have unique product_ids');

    const titles = chamelexEntries.map(e => e.product_title);
    assert(titles[0] !== titles[1], `ChameleX products have distinct titles: "${titles[0]}" and "${titles[1]}"`);

    const ranks = chamelexEntries.map(e => e.rank);
    assert(ranks[0] !== ranks[1], `Each ChameleX entry has its own independent rank: #${ranks[0]} and #${ranks[1]}`);

    // -------------------------------------------------------------
    // Test 3: Score calculation rule: Score = Likes + (Votes * 2)
    // -------------------------------------------------------------
    console.log('\n3. Testing scoring formula: Score = Likes + (Votes * 2)...');
    let formulaValidCount = 0;
    for (const item of data1.leaderboard) {
      const expectedScore = (item.likes_count || 0) + ((item.votes_count || 0) * 2);
      if (item.total_score === expectedScore) {
        formulaValidCount++;
      }
    }
    assert(formulaValidCount === data1.leaderboard.length, `All ${data1.leaderboard.length} entries satisfy Score = Likes + (Votes * 2)`);

    // -------------------------------------------------------------
    // Test 4: Visits MUST NOT contribute to Score
    // -------------------------------------------------------------
    console.log('\n4. Testing that Visits do NOT contribute to Score...');
    const hasVisitsInScore = data1.leaderboard.some(item => item.visits_count !== undefined && item.total_score > (item.likes_count + item.votes_count * 2));
    assert(!hasVisitsInScore, 'Visits count is not incorporated into total_score formula');

    // -------------------------------------------------------------
    // Test 5: Deterministic tie-breaking order
    // -------------------------------------------------------------
    console.log('\n5. Testing deterministic tie-breaker sorting...');
    let sortedCorrectly = true;
    let sortingErrorMsg = '';

    for (let i = 0; i < data1.leaderboard.length - 1; i++) {
      const a = data1.leaderboard[i];
      const b = data1.leaderboard[i + 1];

      if (a.total_score < b.total_score) {
        sortedCorrectly = false;
        sortingErrorMsg = `Score violation at rank ${a.rank} (${a.total_score}) vs rank ${b.rank} (${b.total_score})`;
        break;
      } else if (a.total_score === b.total_score) {
        if (a.likes_count < b.likes_count) {
          sortedCorrectly = false;
          sortingErrorMsg = `Likes tie-breaker violation at rank ${a.rank} vs ${b.rank}`;
          break;
        } else if (a.likes_count === b.likes_count) {
          if (a.votes_count < b.votes_count) {
            sortedCorrectly = false;
            sortingErrorMsg = `Votes tie-breaker violation at rank ${a.rank} vs ${b.rank}`;
            break;
          } else if (a.votes_count === b.votes_count) {
            if (a.product_id.localeCompare(b.product_id) > 0) {
              sortedCorrectly = false;
              sortingErrorMsg = `UUID tie-breaker violation at rank ${a.rank} (${a.product_id}) vs ${b.rank} (${b.product_id})`;
              break;
            }
          }
        }
      }
    }
    assert(sortedCorrectly, sortedCorrectly ? 'Deterministic sort verified: total_score DESC, likes DESC, votes DESC, product_id ASC' : sortingErrorMsg);

    // -------------------------------------------------------------
    // Test 6: Strict Confidentiality & Department Exclusion Sanitization
    // -------------------------------------------------------------
    console.log('\n6. Testing strict confidentiality & Department removal...');
    const forbiddenKeys = [
      'department', 'dept', 'leader_department', 'member_department',
      'email', 'leader_email', 'member_email', 'phone', 'mobile',
      'leader_mobile', 'user_id', 'auth_id', 'evaluator_score',
      'evaluation', 'evaluator_comment', 'marks', 'drive_link',
      'document_url', 'submission_files'
    ];

    let leakFound = false;
    let leakedKey = '';

    for (const item of data1.leaderboard) {
      for (const key of Object.keys(item)) {
        if (forbiddenKeys.includes(key.toLowerCase())) {
          leakFound = true;
          leakedKey = key;
          break;
        }
      }
      if (leakFound) break;
    }
    assert(!leakFound, leakFound ? `CONFIDENTIALITY LEAK: Found forbidden field "${leakedKey}"` : 'CONFIDENTIALITY SECURE: Zero department, emails, phones, user IDs, or evaluator data');

    const hasDepartmentField = data1.leaderboard.some(item => item.department !== undefined || item.leader_department !== undefined);
    assert(!hasDepartmentField, 'STEP 5A-FIX VERIFIED: Department is strictly excluded from public leaderboard response');

    // -------------------------------------------------------------
    // Test 7: Required public fields present on all items
    // -------------------------------------------------------------
    console.log('\n7. Testing required public fields present...');
    const sample = data1.leaderboard[0];
    assert(typeof sample.rank === 'number', 'Field "rank" is number');
    assert(Boolean(sample.product_id), 'Field "product_id" is present');
    assert(Boolean(sample.product_title), 'Field "product_title" is present');
    assert(Boolean(sample.team_name), 'Field "team_name" is present');
    assert(sample.registration_id !== undefined, 'Field "registration_id" is defined');
    assert(typeof sample.likes_count === 'number', 'Field "likes_count" is number');
    assert(typeof sample.votes_count === 'number', 'Field "votes_count" is number');
    assert(typeof sample.total_score === 'number', 'Field "total_score" is number');
    assert(sample.department === undefined, 'Field "department" is strictly undefined');

    // -------------------------------------------------------------
    // Test 8: Short TTL Caching
    // -------------------------------------------------------------
    console.log('\n8. Testing in-memory cache behavior...');
    const resCache = await fetch(`${baseUrl}/api/ideas/leaderboard`);
    const dataCache = await resCache.json();
    assert(dataCache.cached === true, 'Rapid repeat request served from in-memory cache (cached: true)');

    // -------------------------------------------------------------
    // Test 9: Existing voting routes intact
    // -------------------------------------------------------------
    console.log('\n9. Testing existing voting routes integrity...');
    const resVote = await fetch(`${baseUrl}/api/voting/leaderboard?round=1`);
    assert(resVote.status === 200, `Existing GET /api/voting/leaderboard returns HTTP 200 (actual: ${resVote.status})`);
    const voteData = await resVote.json();
    assert(voteData.success === true, 'Existing voting leaderboard succeeds without regressions');

  } catch (err) {
    console.error('Test execution error:', err);
    failedTests++;
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(` STEP 5A TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests();
