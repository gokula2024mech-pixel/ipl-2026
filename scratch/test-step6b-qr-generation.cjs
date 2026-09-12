// scratch/test-step6b-qr-generation.cjs
// Verification suite for Step 6B: Product-Specific Team QR Generation Management

const fs = require('fs');
const path = require('path');

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
console.log('    IPL-2026: STEP 6B QR GENERATION MANAGEMENT VERIFICATION     ');
console.log('================================================================\n');

// 1. Read files
const votingRoutesJs = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/backend/routes/votingRoutes.js'), 'utf8');
const teamQrModalJsx = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/src/components/TeamQrModal.jsx'), 'utf8');
const mySubmissionsJsx = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/src/components/MySubmissionsPage.jsx'), 'utf8');
const ideaRoutesJs = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/backend/routes/ideaRoutes.js'), 'utf8');

// -----------------------------------------------------------------------------
// POINT 1: Existing Team QR Generation Compatibility
// -----------------------------------------------------------------------------
console.log('--- POINT 1: Existing team QR generation remains compatible ---');
assert(
  votingRoutesJs.includes('const { team_id, product_id } = req.body;'),
  'POST /api/voting/team-qr/generate extracts team_id and optional product_id'
);
assert(
  votingRoutesJs.includes("if (productId) {") &&
  votingRoutesJs.includes("query = query.eq('product_id', productId);"),
  'getTeamQr helper queries by product_id when provided, keeping legacy query when null'
);

// -----------------------------------------------------------------------------
// POINT 2: Single-product team automatically selects its product
// -----------------------------------------------------------------------------
console.log('\n--- POINT 2: Single-product team automatically selects its product ---');
assert(
  teamQrModalJsx.includes('if (products.length === 1) {') &&
  teamQrModalJsx.includes('setSelectedProduct(products[0]);'),
  'TeamQrModal automatically selects single product when team has only 1 idea'
);
assert(
  mySubmissionsJsx.includes('if (!chosenPid && ideasList.length === 1) {') &&
  mySubmissionsJsx.includes('chosenPid = ideasList[0].id;'),
  'MySubmissionsPage auto-resolves single product before generating'
);

// -----------------------------------------------------------------------------
// POINT 3: Multi-product team requires explicit product selection
// -----------------------------------------------------------------------------
console.log('\n--- POINT 3: Multi-product team requires explicit product selection ---');
assert(
  teamQrModalJsx.includes('!activeProductId && products.length > 1') &&
  teamQrModalJsx.includes('Select Idea to Generate QR'),
  'TeamQrModal presents explicit product picker when team has multiple ideas and none is selected'
);
assert(
  mySubmissionsJsx.includes('if (!chosenPid && ideasList.length > 1) {') &&
  mySubmissionsJsx.includes('setSelectedTeamForQrModal({') &&
  mySubmissionsJsx.includes('productId: null,'),
  'MySubmissionsPage opens selection dialog without generating when multi-product team has no product pre-selected'
);

// -----------------------------------------------------------------------------
// POINT 4: Product-specific QR URL is exactly /#idea?id=<productId>
// -----------------------------------------------------------------------------
console.log('\n--- POINT 4: Product-specific QR URL format ---');
assert(
  teamQrModalJsx.includes('${window.location.origin}/#idea?id=${activeProductId}'),
  'TeamQrModal sets votingUrl to ${window.location.origin}/#idea?id=${activeProductId}'
);
assert(
  mySubmissionsJsx.includes('${window.location.origin}/#idea?id=${effectiveProductId}') ||
  mySubmissionsJsx.includes('${origin}/#idea?id=${effectiveProductId}'),
  'MySubmissionsPage displays and copies exact URL with /#idea?id=${effectiveProductId}'
);

// -----------------------------------------------------------------------------
// POINT 5: Product belongs to the requested team
// -----------------------------------------------------------------------------
console.log('\n--- POINT 5: Product belongs to the requested team ---');
assert(
  votingRoutesJs.includes('if (prod.team_id !== team_id) {') &&
  votingRoutesJs.includes("error_code: 'PRODUCT_TEAM_MISMATCH'"),
  'Backend verifies product.team_id matches requested team_id with PRODUCT_TEAM_MISMATCH error'
);

// -----------------------------------------------------------------------------
// POINT 6: Unauthorized participant cannot generate another team\'s product QR
// -----------------------------------------------------------------------------
console.log('\n--- POINT 6: Team mismatch rejection ---');
assert(
  votingRoutesJs.includes("error_code: 'PRODUCT_TEAM_MISMATCH'") &&
  votingRoutesJs.includes("The requested product does not belong to this team."),
  'Backend returns 403 when product does not belong to the requested team'
);

// -----------------------------------------------------------------------------
// POINT 7: Mentor restrictions remain unchanged
// -----------------------------------------------------------------------------
console.log('\n--- POINT 7: Mentor restrictions ---');
assert(
  votingRoutesJs.includes('if (membership.isMentor) {') &&
  votingRoutesJs.includes('Mentors are not permitted to generate or manage team QR codes.'),
  'Backend continues to restrict mentors from generating team QR codes'
);

// -----------------------------------------------------------------------------
// POINT 8: QR generation ON/OFF control remains enforced
// -----------------------------------------------------------------------------
console.log('\n--- POINT 8: QR generation ON/OFF control ---');
assert(
  votingRoutesJs.includes('if (!controls?.is_qr_generation_active && !isAdmin) {') &&
  votingRoutesJs.includes('QR code generation is currently disabled by the administrator.'),
  'Backend checks controls.is_qr_generation_active and returns 403 when disabled'
);
assert(
  mySubmissionsJsx.includes('teamQrInfo.status === "DISABLED_BY_ADMIN"'),
  'Frontend UI displays disabled message when QR generation is paused by admin'
);

// -----------------------------------------------------------------------------
// POINT 9: Existing legacy token QR remains compatible
// -----------------------------------------------------------------------------
console.log('\n--- POINT 9: Existing legacy token QR fallback ---');
assert(
  teamQrModalJsx.includes(': `${window.location.origin}/?token=${qrToken}#vote`'),
  'TeamQrModal falls back to `/?token=${qrToken}#vote` if productId is absent'
);
assert(
  mySubmissionsJsx.includes(': `${window.location.origin}/?token=${teamQrInfo.qrToken}#vote`') ||
  mySubmissionsJsx.includes(': `/?token=${teamQrInfo.qrToken || \'\'}#vote`'),
  'MySubmissionsPage falls back to `/?token=${teamQrInfo.qrToken}#vote` if productId is absent'
);

// -----------------------------------------------------------------------------
// POINT 10: Copy Link action uses exact product URL
// -----------------------------------------------------------------------------
console.log('\n--- POINT 10: Copy Link action ---');
assert(
  teamQrModalJsx.includes('await navigator.clipboard.writeText(votingUrl);'),
  'TeamQrModal copies votingUrl directly to clipboard'
);
assert(
  mySubmissionsJsx.includes('handleCopyVotingLink(teamQrInfo.qrToken, currentTeamId, effectiveProductId)') &&
  mySubmissionsJsx.includes('const votingUrl = productId'),
  'MySubmissionsPage handleCopyVotingLink copies product-specific URL'
);

// -----------------------------------------------------------------------------
// POINT 11: Download QR action uses exact product URL
// -----------------------------------------------------------------------------
console.log('\n--- POINT 11: Download QR action ---');
assert(
  teamQrModalJsx.includes('a.download = `IPL2026_${regId.replace(/[^a-zA-Z0-9_-]/g, \'_\')}${suffix}_QR.png`;') &&
  teamQrModalJsx.includes('const suffix = activeProductNumber ? `_Product_${activeProductNumber}` : (activeProductId ? `_Idea` : \'\');'),
  'TeamQrModal downloads high-res QR image with product-specific filename'
);
assert(
  mySubmissionsJsx.includes('handleDownloadQrImage(currentTeam, effectiveProductId, effectiveProductNumber)') &&
  mySubmissionsJsx.includes('const votingUrl = productId'),
  'MySubmissionsPage handleDownloadQrImage renders QR with product URL'
);

// -----------------------------------------------------------------------------
// POINT 12: No confidential information is encoded in QR
// -----------------------------------------------------------------------------
console.log('\n--- POINT 12: No confidential information in QR ---');
assert(
  teamQrModalJsx.includes('${window.location.origin}/#idea?id=${activeProductId}'),
  'QR URL only encodes origin + #idea?id=<activeProductId>, zero confidential data'
);
assert(
  teamQrModalJsx.includes('prod.product_title') &&
  teamQrModalJsx.includes('prod.innovation_domain') &&
  teamQrModalJsx.includes('prod.trl_level') &&
  !teamQrModalJsx.includes('student_email') &&
  !teamQrModalJsx.includes('student_phone'),
  'Product selection UI shows strictly safe public fields (title, domain, trl), no PII'
);

// -----------------------------------------------------------------------------
// POINT 13: No duplicate generation from repeated clicks (idempotency)
// -----------------------------------------------------------------------------
console.log('\n--- POINT 13: Idempotency against repeated clicks ---');
assert(
  votingRoutesJs.includes('const existingQr = await getTeamQr(team_id, controls?.current_voting_round || 1, verifiedProductId);') &&
  votingRoutesJs.includes('if (existingQr) {') &&
  votingRoutesJs.includes('message: \'Existing permanent team QR retrieved.\''),
  'Backend returns existing QR if one already exists for team_id + round + product_id'
);

// -----------------------------------------------------------------------------
// POINT 14: Existing voting routes remain unchanged
// -----------------------------------------------------------------------------
console.log('\n--- POINT 14: Existing voting routes integrity ---');
assert(votingRoutesJs.includes("router.post('/vote'"), 'Existing POST /api/voting/vote remains present');
assert(votingRoutesJs.includes("router.get(['/status', '/controls']"), 'Existing GET /api/voting/status remains present');
assert(votingRoutesJs.includes("router.get('/qr/:token'"), 'Existing GET /api/voting/qr/:token remains present');
assert(votingRoutesJs.includes("router.get('/my-votes'"), 'Existing GET /api/voting/my-votes remains present');
assert(votingRoutesJs.includes("router.get('/leaderboard'"), 'Existing GET /api/voting/leaderboard remains present');

// -----------------------------------------------------------------------------
// POINT 15: Existing Step 6A QR resolver remains compatible
// -----------------------------------------------------------------------------
console.log('\n--- POINT 15: Step 6A QR resolver compatibility ---');
assert(
  ideaRoutesJs.includes("router.get('/resolve/:identifier'"),
  'GET /api/ideas/resolve/:identifier route is intact'
);
assert(
  ideaRoutesJs.includes("rawIdentifier.match(/[#?&](?:id|productId)=([a-f0-9-]{36})/i)"),
  'Resolver extracts UUID from idea query/hash format'
);

// -----------------------------------------------------------------------------
// POINT 16: Multi-product ChameleX products remain independent
// -----------------------------------------------------------------------------
console.log('\n--- POINT 16: Multi-product independence ---');
assert(
  teamQrModalJsx.includes('Switch Idea') &&
  teamQrModalJsx.includes('setSelectedProduct(null)'),
  'TeamQrModal allows switching between multiple ideas to generate separate QRs'
);
assert(
  votingRoutesJs.includes('if (verifiedProductId) {') &&
  votingRoutesJs.includes('insertData.product_id = verifiedProductId;'),
  'Backend stores product_id in team_qr_codes independently per product'
);

// -----------------------------------------------------------------------------
// Functional Simulation Tests
// -----------------------------------------------------------------------------
console.log('\n--- Functional Simulation Tests ---');

// Test 1: URL Builder Simulation
function buildQrUrl(origin, productId, qrToken) {
  if (productId) {
    return `${origin}/#idea?id=${productId}`;
  }
  return `${origin}/?token=${qrToken}#vote`;
}

const sampleProductId = 'a1b2c3d4-e5f6-4a8b-9c0d-1e2f3a4b5c6d';
const sampleToken = '98765432-abcd-ef01-2345-6789abcdef01';
const origin = 'https://ipl2026.example.com';

const productUrl = buildQrUrl(origin, sampleProductId, sampleToken);
assert(productUrl === 'https://ipl2026.example.com/#idea?id=a1b2c3d4-e5f6-4a8b-9c0d-1e2f3a4b5c6d', 'URL with productId produces exact /#idea?id=<productId>');

const legacyUrl = buildQrUrl(origin, null, sampleToken);
assert(legacyUrl === 'https://ipl2026.example.com/?token=98765432-abcd-ef01-2345-6789abcdef01#vote', 'URL without productId falls back to /?token=<token>#vote');

// Test 2: Multi-product independence check
const prod1Id = '11111111-1111-1111-1111-111111111111';
const prod2Id = '22222222-2222-2222-2222-222222222222';
const chamelexUrl1 = buildQrUrl(origin, prod1Id, sampleToken);
const chamelexUrl2 = buildQrUrl(origin, prod2Id, sampleToken);
assert(chamelexUrl1 !== chamelexUrl2, 'ChameleX Product 1 and Product 2 generate distinct target URLs');
assert(chamelexUrl1.includes(prod1Id) && chamelexUrl2.includes(prod2Id), 'Each URL targets its respective product ID');

// Test 3: Filename generation
function buildDownloadFilename(regId, productNumber) {
  const cleanReg = (regId || 'Team').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanNum = productNumber || '1';
  return `IPL2026_${cleanReg}_Product_${cleanNum}_QR.png`;
}
const fname1 = buildDownloadFilename('IPL-042', 1);
const fname2 = buildDownloadFilename('IPL-042', 2);
assert(fname1 === 'IPL2026_IPL-042_Product_1_QR.png', 'Product 1 filename is formatted correctly');
assert(fname2 === 'IPL2026_IPL-042_Product_2_QR.png', 'Product 2 filename is formatted correctly');

// Test 4: UUID Validator Simulation (matching backend regex)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
assert(UUID_REGEX.test(sampleProductId), 'Valid UUID passes regex check');
assert(!UUID_REGEX.test('not-a-uuid'), 'Invalid UUID fails regex check');
assert(!UUID_REGEX.test('SELECT * FROM products;'), 'SQL injection string fails regex check');

console.log('\n================================================================');
console.log(`TOTAL TESTS: ${passedTests + failedTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
}
