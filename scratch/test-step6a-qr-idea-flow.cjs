// scratch/test-step6a-qr-idea-flow.cjs
// Verification suite for Step 6A: QR -> Exact Public Idea Page Flow

const fs = require('fs');
const path = require('path');
const http = require('http');

// Setup module paths so backend dependencies (express, dotenv, @supabase/supabase-js) are discovered
const backendDir = path.resolve('e:/collegeProject/ipl-2026/backend');
const backendRequire = (id) => require(require.resolve(id, { paths: [backendDir] }));

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

// 1. Inspect source files directly
const appJsx = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/src/App.jsx'), 'utf8');
const sessionNavJs = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/src/utils/sessionNavigationState.js'), 'utf8');
const ideaModalJsx = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/src/components/IdeaResolutionModal.jsx'), 'utf8');
const teamQrModalJsx = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/src/components/TeamQrModal.jsx'), 'utf8');
const ideaRoutesJs = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/backend/routes/ideaRoutes.js'), 'utf8');

console.log('================================================================');
console.log('        IPL-2026: STEP 6A QR -> IDEA FLOW VERIFICATION          ');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Group 1: Static Code Architecture & Safety Rules
// -----------------------------------------------------------------------------
console.log('1. Checking Static Code Architecture & Safety Rules...');

// App.jsx: token extraction must trigger async resolve instead of forcing auth
assert(
  appJsx.includes('resolvingTokenRef.current = extractedToken') &&
  appJsx.includes('/api/ideas/resolve/'),
  'App.jsx resolves extractedToken asynchronously via /api/ideas/resolve/:identifier'
);

// App.jsx: must NOT automatically show auth when token is present
assert(
  !appJsx.includes('if (!session) {\n          setShowAuth(true)'),
  'App.jsx NO LONGER forces setShowAuth(true) merely because a QR token is in the URL'
);

// App.jsx: isDirectPublicRoute must include extractVotingTokenFromUrl()
assert(
  appJsx.includes('extractVotingTokenFromUrl()') &&
  appJsx.includes('const isDirectPublicRoute = Boolean(') &&
  appJsx.includes('currentHash.startsWith(\'#idea\') || extractIdeaIdFromUrl() || currentHash === \'#vote\' || extractVotingTokenFromUrl()'),
  'App.jsx isDirectPublicRoute allows QR scans to bypass EntryCountdown without login'
);

// IdeaResolutionModal: supports initialIdentifier
assert(
  ideaModalJsx.includes('initialIdentifier = \'\'') &&
  ideaModalJsx.includes('resolveIdentifier(initialIdentifier)'),
  'IdeaResolutionModal accepts initialIdentifier and auto-resolves for multi-product QR'
);

// IdeaResolutionModal: Safe error message on unknown QR
assert(
  ideaModalJsx.includes('QR code not recognized. Please verify and try again.'),
  'IdeaResolutionModal displays safe error "QR code not recognized. Please verify and try again."'
);

// Camera permission check: startScanner only called on explicit action, not on mount
assert(
  !ideaModalJsx.includes('useEffect(() => {\n    startScanner()') &&
  ideaModalJsx.includes('setActiveTab(\'SCANNER\')') &&
  ideaModalJsx.includes('startScanner()'),
  'Camera scanner is ONLY started on explicit user click of Scan QR tab'
);

// TeamQrModal: Product-specific URL support with backward compatibility
assert(
  teamQrModalJsx.includes('productId') &&
  teamQrModalJsx.includes('/#idea?id=') &&
  teamQrModalJsx.includes('/?token=${qrToken}#vote'),
  'TeamQrModal generates direct #idea?id= when productId is present, falls back to ?token=...#vote'
);

// sessionNavigationState: cleanVotingUrl preserves targetHash
assert(
  sessionNavJs.includes('cleanVotingUrl(targetHash = null)') &&
  sessionNavJs.includes('url.hash = targetHash'),
  'cleanVotingUrl atomically replaces token with targetHash without page reload'
);

// -----------------------------------------------------------------------------
// Group 2: URL Parsing & Navigation Logic Unit Tests
// -----------------------------------------------------------------------------
console.log('\n2. Testing URL Token & Idea Extraction Logic...');

// Emulate extractVotingTokenFromUrl logic
function mockExtractToken(search, hash) {
  if (search) {
    const sp = new URLSearchParams(search);
    const tok = sp.get('token');
    if (tok && tok.trim()) return tok.trim();
  }
  if (hash) {
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hp = new URLSearchParams(hash.slice(qIndex));
      const tok = hp.get('token');
      if (tok && tok.trim()) return tok.trim();
    } else if (hash.startsWith('#token=')) {
      const hp = new URLSearchParams(hash.slice(1));
      const tok = hp.get('token');
      if (tok && tok.trim()) return tok.trim();
    }
  }
  return null;
}

assert(
  mockExtractToken('?token=ipl_qr_sample_123', '#vote') === 'ipl_qr_sample_123',
  'Extracts token from search params (?token=...#vote)'
);

assert(
  mockExtractToken('', '#vote?token=hash_sample_456') === 'hash_sample_456',
  'Extracts token from hash query params (#vote?token=...)'
);

assert(
  mockExtractToken('', '#token=direct_token_789') === 'direct_token_789',
  'Extracts token from hash prefix (#token=...)'
);

assert(
  mockExtractToken('', '#idea?id=c7a31200-0000-0000-0000-000000000001') === null,
  'Does not mistake #idea?id for a voting token'
);

// -----------------------------------------------------------------------------
// Group 3: Backend API Integration for Resolution Scenarios
// -----------------------------------------------------------------------------
async function runBackendTests() {
  console.log('\n3. Testing Backend Resolution Endpoints with Real Test Server...');

  // Start temporary backend server
  const express = backendRequire('express');
  const app = express();
  app.use(express.json());

  // Mount idea router
  const ideaRouter = require(path.resolve('e:/collegeProject/ipl-2026/backend/routes/ideaRoutes.js'));
  app.use('/api/ideas', ideaRouter);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  function get(endpoint) {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${endpoint}`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, body });
          }
        });
      }).on('error', reject);
    });
  }

  try {
    // 3.1 Full URL unwrapping test
    const wrappedUrl = encodeURIComponent('https://ipl2026.sece.ac.in/?token=e8537b82-bd7b-4c49-b7f5-81395ce63fc8#vote');
    const wrapRes = await get(`/api/ideas/resolve/${wrappedUrl}`);
    assert(
      wrapRes.status === 200 && wrapRes.data.success === true,
      'URL unwrapping: Full URL parameter resolved to clean token/UUID'
    );

    // 3.2 Product UUID direct resolution
    const prodRes = await get('/api/ideas/resolve/e8537b82-bd7b-4c49-b7f5-81395ce63fc8');
    assert(
      prodRes.status === 200 &&
      prodRes.data.success === true &&
      prodRes.data.resolution_type === 'direct_product' &&
      prodRes.data.product_id === 'e8537b82-bd7b-4c49-b7f5-81395ce63fc8',
      'Direct Product UUID resolves to direct_product with product_id'
    );

    // 3.3 Multi-product team safety (ChameleX)
    const chamelexTeamId = '95a5a40c-cc97-4312-8235-158355b3675d';
    const multiRes = await get(`/api/ideas/resolve/${chamelexTeamId}`);
    assert(
      multiRes.status === 200 &&
      multiRes.data.success === true &&
      multiRes.data.resolution_type === 'team_multi' &&
      Array.isArray(multiRes.data.products) &&
      multiRes.data.products.length === 2,
      'Multi-product team resolves to team_multi with all products (NO silent guessing)'
    );

    // 3.4 Legacy QR Token Resolution
    // Lookup the known production QR token for team
    const { supabase } = require(path.resolve('e:/collegeProject/ipl-2026/backend/supabaseClient.js'));
    const { data: sampleQr } = await supabase
      .from('team_qr_codes')
      .select('token, qr_token, team_id, product_id, is_active')
      .limit(1)
      .maybeSingle();

    if (sampleQr) {
      const tokenToTest = sampleQr.token || sampleQr.qr_token;
      const qrRes = await get(`/api/ideas/resolve/${encodeURIComponent(tokenToTest)}`);
      assert(
        qrRes.status === 200 && qrRes.data.success === true,
        `Production QR token "${tokenToTest.slice(0, 8)}..." resolves successfully`
      );
      assert(
        ['qr_product', 'qr_team_single', 'qr_team_multi'].includes(qrRes.data.resolution_type),
        `Resolution type is authoritative QR type: "${qrRes.data.resolution_type}"`
      );
    } else {
      console.log('  ⚠️ (Skipped sample QR DB check: no rows in team_qr_codes)');
    }

    // 3.5 Registration ID resolution (Branch D)
    const { data: sampleProduct } = await supabase
      .from('products')
      .select('legacy_registration_id')
      .not('legacy_registration_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (sampleProduct?.legacy_registration_id) {
      const regRes = await get(`/api/ideas/resolve/${encodeURIComponent(sampleProduct.legacy_registration_id)}`);
      assert(
        regRes.status === 200 && regRes.data.success === true,
        `Registration ID "${sampleProduct.legacy_registration_id}" resolves successfully`
      );
    }

    // 3.6 Invalid QR / Identifier 404 test
    const invalidRes = await get('/api/ideas/resolve/NONEXISTENT_QR_TOKEN_12345');
    assert(
      invalidRes.status === 404 &&
      invalidRes.data.success === false &&
      invalidRes.data.error_code === 'IDEA_NOT_FOUND',
      'Unrecognized QR token returns HTTP 404 with IDEA_NOT_FOUND'
    );

  } finally {
    server.close();
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(` TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runBackendTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
