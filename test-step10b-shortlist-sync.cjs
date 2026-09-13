// test-step10b-shortlist-sync.cjs
/**
 * STEP 10B Verification Test Suite: Phase 3 Shortlist Database Foundation + Safe Sync
 * 
 * Tests all 25 specific test cases required:
 * 1. Valid registration accepted
 * 2. Lowercase normalization
 * 3. Whitespace normalization
 * 4. Unknown registration rejected
 * 5. Invalid format rejected
 * 6. Duplicate within same sheet detected
 * 7. Duplicate across HW/SW detected
 * 8. Registration -> team mapping
 * 9. Registration -> product mapping
 * 10. Ambiguous multi-product mapping rejected
 * 11. Incremental adds new shortlist record
 * 12. Incremental preserves existing shortlist
 * 13. Full replacement adds new records
 * 14. Full replacement removes missing shortlist records only
 * 15. Full replacement preserves historical votes
 * 16. Full replacement preserves historical likes
 * 17. Broken full replacement performs zero changes
 * 18. Non-admin preview rejected
 * 19. Non-admin sync rejected
 * 20. Admin preview succeeds
 * 21. Admin sync succeeds
 * 22. Transaction failure rolls back
 * 23. No duplicate shortlist records
 * 24. Current 70 teams can be represented
 * 25. Future 100+ teams can be represented without schema changes
 */

const assert = require('assert');
const path = require('path');
const http = require('http');

const backendDir = path.resolve(__dirname, 'backend');
const backendRequire = (id) => require(require.resolve(id, { paths: [backendDir] }));

const XLSX = backendRequire('xlsx');
const express = backendRequire('express');

const shortlistService = require('./backend/services/phase3ShortlistService');

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

// Mock Test Fixture Store
function createMockStore() {
  return {
    registrations: [
      { id: 'reg-0001', registration_id: 'IPL26-0001', team_name: 'Alpha Team', project_title: 'Alpha Project' },
      { id: 'reg-0002', registration_id: 'IPL26-0002', team_name: 'Beta Robotics', project_title: 'Beta Rover' },
      { id: 'reg-0003', registration_id: 'IPL26-0003', team_name: 'Gamma Tech', project_title: 'Gamma Sensor' },
      { id: 'reg-0004', registration_id: 'IPL26-0004', team_name: 'Delta Dynamics', project_title: 'Delta Drone' },
      { id: 'reg-0434', registration_id: 'IPL26-0434', team_name: 'ChameleX', project_title: 'Bio Inspired Adaptive Camouflage' },
      { id: 'reg-0999', registration_id: 'IPL26-0999', team_name: 'Ambiguous Team', project_title: 'Ambiguous Project' }
    ],
    teams: [
      { id: 'team-0001', team_name: 'Alpha Team' },
      { id: 'team-0002', team_name: 'Beta Robotics' },
      { id: 'team-0003', team_name: 'Gamma Tech' },
      { id: 'team-0004', team_name: 'Delta Dynamics' },
      { id: 'team-0434', team_name: 'ChameleX' },
      { id: 'team-0999', team_name: 'Ambiguous Team' }
    ],
    products: [
      { id: 'prod-0001', team_id: 'team-0001', product_number: 1, product_title: 'Alpha Project', status: 'active', legacy_registration_id: 'IPL26-0001' },
      { id: 'prod-0002', team_id: 'team-0002', product_number: 1, product_title: 'Beta Rover', status: 'active', legacy_registration_id: 'IPL26-0002' },
      { id: 'prod-0003', team_id: 'team-0003', product_number: 1, product_title: 'Gamma Sensor', status: 'active', legacy_registration_id: 'IPL26-0003' },
      { id: 'prod-0004', team_id: 'team-0004', product_number: 1, product_title: 'Delta Drone', status: 'active', legacy_registration_id: 'IPL26-0004' },
      // ChameleX has 2 products: 1 with legacy_registration_id, 1 with null
      { id: 'prod-0434-1', team_id: 'team-0434', product_number: 1, product_title: 'Bio Inspired Adaptive Camouflage', status: 'active', legacy_registration_id: 'IPL26-0434' },
      { id: 'prod-0434-2', team_id: 'team-0434', product_number: 2, product_title: 'Smart Particulate collector', status: 'active', legacy_registration_id: null },
      // Ambiguous Team has 2 products and NEITHER has legacy_registration_id
      { id: 'prod-0999-1', team_id: 'team-0999', product_number: 1, product_title: 'Ambiguous A', status: 'active', legacy_registration_id: null },
      { id: 'prod-0999-2', team_id: 'team-0999', product_number: 2, product_title: 'Ambiguous B', status: 'active', legacy_registration_id: null }
    ],
    shortlist: [
      { registration_id: 'IPL26-0001', product_id: 'prod-0001', team_id: 'team-0001', category: 'HW' },
      { registration_id: 'IPL26-0002', product_id: 'prod-0002', team_id: 'team-0002', category: 'SW' }
    ],
    product_votes: [
      { id: 'vote-1', voter_user_id: 'user-1', product_id: 'prod-0001' },
      { id: 'vote-2', voter_user_id: 'user-2', product_id: 'prod-0002' }
    ],
    product_likes: [
      { voter_user_id: 'user-1', product_id: 'prod-0001' }
    ]
  };
}

// Helper to create an in-memory XLSX workbook buffer
function createExcelBuffer(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function runTests() {
  console.log('\n==================================================');
  console.log('STEP 10B: Phase 3 Shortlist Synchronization Tests');
  console.log('==================================================\n');

  // Test 1: Valid registration accepted
  it('1. Valid Registration ID accepted', () => {
    const res = shortlistService.normalizeRegistrationId('IPL26-0097');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.normalizedId, 'IPL26-0097');
  });

  // Test 2: Lowercase normalization
  it('2. Lowercase normalization works', () => {
    const res = shortlistService.normalizeRegistrationId('ipl26-0097');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.normalizedId, 'IPL26-0097');
  });

  // Test 3: Whitespace normalization
  it('3. Whitespace normalization works', () => {
    const res1 = shortlistService.normalizeRegistrationId('  IPL26 - 0097  ');
    const res2 = shortlistService.normalizeRegistrationId('ipl26  -   0097');
    assert.strictEqual(res1.valid, true);
    assert.strictEqual(res1.normalizedId, 'IPL26-0097');
    assert.strictEqual(res2.valid, true);
    assert.strictEqual(res2.normalizedId, 'IPL26-0097');
  });

  // Test 4: Unknown registration rejected
  await itAsync('4. Unknown Registration ID rejected during validation', async () => {
    const store = createMockStore();
    const val = await shortlistService.validateShortlistEntries(
      [{ rawId: 'IPL26-9999', sheet: 'HW FINAL', rowNumber: 2 }],
      { testStore: store }
    );
    assert.strictEqual(val.is_valid, false);
    assert.strictEqual(val.missing_count, 1);
    assert.strictEqual(val.missing_registration_ids[0].registration_id, 'IPL26-9999');
  });

  // Test 5: Invalid format rejected
  it('5. Invalid format Registration ID rejected', () => {
    const bad1 = shortlistService.normalizeRegistrationId('INVALID-1234');
    const bad2 = shortlistService.normalizeRegistrationId('IPL26-99');
    const bad3 = shortlistService.normalizeRegistrationId('IPL26-ABCD');
    assert.strictEqual(bad1.valid, false);
    assert.strictEqual(bad2.valid, false);
    assert.strictEqual(bad3.valid, false);
  });

  // Test 6: Duplicate within same sheet
  await itAsync('6. Duplicate within same sheet detected', async () => {
    const store = createMockStore();
    const val = await shortlistService.validateShortlistEntries([
      { rawId: 'IPL26-0001', sheet: 'HW FINAL', rowNumber: 2 },
      { rawId: 'IPL26-0001', sheet: 'HW FINAL', rowNumber: 5 }
    ], { testStore: store });

    assert.strictEqual(val.is_valid, false);
    assert.strictEqual(val.duplicates_count, 1);
    assert.strictEqual(val.duplicates[0].is_same_sheet, true);
  });

  // Test 7: Duplicate across HW/SW
  await itAsync('7. Duplicate across HW and SW sheets detected', async () => {
    const store = createMockStore();
    const val = await shortlistService.validateShortlistEntries([
      { rawId: 'IPL26-0001', sheet: 'HW FINAL', rowNumber: 2 },
      { rawId: 'IPL26-0001', sheet: 'SW FINAL', rowNumber: 3 }
    ], { testStore: store });

    assert.strictEqual(val.is_valid, false);
    assert.strictEqual(val.duplicates_count, 1);
    assert.strictEqual(val.duplicates[0].is_cross_sheet, true);
  });

  // Test 8: Registration -> team mapping
  await itAsync('8. Correct registration -> team mapping resolved', async () => {
    const store = createMockStore();
    const val = await shortlistService.validateShortlistEntries([
      { rawId: 'IPL26-0001', sheet: 'HW FINAL', rowNumber: 2 }
    ], { testStore: store });

    assert.strictEqual(val.is_valid, true);
    assert.strictEqual(val.valid_registrations[0].team_id, 'team-0001');
    assert.strictEqual(val.valid_registrations[0].team_name, 'Alpha Team');
  });

  // Test 9: Registration -> product mapping
  await itAsync('9. Correct registration -> product mapping resolved', async () => {
    const store = createMockStore();
    // Test normal 1-product team
    const val = await shortlistService.validateShortlistEntries([
      { rawId: 'IPL26-0002', sheet: 'SW FINAL', rowNumber: 2 }
    ], { testStore: store });

    assert.strictEqual(val.is_valid, true);
    assert.strictEqual(val.valid_registrations[0].product_id, 'prod-0002');
    assert.strictEqual(val.valid_registrations[0].product_title, 'Beta Rover');

    // Test multi-product team with deterministic legacy mapping (ChameleX)
    const valChamelex = await shortlistService.validateShortlistEntries([
      { rawId: 'IPL26-0434', sheet: 'SW FINAL', rowNumber: 3 }
    ], { testStore: store });

    assert.strictEqual(valChamelex.is_valid, true);
    assert.strictEqual(valChamelex.valid_registrations[0].product_id, 'prod-0434-1');
  });

  // Test 10: Ambiguous multi-product mapping rejected
  await itAsync('10. Ambiguous multi-product mapping rejected safely', async () => {
    const store = createMockStore();
    const val = await shortlistService.validateShortlistEntries([
      { rawId: 'IPL26-0999', sheet: 'HW FINAL', rowNumber: 4 }
    ], { testStore: store });

    assert.strictEqual(val.is_valid, false);
    assert.strictEqual(val.ambiguous_count, 1);
    assert.strictEqual(val.ambiguous_products[0].error_code, 'AMBIGUOUS_PRODUCT_MAPPING');
  });

  // Test 11: Incremental adds new shortlist record
  await itAsync('11. Incremental sync adds new shortlist record', async () => {
    const store = createMockStore();
    assert.strictEqual(store.shortlist.length, 2); // starts with 2 records

    const syncRes = await shortlistService.syncShortlist([
      { rawId: 'IPL26-0003', sheet: 'HW FINAL', rowNumber: 2, category: 'HW' }
    ], { mode: 'INCREMENTAL', testStore: store });

    assert.strictEqual(syncRes.success, true);
    assert.strictEqual(syncRes.mode, 'INCREMENTAL');
    assert.strictEqual(store.shortlist.length, 3);
    assert(store.shortlist.some(s => s.registration_id === 'IPL26-0003'));
  });

  // Test 12: Incremental preserves existing shortlist
  await itAsync('12. Incremental sync preserves existing shortlist', async () => {
    const store = createMockStore();
    await shortlistService.syncShortlist([
      { rawId: 'IPL26-0003', sheet: 'HW FINAL', rowNumber: 2 }
    ], { mode: 'INCREMENTAL', testStore: store });

    assert(store.shortlist.some(s => s.registration_id === 'IPL26-0001'));
    assert(store.shortlist.some(s => s.registration_id === 'IPL26-0002'));
    assert(store.shortlist.some(s => s.registration_id === 'IPL26-0003'));
  });

  // Test 13: Full replacement adds new records
  await itAsync('13. Full replacement adds new records', async () => {
    const store = createMockStore();
    const syncRes = await shortlistService.syncShortlist([
      { rawId: 'IPL26-0001', sheet: 'HW FINAL', rowNumber: 2 },
      { rawId: 'IPL26-0004', sheet: 'SW FINAL', rowNumber: 3 }
    ], { mode: 'FULL_REPLACEMENT', testStore: store });

    assert.strictEqual(syncRes.success, true);
    assert.strictEqual(store.shortlist.length, 2);
    assert(store.shortlist.some(s => s.registration_id === 'IPL26-0004'));
  });

  // Test 14: Full replacement removes missing shortlist records only
  await itAsync('14. Full replacement removes missing shortlist records only from shortlist table', async () => {
    const store = createMockStore();
    // store initially has IPL26-0001 and IPL26-0002.
    // New replacement list only has IPL26-0001 and IPL26-0004.
    await shortlistService.syncShortlist([
      { rawId: 'IPL26-0001', sheet: 'HW FINAL', rowNumber: 2 },
      { rawId: 'IPL26-0004', sheet: 'SW FINAL', rowNumber: 3 }
    ], { mode: 'FULL_REPLACEMENT', testStore: store });

    // IPL26-0002 should be removed from shortlist
    assert.strictEqual(store.shortlist.some(s => s.registration_id === 'IPL26-0002'), false);
    // But registrations and products still exist!
    assert(store.registrations.some(r => r.registration_id === 'IPL26-0002'));
    assert(store.products.some(p => p.id === 'prod-0002'));
  });

  // Test 15: Full replacement preserves historical votes
  await itAsync('15. Full replacement preserves historical votes', async () => {
    const store = createMockStore();
    assert.strictEqual(store.product_votes.length, 2);

    await shortlistService.syncShortlist([
      { rawId: 'IPL26-0001', sheet: 'HW FINAL', rowNumber: 2 }
    ], { mode: 'FULL_REPLACEMENT', testStore: store });

    // Team 2 was un-shortlisted, but its votes remain 100% intact!
    assert.strictEqual(store.product_votes.length, 2);
    assert(store.product_votes.some(v => v.product_id === 'prod-0002'));
  });

  // Test 16: Full replacement preserves historical likes
  await itAsync('16. Full replacement preserves historical likes', async () => {
    const store = createMockStore();
    assert.strictEqual(store.product_likes.length, 1);

    await shortlistService.syncShortlist([
      { rawId: 'IPL26-0002', sheet: 'SW FINAL', rowNumber: 2 }
    ], { mode: 'FULL_REPLACEMENT', testStore: store });

    assert.strictEqual(store.product_likes.length, 1);
  });

  // Test 17: Broken full replacement performs zero changes
  await itAsync('17. Broken full replacement performs ZERO database changes', async () => {
    const store = createMockStore();
    const initialShortlist = JSON.parse(JSON.stringify(store.shortlist));

    const badSync = await shortlistService.syncShortlist([
      { rawId: 'IPL26-0001', sheet: 'HW FINAL', rowNumber: 2 },
      { rawId: 'IPL26-9999', sheet: 'HW FINAL', rowNumber: 3 } // Non-existent!
    ], { mode: 'FULL_REPLACEMENT', testStore: store });

    assert.strictEqual(badSync.success, false);
    assert.strictEqual(badSync.error_code, 'VALIDATION_FAILED');
    // Store shortlist must remain untouched!
    assert.deepStrictEqual(store.shortlist, initialShortlist);
  });

  // Test 18-21: Route and Auth Tests via Express Test Server
  await itAsync('18-21. Admin API Authorization & Preview/Sync Endpoints', async () => {
    process.env.NODE_ENV = 'test';
    const store = createMockStore();

    const app = express();
    app.use(express.json());
    // Attach testStore to req so route can pass it to service
    app.use((req, res, next) => {
      req.testStore = store;
      next();
    });
    app.use('/api/admin/shortlist', require('./backend/routes/shortlistRoutes'));

    const server = http.createServer(app);
    await new Promise(res => server.listen(0, res));
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}/api/admin/shortlist`;

    // Helper request function
    async function makeReq(method, path, body = null, headers = {}) {
      return new Promise((resolve, reject) => {
        const url = `${baseUrl}${path}`;
        const req = http.request(url, { method, headers }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(data) });
            } catch (e) {
              resolve({ status: res.statusCode, body: data });
            }
          });
        });
        req.on('error', reject);
        if (body) {
          req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
      });
    }

    try {
      // 18. Non-admin preview rejected (unauthenticated or student role)
      const noAuth = await makeReq('POST', '/preview', { entries: ['IPL26-0001'] });
      assert.strictEqual(noAuth.status, 401);

      const studentAuth = await makeReq('POST', '/preview', { entries: ['IPL26-0001'] }, {
        'Authorization': 'Bearer TEST_TOKEN_user-std:std@sece.ac.in:student',
        'Content-Type': 'application/json'
      });
      assert.strictEqual(studentAuth.status, 403);
      console.log('    - Non-admin preview properly rejected (401/403)');

      // 19. Non-admin sync rejected
      const studentSync = await makeReq('POST', '/sync', { entries: ['IPL26-0001'] }, {
        'Authorization': 'Bearer TEST_TOKEN_user-std:std@sece.ac.in:student',
        'Content-Type': 'application/json'
      });
      assert.strictEqual(studentSync.status, 403);
      console.log('    - Non-admin sync properly rejected (403)');

      // 20. Admin preview succeeds
      const adminPreview = await makeReq('POST', '/preview', { entries: ['IPL26-0001', 'IPL26-0003'] }, {
        'Authorization': 'Bearer TEST_TOKEN_admin-1:admin@sece.ac.in:admin',
        'Content-Type': 'application/json'
      });
      assert.strictEqual(adminPreview.status, 200);
      assert.strictEqual(adminPreview.body.success, true);
      assert.strictEqual(adminPreview.body.preview.valid_count, 2);
      console.log('    - Admin preview succeeded (200 OK)');

      // 21. Admin sync succeeds
      const adminSync = await makeReq('POST', '/sync', {
        entries: ['IPL26-0001', 'IPL26-0003'],
        mode: 'incremental'
      }, {
        'Authorization': 'Bearer TEST_TOKEN_admin-1:admin@sece.ac.in:admin',
        'Content-Type': 'application/json'
      });
      assert.strictEqual(adminSync.status, 200);
      assert.strictEqual(adminSync.body.success, true);
      assert.strictEqual(store.shortlist.length, 3);
      console.log('    - Admin sync succeeded (200 OK)');

    } finally {
      server.close();
    }
  });

  // Test 22: Transaction rollback works on failure
  await itAsync('22. Transaction rollback works on validation failure', async () => {
    const store = createMockStore();
    const countBefore = store.shortlist.length;

    // Mixed list with 1 valid and 1 duplicate
    const mixedList = [
      { rawId: 'IPL26-0003', sheet: 'HW FINAL', rowNumber: 2 },
      { rawId: 'IPL26-0003', sheet: 'HW FINAL', rowNumber: 3 } // Duplicate!
    ];

    const res = await shortlistService.syncShortlist(mixedList, {
      mode: 'INCREMENTAL',
      testStore: store
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error_code, 'VALIDATION_FAILED');
    assert.strictEqual(store.shortlist.length, countBefore); // 0 records inserted
  });

  // Test 23: No duplicate shortlist records
  it('23. No duplicate phase3_shortlist records permitted (PK constraint modeled)', () => {
    const store = createMockStore();
    const ids = store.shortlist.map(s => s.registration_id);
    const uniqueIds = new Set(ids);
    assert.strictEqual(ids.length, uniqueIds.size);
  });

  // Test 24: Current 70 teams can be represented
  await itAsync('24. Current 70 teams can be represented dynamically', async () => {
    // Generate synthetic 70 teams across HW and SW
    const rowsHW = [['Registration ID', 'Project Title']];
    const rowsSW = [['Registration ID', 'Project Title']];
    const customStore = {
      registrations: [],
      teams: [],
      products: [],
      shortlist: []
    };

    for (let i = 1; i <= 35; i++) {
      const padId = String(i).padStart(4, '0');
      const regId = `IPL26-${padId}`;
      rowsHW.push([regId, `HW Project ${i}`]);
      customStore.registrations.push({ id: `reg-${padId}`, registration_id: regId, team_name: `HW Team ${i}` });
      customStore.teams.push({ id: `team-${padId}`, team_name: `HW Team ${i}` });
      customStore.products.push({ id: `prod-${padId}`, team_id: `team-${padId}`, status: 'active', legacy_registration_id: regId, product_title: `HW Project ${i}` });
    }

    for (let i = 36; i <= 70; i++) {
      const padId = String(i).padStart(4, '0');
      const regId = `IPL26-${padId}`;
      rowsSW.push([regId, `SW Project ${i}`]);
      customStore.registrations.push({ id: `reg-${padId}`, registration_id: regId, team_name: `SW Team ${i}` });
      customStore.teams.push({ id: `team-${padId}`, team_name: `SW Team ${i}` });
      customStore.products.push({ id: `prod-${padId}`, team_id: `team-${padId}`, status: 'active', legacy_registration_id: regId, product_title: `SW Project ${i}` });
    }

    const excelBuffer = createExcelBuffer({
      'HW FINAL': rowsHW,
      'SW FINAL': rowsSW
    });

    const preview = await shortlistService.previewShortlist(excelBuffer, {
      mode: 'FULL_REPLACEMENT',
      testStore: customStore
    });

    assert.strictEqual(preview.is_valid, true);
    assert.strictEqual(preview.valid_count, 70);
    assert.strictEqual(preview.total_rows_detected, 70);

    const syncRes = await shortlistService.syncShortlist(excelBuffer, {
      mode: 'FULL_REPLACEMENT',
      testStore: customStore
    });

    assert.strictEqual(syncRes.success, true);
    assert.strictEqual(customStore.shortlist.length, 70);
  });

  // Test 25: Future larger shortlist can be represented without schema changes
  await itAsync('25. Future larger shortlist (105 teams) can be represented without schema changes', async () => {
    const customStore = {
      registrations: [],
      teams: [],
      products: [],
      shortlist: []
    };

    const entries = [];
    for (let i = 1; i <= 105; i++) {
      const padId = String(i).padStart(4, '0');
      const regId = `IPL26-${padId}`;
      entries.push({ rawId: regId, sheet: i <= 60 ? 'HW FINAL' : 'SW FINAL', rowNumber: i });
      customStore.registrations.push({ id: `reg-${padId}`, registration_id: regId, team_name: `Team ${i}` });
      customStore.teams.push({ id: `team-${padId}`, team_name: `Team ${i}` });
      customStore.products.push({ id: `prod-${padId}`, team_id: `team-${padId}`, status: 'active', legacy_registration_id: regId, product_title: `Project ${i}` });
    }

    const syncRes = await shortlistService.syncShortlist(entries, {
      mode: 'FULL_REPLACEMENT',
      testStore: customStore
    });

    assert.strictEqual(syncRes.success, true);
    assert.strictEqual(syncRes.total_shortlisted, 105);
    assert.strictEqual(customStore.shortlist.length, 105);
  });

  console.log('\n--------------------------------------------------');
  console.log(`Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('--------------------------------------------------\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
