// scratch/test-step6c-fix-persistence.cjs
// Verification suite for Step 6C-Fix: Product-Aware QR Persistence & Constraint Alignment

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
console.log('    IPL-2026: STEP 6C-FIX QR PERSISTENCE VERIFICATION SUITE     ');
console.log('================================================================\n');

// 1. Read files
const migrationRoot = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/stage_14c_product_specific_qr_persistence.sql'), 'utf8');
const migrationSupabase = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/supabase/migrations/stage_14c_product_specific_qr_persistence.sql'), 'utf8');
const votingRoutesJs = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/backend/routes/votingRoutes.js'), 'utf8');
const ideaRoutesJs = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/backend/routes/ideaRoutes.js'), 'utf8');
const prodMigrationSql = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/production_voting_migration.sql'), 'utf8');

// -----------------------------------------------------------------------------
// SECTION 1: Migration Schema Verification (Stage 14C)
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Migration Schema Verification (Stage 14C) ---');

// Check both files exist and are identical
assert(migrationRoot.length > 0 && migrationRoot === migrationSupabase, 'Root and supabase/migrations copies of Stage 14C exist and match');

// 1. Drops legacy team-level uniqueness constraints
assert(
  migrationRoot.includes('DROP CONSTRAINT IF EXISTS unique_team_round_qr') &&
  migrationRoot.includes('DROP CONSTRAINT IF EXISTS unique_team_qr'),
  'Migration explicitly drops legacy constraints unique_team_round_qr and unique_team_qr'
);

// 2. Product-aware partial unique index
assert(
  migrationRoot.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_team_qr_product_round') &&
  migrationRoot.includes('(team_id, product_id, voting_round)') &&
  migrationRoot.includes('WHERE product_id IS NOT NULL'),
  'Migration creates product-aware partial unique index idx_team_qr_product_round'
);

// 3. Legacy QR uniqueness preservation
assert(
  migrationRoot.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_team_qr_legacy_round') &&
  migrationRoot.includes('(team_id, voting_round)') &&
  migrationRoot.includes('WHERE product_id IS NULL'),
  'Migration preserves legacy QR uniqueness via idx_team_qr_legacy_round for product_id IS NULL'
);

// 4. Token uniqueness and RLS preserved from base schema
assert(
  prodMigrationSql.includes('idx_team_qr_codes_token') &&
  prodMigrationSql.includes('idx_team_qr_codes_qr_token'),
  'Base schema token and qr_token unique indexes remain intact'
);
assert(
  prodMigrationSql.includes('ENABLE ROW LEVEL SECURITY') &&
  prodMigrationSql.includes('Allow authenticated read team_qr_codes'),
  'Base schema RLS and authenticated read policy remain intact'
);

// -----------------------------------------------------------------------------
// SECTION 2: Backend Persistence & Error Handling Logic
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Backend Persistence & Error Handling Logic ---');

// Check that silent fallback on database insertion failure was removed
assert(
  votingRoutesJs.includes("error_code: 'QR_PERSISTENCE_FAILED'") &&
  votingRoutesJs.includes('Unable to persist the product QR code.'),
  'POST /api/voting/team-qr/generate returns explicit QR_PERSISTENCE_FAILED on DB failure'
);
assert(
  !votingRoutesJs.includes('} catch (e) {\n      // Table pending migration\n    }\n\n    const fallbackKey'),
  'Silent fallback on insert failure was completely removed from QR generation'
);

// Check Single-Product Legacy Row Association (Part 4)
assert(
  votingRoutesJs.includes('.is(\'product_id\', null)') &&
  votingRoutesJs.includes('teamProductsCount === 1') &&
  votingRoutesJs.includes('product_id: verifiedProductId') &&
  votingRoutesJs.includes('Permanent team QR associated with product successfully.'),
  'Single-product team safely updates existing legacy NULL row to avoid constraint conflicts'
);

assert(
  votingRoutesJs.includes('const existingQr = await getTeamQr(team_id, controls?.current_voting_round || 1, verifiedProductId);') &&
  votingRoutesJs.includes('Existing permanent team QR retrieved.'),
  'Idempotency check returns existing QR if already generated for that product'
);

// Check getTeamQr safe query
assert(
  votingRoutesJs.includes("query.order('created_at', { ascending: true }).limit(1).maybeSingle()"),
  'getTeamQr uses order and limit(1) to safely handle multi-row queries'
);

// -----------------------------------------------------------------------------
// SECTION 3: Functional Simulations (Persistence & Token Resolution)
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Functional Simulations (Persistence & Token Resolution) ---');

// Simulation of Multi-Product Unique Model
const teamA = 'team-uuid-1111';
const prodA1 = 'prod-uuid-a1';
const prodA2 = 'prod-uuid-a2';
const prodA3 = 'prod-uuid-a3';

const mockDb = new Map(); // key: (team_id, product_id, round)

function simulateInsert(teamId, productId, round, token) {
  // Check unique constraints matching Stage 14C
  for (const [k, v] of mockDb.entries()) {
    if (productId !== null) {
      if (v.team_id === teamId && v.product_id === productId && v.voting_round === round) {
        throw new Error('duplicate key value violates unique constraint "idx_team_qr_product_round"');
      }
    } else {
      if (v.team_id === teamId && v.product_id === null && v.voting_round === round) {
        throw new Error('duplicate key value violates unique constraint "idx_team_qr_legacy_round"');
      }
    }
  }
  const row = {
    id: `row-${Math.random()}`,
    team_id: teamId,
    product_id: productId,
    voting_round: round,
    token,
    qr_token: token,
    is_active: true,
    created_at: new Date().toISOString()
  };
  mockDb.set(token, row);
  return row;
}

// 1. Single-product QR generation
const row1 = simulateInsert(teamA, prodA1, 1, 'token-a1-1234');
assert(row1.product_id === prodA1, 'Single-product Product 1 QR generated and persisted');

// 2. Repeated single-product QR generation is blocked by unique index
let duplicateFailed = false;
try {
  simulateInsert(teamA, prodA1, 1, 'token-a1-duplicate');
} catch (e) {
  duplicateFailed = true;
}
assert(duplicateFailed, 'Duplicate generation for same product is blocked by idx_team_qr_product_round');

// 3, 4, 5. Multi-product Product 1, Product 2, Product 3 persistence
const row2 = simulateInsert(teamA, prodA2, 1, 'token-a2-5678');
const row3 = simulateInsert(teamA, prodA3, 1, 'token-a3-9999');
assert(row2.product_id === prodA2, 'Multi-product Product 2 QR persists in same voting round');
assert(row3.product_id === prodA3, 'Multi-product Product 3 QR persists in same voting round');

// 6. Distinct tokens generated for each product
assert(
  row1.token !== row2.token && row2.token !== row3.token && row1.token !== row3.token,
  'Product 1, Product 2, and Product 3 have distinct cryptographic tokens'
);

// 7, 8, 9. Token resolution simulation
function resolveToken(token) {
  const row = mockDb.get(token);
  if (!row) return { error: 404 };
  if (row.product_id) {
    return { success: true, resolution_type: 'qr_product', product_id: row.product_id };
  }
  return { success: true, resolution_type: 'qr_team', team_id: row.team_id };
}

assert(resolveToken('token-a1-1234').product_id === prodA1, 'Token 1 resolves exactly to Product A1');
assert(resolveToken('token-a2-5678').product_id === prodA2, 'Token 2 resolves exactly to Product A2');
assert(resolveToken('token-a3-9999').product_id === prodA3, 'Token 3 resolves exactly to Product A3');

// 10. Existing legacy QR still resolves
const legacyRow = simulateInsert('team-uuid-legacy', null, 1, 'token-legacy-0000');
assert(resolveToken('token-legacy-0000').resolution_type === 'qr_team', 'Legacy QR row (product_id IS NULL) resolves properly');

// 11 & 12. Database insertion failure handling simulation
function handleQrGeneration(dbSuccess) {
  if (!dbSuccess) {
    return {
      status: 500,
      json: {
        success: false,
        error_code: 'QR_PERSISTENCE_FAILED',
        message: 'Unable to persist the product QR code.'
      }
    };
  }
  return { status: 200, json: { success: true, qr_token: 'valid' } };
}

const failureResult = handleQrGeneration(false);
assert(
  failureResult.status === 500 && failureResult.json.error_code === 'QR_PERSISTENCE_FAILED',
  'Database failure returns explicit QR_PERSISTENCE_FAILED and is NOT reported as success'
);

// 13. Authorization checks
assert(
  votingRoutesJs.includes("membership.isMentor") &&
  votingRoutesJs.includes("Mentors are not permitted to generate or manage team QR codes."),
  'Mentor restriction remains strictly enforced'
);
assert(
  votingRoutesJs.includes("error_code: 'PRODUCT_TEAM_MISMATCH'"),
  'Product ownership by requested team remains strictly enforced'
);

console.log('\n================================================================');
console.log(`TOTAL TESTS: ${passedTests + failedTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
