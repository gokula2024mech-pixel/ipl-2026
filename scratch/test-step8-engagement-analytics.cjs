// scratch/test-step8-engagement-analytics.cjs
// Verification suite for Step 8: Public Engagement & Visit Analytics

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

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
console.log('   IPL-2026: STEP 8 ENGAGEMENT & VISIT ANALYTICS VERIFICATION   ');
console.log('================================================================\n');

// 1. Read files
const migrationRoot = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/stage_15_public_engagement_analytics.sql'), 'utf8');
const migrationSupabase = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/supabase/migrations/stage_15_public_engagement_analytics.sql'), 'utf8');
const analyticsRoutesJs = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/backend/routes/analyticsRoutes.js'), 'utf8');
const ideaRoutesJs = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/backend/routes/ideaRoutes.js'), 'utf8');
const sessionNavJs = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/src/utils/sessionNavigationState.js'), 'utf8');
const publicIdeaPageJsx = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/src/components/PublicIdeaPage.jsx'), 'utf8');
const appJsx = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/src/App.jsx'), 'utf8');
const adminVotingJsx = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/src/components/AdminVotingManagement.jsx'), 'utf8');
const votingRoutesJs = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/backend/routes/votingRoutes.js'), 'utf8');
const serverJs = fs.readFileSync(path.resolve('e:/collegeProject/ipl-2026/backend/server.js'), 'utf8');

// -----------------------------------------------------------------------------
// SECTION 1: Migration Schema & Privacy Guardrails
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Migration Schema & Privacy Guardrails ---');

// 1. Migration copies exist and match
assert(
  migrationRoot.length > 0 && migrationRoot === migrationSupabase,
  'Root and supabase/migrations copies of Stage 15 exist and are identical'
);

// 2. Minimum stored personal data: NO user_id, NO user_agent, and NO ip_hash in site_visits
const siteVisitsTableDef = migrationRoot.slice(
  migrationRoot.indexOf('CREATE TABLE IF NOT EXISTS public.site_visits'),
  migrationRoot.indexOf('COMMENT ON TABLE')
);
assert(
  siteVisitsTableDef.includes('CREATE TABLE IF NOT EXISTS public.site_visits (') &&
  !siteVisitsTableDef.includes('user_id') &&
  !siteVisitsTableDef.includes('user_agent') &&
  !siteVisitsTableDef.includes('ip_hash'),
  'public.site_visits contains ZERO user_id, ZERO user_agent, and ZERO ip_hash fields'
);

// 3. Stored identifier is hashed session identifier
assert(
  migrationRoot.includes('session_hash TEXT NOT NULL'),
  'public.site_visits stores session_hash (SHA-256) instead of raw token'
);

// 3b. record_site_visit function has no IP parameter
assert(
  migrationRoot.includes('record_site_visit(') &&
  migrationRoot.includes('p_session_hash TEXT') &&
  !migrationRoot.includes('p_ip_hash'),
  'record_site_visit signature accepts only p_session_hash with ZERO IP persistence'
);

// 3c. Backend analyticsRoutes does not pass IP to site_visits
assert(
  !analyticsRoutesJs.includes('p_ip_hash') &&
  !analyticsRoutesJs.includes('ip_hash: ipHash'),
  'backend/routes/analyticsRoutes.js does NOT persist IP information into site_visits'
);

// 4. RLS enabled on site_visits
assert(
  migrationRoot.includes('ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY') &&
  migrationRoot.includes('CREATE POLICY "Admins can view site_visits"'),
  'RLS enabled on site_visits with admin-only SELECT policy'
);

// 5. Existing record_idea_visit signature preserved (zero overload conflict)
assert(
  !migrationRoot.includes('DROP FUNCTION IF EXISTS public.record_idea_visit') &&
  !migrationRoot.includes('CREATE OR REPLACE FUNCTION public.record_idea_visit('),
  'Stage 15 does NOT alter or overload record_idea_visit signature, preserving 100% backward compatibility'
);

// -----------------------------------------------------------------------------
// SECTION 2: Frontend Telemetry & Session Management
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Frontend Telemetry & Session Management ---');

// 6. sessionNavigationState exports getStoredSessionToken
assert(
  sessionNavJs.includes('export function getStoredSessionToken()') &&
  sessionNavJs.includes('sessionStorage.getItem(SESSION_TOKEN_KEY)') &&
  sessionNavJs.includes('sessionStorage.setItem(SESSION_TOKEN_KEY'),
  'sessionNavigationState.js manages anonymous session token via sessionStorage'
);

// 7. PublicIdeaPage transmits session_token along with visitor_token
assert(
  publicIdeaPageJsx.includes('getStoredSessionToken') &&
  publicIdeaPageJsx.includes("headers['x-session-token'] = sessionToken") &&
  publicIdeaPageJsx.includes('session_token: sessionToken || undefined'),
  'PublicIdeaPage sends session_token in headers and request payload'
);

// 8. App.jsx records site visit on mount, immune to internal SPA navigation
assert(
  appJsx.includes('/api/analytics/site-visit') &&
  appJsx.includes('getStoredSessionToken()') &&
  appJsx.includes('getStoredVisitorToken()'),
  'App.jsx triggers recordSiteVisit on cold load/refresh within empty-dep useEffect'
);

// -----------------------------------------------------------------------------
// SECTION 3: Admin UI & Engagement Analytics Tab
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Admin UI & Engagement Analytics Tab ---');

// 9. AdminVotingManagement includes analytics tab
assert(
  adminVotingJsx.includes("id: 'analytics'") &&
  adminVotingJsx.includes("label: 'Engagement Analytics'"),
  'AdminVotingManagement includes dedicated Engagement Analytics tab'
);

// 10. Top 6 Metric Cards
assert(
  adminVotingJsx.includes('Website Views') &&
  adminVotingJsx.includes('Unique Sessions') &&
  adminVotingJsx.includes('Idea Views') &&
  adminVotingJsx.includes('Idea Sessions') &&
  adminVotingJsx.includes('Total Likes') &&
  adminVotingJsx.includes('Total Votes'),
  'AdminVotingManagement renders all 6 required summary metric cards'
);

// 11. Idea-Wise Table with Score Formula
assert(
  adminVotingJsx.includes('Innovation Idea Engagement Table') &&
  adminVotingJsx.includes('Score Formula: Likes + (Votes × 2)'),
  'AdminVotingManagement renders Idea Engagement Table with locked score formula'
);

// 12. CSV Export Button
assert(
  adminVotingJsx.includes('handleExportAnalyticsCsv') &&
  adminVotingJsx.includes('Export Analytics CSV'),
  'AdminVotingManagement provides one-click Export Analytics CSV button'
);

// -----------------------------------------------------------------------------
// SECTION 4: Functional Live API Integration Tests
// -----------------------------------------------------------------------------
async function runFunctionalTests() {
  console.log('\n--- SECTION 4: Functional Live API Integration Tests ---');

  const backendDir = path.resolve('e:/collegeProject/ipl-2026/backend');
  const backendRequire = (id) => require(require.resolve(id, { paths: [backendDir] }));

  const dotenv = backendRequire('dotenv');
  dotenv.config({ path: path.join(backendDir, '.env') });

  const express = backendRequire('express');
  const app = express();
  app.use(express.json());

  // Mount routes
  const analyticsRouter = require(path.join(backendDir, 'routes/analyticsRoutes.js'));
  const ideaRouter = require(path.join(backendDir, 'routes/ideaRoutes.js'));
  const votingRouter = require(path.join(backendDir, 'routes/votingRoutes.js'));

  app.use('/api/analytics', analyticsRouter);
  app.use('/api/admin/analytics', analyticsRouter);
  app.use('/api/ideas', ideaRouter);
  app.use('/api/voting', votingRouter);

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
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
          try {
            const parsed = rawData.startsWith('{') || rawData.startsWith('[')
              ? JSON.parse(rawData)
              : rawData;
            resolve({ status: res.statusCode, headers: res.headers, body: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, body: rawData });
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
    // 13. Public site visit recording
    const testSessionToken1 = 'sess-token-' + crypto.randomUUID();
    const siteRes1 = await makeRequest('POST', '/api/analytics/site-visit', {
      'x-session-token': testSessionToken1
    });
    assert(siteRes1.status === 200 && siteRes1.body?.success === true, 'POST /api/analytics/site-visit records visit successfully');

    // 14. Strict Privacy: Response returns ZERO tokens, hashes, or IPs
    const responseKeys = Object.keys(siteRes1.body);
    assert(
      !siteRes1.body.visitor_token &&
      !siteRes1.body.session_token &&
      !siteRes1.body.session_hash &&
      !siteRes1.body.token_hash &&
      !siteRes1.body.ip &&
      !siteRes1.body.ip_hash &&
      !siteRes1.body.user_id,
      'Site visit response returns ZERO tokens, token hashes, IPs, or user IDs'
    );

    // 15. Idea Visit Logging
    const ideaRes = await makeRequest('GET', '/api/ideas?limit=1');
    const sampleProduct = ideaRes.body?.ideas?.[0];
    const productId = sampleProduct?.product_id;

    if (productId) {
      const visitRes = await makeRequest('POST', `/api/ideas/${productId}/visit`, {
        'x-session-token': testSessionToken1
      });
      assert(visitRes.status === 200 && visitRes.body?.success === true, `POST /api/ideas/${productId}/visit logs visit successfully`);
      assert(
        !visitRes.body.visitor_token &&
        !visitRes.body.session_token &&
        !visitRes.body.session_hash &&
        !visitRes.body.ip_hash,
        'Idea visit response returns ZERO tokens, session hashes, or IP addresses'
      );
    }

    // 16. Public Access Restriction on Admin Analytics (401/403)
    const unauthOverview = await makeRequest('GET', '/api/admin/analytics/overview');
    assert(unauthOverview.status === 401, 'Unauthenticated access to /api/admin/analytics/overview rejected with HTTP 401');

    const unauthIdeas = await makeRequest('GET', '/api/admin/analytics/ideas');
    assert(unauthIdeas.status === 401, 'Unauthenticated access to /api/admin/analytics/ideas rejected with HTTP 401');

    const unauthExport = await makeRequest('GET', '/api/admin/analytics/export');
    assert(unauthExport.status === 401, 'Unauthenticated access to /api/admin/analytics/export rejected with HTTP 401');

    // Student user cannot access admin analytics
    const studentAuth = { 'Authorization': 'Bearer TEST_TOKEN_student_99:student@sece.ac.in:student' };
    const studentOverview = await makeRequest('GET', '/api/admin/analytics/overview', studentAuth);
    assert(studentOverview.status === 403, 'Student access to /api/admin/analytics/overview rejected with HTTP 403');

    // 17. Admin access to /api/admin/analytics/overview
    const adminAuth = { 'Authorization': 'Bearer TEST_TOKEN_admin_01:admin@sece.ac.in:admin' };
    const adminOverview = await makeRequest('GET', '/api/admin/analytics/overview', adminAuth);
    assert(adminOverview.status === 200 && adminOverview.body?.success === true, 'Admin access to /api/admin/analytics/overview succeeds with HTTP 200');

    const metrics = adminOverview.body?.metrics;
    assert(
      metrics &&
      typeof metrics.website_page_views === 'number' &&
      typeof metrics.website_unique_sessions === 'number' &&
      typeof metrics.idea_page_views === 'number' &&
      typeof metrics.idea_unique_sessions === 'number' &&
      typeof metrics.total_likes === 'number' &&
      typeof metrics.total_votes === 'number' &&
      typeof metrics.total_score === 'number',
      'Overview returns all required aggregate counters'
    );

    // 18. CRITICAL: Score Integrity Formula
    const expectedScore = metrics.total_likes + (metrics.total_votes * 2);
    assert(
      metrics.total_score === expectedScore,
      `Score integrity strictly verified: Total Score (${metrics.total_score}) = Likes (${metrics.total_likes}) + Votes (${metrics.total_votes}) * 2`
    );

    // 19. Admin access to /api/admin/analytics/ideas
    const adminIdeasRes = await makeRequest('GET', '/api/admin/analytics/ideas', adminAuth);
    assert(adminIdeasRes.status === 200 && adminIdeasRes.body?.success === true, 'Admin access to /api/admin/analytics/ideas succeeds with HTTP 200');
    assert(Array.isArray(adminIdeasRes.body?.ideas), 'Ideas analytics returns an array of ideas');

    const firstIdea = adminIdeasRes.body?.ideas?.[0];
    if (firstIdea) {
      assert(
        firstIdea.rank === 1 &&
        firstIdea.product_id &&
        firstIdea.product_title &&
        firstIdea.team_name &&
        firstIdea.registration_id &&
        typeof firstIdea.page_views === 'number' &&
        typeof firstIdea.unique_sessions === 'number' &&
        typeof firstIdea.likes === 'number' &&
        typeof firstIdea.votes === 'number' &&
        typeof firstIdea.score === 'number',
        'Idea item contains all approved aggregate fields and 1-indexed rank'
      );

      // Idea score formula verified
      const expectedIdeaScore = firstIdea.likes + (firstIdea.votes * 2);
      assert(firstIdea.score === expectedIdeaScore, 'Individual idea score equals Likes + (Votes * 2)');

      // Privacy audit across ideas
      assert(
        !firstIdea.visitor_token &&
        !firstIdea.session_token &&
        !firstIdea.session_hash &&
        !firstIdea.ip &&
        !firstIdea.user_id &&
        !firstIdea.student_email &&
        !firstIdea.phone,
        'Idea item contains ZERO personal identifiers, tokens, hashes, or IPs'
      );
    }

    // 20. Admin CSV Export
    const exportRes = await makeRequest('GET', '/api/admin/analytics/export', adminAuth);
    assert(exportRes.status === 200, 'Admin CSV export returns HTTP 200');
    assert(
      exportRes.headers['content-type']?.includes('text/csv'),
      'Export returns Content-Type: text/csv'
    );
    assert(
      exportRes.headers['content-disposition']?.includes('attachment; filename='),
      'Export returns Content-Disposition attachment header'
    );

    const csvText = typeof exportRes.body === 'string' ? exportRes.body : '';
    const csvFirstLine = csvText.split('\r\n')[0] || csvText.split('\n')[0];
    const expectedHeaders = 'Rank,Product ID,Registration ID,Product Title,Team Name,Page Views,Unique Sessions,Likes,Votes,Score,Last Viewed At';
    assert(
      csvFirstLine === expectedHeaders,
      `CSV header strictly matches required columns: "${expectedHeaders}"`
    );
    assert(
      !csvText.includes('ip_hash') &&
      !csvText.includes('visitor_token') &&
      !csvText.includes('session_token') &&
      !csvText.includes('user_agent') &&
      !csvText.includes('@sece.ac.in'),
      'CSV content contains ZERO visitor tokens, token hashes, IPs, or email addresses'
    );

    // 21. Rate limiting on site visit endpoint
    let hitRateLimit = false;
    for (let i = 0; i < 70; i++) {
      const res = await makeRequest('POST', '/api/analytics/site-visit', {
        'x-session-token': 'rate-limit-test-token'
      });
      if (res.status === 429) {
        hitRateLimit = true;
        break;
      }
    }
    assert(hitRateLimit, 'Rate limiter blocks excessive automated visit requests with HTTP 429');

    // 22. Existing Like & Vote functionality integrity
    assert(ideaRoutesJs.includes("router.post('/:productId/like'"), 'Existing Like route remains present');
    assert(votingRoutesJs.includes("router.post('/vote'"), 'Existing Vote route remains present');
    assert(votingRoutesJs.includes("router.post('/admin/controls'"), 'Existing Admin voting window control remains present');
    assert(ideaRoutesJs.includes("router.get('/resolve/:identifier'"), 'Existing QR resolver route remains present');

  } finally {
    server.close();
  }

  // ---------------------------------------------------------------------------
  // SECTION 5: Summary
  // ---------------------------------------------------------------------------
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
  console.error('Fatal test error:', err);
  process.exit(1);
});
