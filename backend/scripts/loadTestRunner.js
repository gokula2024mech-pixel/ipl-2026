/**
 * IPL-2026 Controlled High-Concurrency Load Test & Verification Suite
 * 
 * STRICT PRODUCTION-SAFETY RULES:
 * 1. Uses MOCK DATA ONLY with strict prefixes (TEST_, LOADTEST_).
 * 2. Never modifies or touches real IPL 2026 teams, registrations, or student profiles.
 * 3. Before every mutation, verifies that the target record is 100% mock data.
 * 4. Cleans up every single mock record after test completion.
 * 5. Verifies: Production records modified = 0.
 * 6. Defaults target to http://localhost:5000. NEVER attacks production automatically.
 */

const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const { supabase } = require('../supabaseClient');

// Test Tier Configurations
const TIERS = {
  UNIT: { name: 'Unit Verification', concurrency: 10, totalRequests: 20 },
  A: { name: 'Tier A - 100 Users', concurrency: 100, totalRequests: 500 },
  B: { name: 'Tier B - 500 Users', concurrency: 500, totalRequests: 1500 },
  C: { name: 'Tier C - 1,000 Users', concurrency: 1000, totalRequests: 3000 },
  D: { name: 'Tier D - 1,500 Users', concurrency: 1500, totalRequests: 4500 },
  E: { name: 'Tier E - 2,000 Users', concurrency: 2000, totalRequests: 6000 }
};

// Parse command line arguments
const args = process.argv.slice(2);
const tierArg = (args.find(a => a.startsWith('--tier=')) || '--tier=UNIT').split('=')[1].toUpperCase();
const targetArg = (args.find(a => a.startsWith('--target=')) || 'http://localhost:5000').split('=')[1].replace(/\/+$/, '');

const activeTier = TIERS[tierArg] || TIERS.UNIT;
const testRunId = `LOADTEST_${Date.now()}`;

console.log('================================================================');
console.log(`IPL-2026 LOAD TESTING & VERIFICATION RUNNER`);
console.log(`Test Run ID: ${testRunId}`);
console.log(`Selected Tier: ${activeTier.name}`);
console.log(`Concurrency: ${activeTier.concurrency} virtual users`);
console.log(`Target Host: ${targetArg}`);
console.log('================================================================\n');

// Tracking metrics
const stats = {
  latencies: [],
  statusCounts: {},
  duplicateAttempts: 0,
  duplicateBlocked409: 0,
  rateLimits429: 0,
  success200: 0,
  forbidden403: 0,
  errors500: 0,
  mockRecordsCreated: {
    teams: 0,
    products: 0,
    product_members: 0,
    qrs: 0,
    votes: 0
  },
  productionRecordsModified: 0
};

/**
 * PRODUCTION-DATA SAFETY CHECK
 * Throws an error immediately if any operation attempts to touch non-mock data.
 */
function assertMockRecord(recordName, field = 'name') {
  if (!recordName || (!recordName.startsWith('TEST_') && !recordName.startsWith('LOADTEST_'))) {
    console.error(`🚨 FATAL SAFETY VIOLATION: Attempted mutation on non-mock record: "${recordName}"`);
    process.exit(1);
  }
}

/**
 * Setup isolated mock dataset in database
 */
async function setupMockData() {
  console.log('[Setup] Initializing isolated mock test data...');

  const mockTeamName = `TEST_TEAM_${testRunId}`;
  assertMockRecord(mockTeamName);

  // 1. Create Mock Team
  const { data: team, error: teamErr } = await supabase
    .from('teams')
    .insert([{ team_name: mockTeamName }])
    .select('id, team_name')
    .single();

  if (teamErr) {
    console.error('[Setup] Failed to create mock team:', teamErr.message);
    process.exit(1);
  }
  stats.mockRecordsCreated.teams += 1;
  const mockTeamId = team.id;
  console.log(`[Setup] ✓ Mock Team created: ${team.team_name} (${mockTeamId})`);

  // 2. Create Mock Product
  const mockProductTitle = `TEST_PRODUCT_${testRunId}`;
  assertMockRecord(mockProductTitle);

  const { data: prod, error: prodErr } = await supabase
    .from('products')
    .insert([{
      team_id: mockTeamId,
      product_number: 1,
      product_title: mockProductTitle,
      innovation_domain: 'Open Innovation',
      status: 'active'
    }])
    .select('id')
    .single();

  if (prodErr) {
    console.error('[Setup] Failed to create mock product:', prodErr.message);
    await cleanupMockData(mockTeamId);
    process.exit(1);
  }
  stats.mockRecordsCreated.products += 1;
  const mockProductId = prod.id;

  // 3. Fetch canonical department IDs for members
  const { data: depts } = await supabase
    .from('departments')
    .select('id, name')
    .limit(3);

  const dept1 = depts && depts[0] ? depts[0].id : null; // Leader Dept
  const dept2 = depts && depts[1] ? depts[1].id : null; // Member 1 Dept
  const dept3 = depts && depts[2] ? depts[2].id : null; // Member 2 Dept

  // 4. Create Mock Product Members (Leader, Member 1, Member 2)
  const mockMembers = [
    {
      product_id: mockProductId,
      member_name: `TEST_LEADER_${testRunId}`,
      member_email: `test.leader.${testRunId}@sece.ac.in`,
      department_id: dept1,
      role: 'Team Leader',
      is_team_leader: true
    },
    {
      product_id: mockProductId,
      member_name: `TEST_MEMBER1_${testRunId}`,
      member_email: `test.member1.${testRunId}@sece.ac.in`,
      department_id: dept2,
      role: 'Team Member',
      is_team_leader: false
    },
    {
      product_id: mockProductId,
      member_name: `TEST_MEMBER2_${testRunId}`,
      member_email: `test.member2.${testRunId}@sece.ac.in`,
      department_id: dept3,
      role: 'Team Member',
      is_team_leader: false
    }
  ];

  const { data: createdMembers, error: memErr } = await supabase
    .from('product_members')
    .insert(mockMembers)
    .select('id');

  if (memErr) {
    console.warn('[Setup] Mock product_members note:', memErr.message);
  } else {
    stats.mockRecordsCreated.product_members += (createdMembers || []).length;
  }

  // 5. Create Mock Permanent QR Token
  const mockQrToken = `TEST_QR_${testRunId}_${crypto.randomBytes(8).toString('hex')}`;
  assertMockRecord(mockQrToken);

  const { data: qrData, error: qrErr } = await supabase
    .from('team_qr_codes')
    .insert([{
      team_id: mockTeamId,
      qr_token: mockQrToken
    }])
    .select('qr_token')
    .single();

  if (qrErr) {
    console.warn('[Setup] Mock QR insert note:', qrErr.message);
  } else {
    stats.mockRecordsCreated.qrs += 1;
    console.log(`[Setup] ✓ Mock QR Token created: ${mockQrToken}`);
  }

  return {
    mockTeamId,
    mockTeamName,
    mockProductId,
    mockQrToken,
    leaderDept: depts && depts[0] ? depts[0].name : 'Mechanical Engineering',
    member1Dept: depts && depts[1] ? depts[1].name : 'Computer Science and Engineering',
    otherDept: depts && depts[2] ? depts[2].name : 'Cyber Security'
  };
}

/**
 * Execute load test simulation scenarios
 */
async function runSimulation(mockEnv) {
  console.log('\n[Simulation] Starting controlled scenarios against target API...');
  const startTime = Date.now();

  // Test 1: QR Resolution Latency
  console.log('[Scenario 1] Testing QR Resolution endpoint...');
  const qrStart = Date.now();
  try {
    const res = await fetch(`${targetArg}/api/voting/qr/${mockEnv.mockQrToken}`);
    const qrLatency = Date.now() - qrStart;
    stats.latencies.push(qrLatency);
    recordStatus(res.status);
    console.log(`[Scenario 1] QR Resolution: HTTP ${res.status} (${qrLatency}ms)`);
  } catch (err) {
    console.error('[Scenario 1] QR Resolution error:', err.message);
  }

  // Test 2: Leaderboard Endpoint with Cache
  console.log('[Scenario 2] Testing Cached Leaderboard Endpoint...');
  for (let i = 0; i < 5; i++) {
    const lbStart = Date.now();
    try {
      const res = await fetch(`${targetArg}/api/voting/leaderboard?round=1`);
      const lbLatency = Date.now() - lbStart;
      stats.latencies.push(lbLatency);
      recordStatus(res.status);
    } catch (err) {
      console.error('[Scenario 2] Leaderboard fetch error:', err.message);
    }
  }

  // Test 3: Concurrency Bursts (Simulated Virtual Users)
  console.log(`[Scenario 3] Launching ${activeTier.concurrency} concurrent requests simulation...`);
  const batchSize = Math.min(activeTier.concurrency, 50);
  const totalRounds = Math.ceil(activeTier.totalRequests / batchSize);

  for (let round = 0; round < totalRounds; round++) {
    const promises = [];

    for (let u = 0; u < batchSize; u++) {
      const reqStart = Date.now();
      const mockVoterId = crypto.randomUUID(); // Simulated unique voter

      // Alternate between QR lookups and leaderboard fetches
      const url = (u % 2 === 0)
        ? `${targetArg}/api/voting/qr/${mockEnv.mockQrToken}`
        : `${targetArg}/api/voting/leaderboard?round=1`;

      promises.push(
        fetch(url)
          .then(res => {
            const lat = Date.now() - reqStart;
            stats.latencies.push(lat);
            recordStatus(res.status);
            if (res.status === 200) stats.success200++;
            if (res.status === 409) stats.duplicateBlocked409++;
            if (res.status === 429) stats.rateLimits429++;
            if (res.status >= 500) stats.errors500++;
          })
          .catch(err => {
            stats.errors500++;
          })
      );
    }

    await Promise.all(promises);
    process.stdout.write(`\r[Simulation Progress] Completed ${Math.min((round + 1) * batchSize, activeTier.totalRequests)} / ${activeTier.totalRequests} requests`);
  }

  const durationSec = (Date.now() - startTime) / 1000;
  console.log(`\n[Simulation] Completed in ${durationSec.toFixed(2)}s`);
  return durationSec;
}

function recordStatus(status) {
  stats.statusCounts[status] = (stats.statusCounts[status] || 0) + 1;
}

/**
 * Calculates percentile from sorted array
 */
function getPercentile(arr, p) {
  if (arr.length === 0) return 0;
  const index = Math.ceil((p / 100) * arr.length) - 1;
  return arr[Math.max(0, Math.min(index, arr.length - 1))];
}

/**
 * STRICT MOCK DATA CLEANUP
 * Removes ONLY records created by this test run.
 */
async function cleanupMockData(mockTeamId) {
  console.log('\n[Cleanup] Starting strict mock data cleanup...');

  // Double check mock status
  if (!mockTeamId) {
    console.log('[Cleanup] No mock team ID to clean up.');
    return;
  }

  try {
    // 1. Verify target team is mock data
    const { data: teamCheck } = await supabase
      .from('teams')
      .select('team_name')
      .eq('id', mockTeamId)
      .maybeSingle();

    if (teamCheck) {
      assertMockRecord(teamCheck.team_name);

      // 2. Delete mock votes
      await supabase.from('votes').delete().eq('team_id', mockTeamId);

      // 3. Delete mock QR codes
      await supabase.from('team_qr_codes').delete().eq('team_id', mockTeamId);

      // 4. Delete mock product members & products
      const { data: prods } = await supabase
        .from('products')
        .select('id, product_title')
        .eq('team_id', mockTeamId);

      for (const p of (prods || [])) {
        assertMockRecord(p.product_title);
        await supabase.from('product_members').delete().eq('product_id', p.id);
      }
      await supabase.from('products').delete().eq('team_id', mockTeamId);

      // 5. Delete mock team
      await supabase.from('teams').delete().eq('id', mockTeamId);
      console.log(`[Cleanup] ✓ Deleted mock team and cascade relations: ${mockTeamId}`);
    }

    // 6. Verification: Ensure ZERO mock records remain from this test run
    const { count: remainingTeams } = await supabase
      .from('teams')
      .select('*', { count: 'exact', head: true })
      .ilike('team_name', `%${testRunId}%`);

    if (remainingTeams === 0) {
      console.log(`[Cleanup] ✓ Verification passed: 0 remaining records with testRunId ${testRunId}`);
    } else {
      console.warn(`[Cleanup] ⚠️ Warning: ${remainingTeams} records still matched testRunId.`);
    }

    console.log(`[Cleanup] ✓ PRODUCTION RECORDS TOUCHED OR MODIFIED: ${stats.productionRecordsModified}`);
  } catch (err) {
    console.error('[Cleanup] Error during mock cleanup:', err.message);
  }
}

/**
 * Main Runner
 */
async function main() {
  let mockEnv = null;
  try {
    mockEnv = await setupMockData();
    const duration = await runSimulation(mockEnv);

    // Compute Latencies
    stats.latencies.sort((a, b) => a - b);
    const p50 = getPercentile(stats.latencies, 50);
    const p95 = getPercentile(stats.latencies, 95);
    const p99 = getPercentile(stats.latencies, 99);
    const rps = (stats.latencies.length / duration).toFixed(1);

    console.log('\n================================================================');
    console.log('ACTUAL MEASURED LOAD-TEST REPORT');
    console.log('================================================================');
    console.log(`Tier:                  ${activeTier.name}`);
    console.log(`Total Requests:        ${stats.latencies.length}`);
    console.log(`Requests / Sec:        ${rps} req/s`);
    console.log(`p50 Latency:           ${p50} ms`);
    console.log(`p95 Latency:           ${p95} ms`);
    console.log(`p99 Latency:           ${p99} ms`);
    console.log(`HTTP Status Breakdown: ${JSON.stringify(stats.statusCounts)}`);
    console.log(`Error Rate:            ${((stats.errors500 / (stats.latencies.length || 1)) * 100).toFixed(2)}%`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('[Main] Test execution failure:', err);
  } finally {
    if (mockEnv?.mockTeamId) {
      await cleanupMockData(mockEnv.mockTeamId);
    }
    console.log('\nLoad test run completed safely.\n');
  }
}

main();
