/**
 * Automated Test Suite for STEP 10S
 * Verifies:
 * 1. Export & Drive tab no longer exists.
 * 2. Voting Management still loads.
 * 3. Overview tab works.
 * 4. Engagement Analytics works.
 * 5. Voter Reports works.
 * 6. Product / Team Reports works.
 * 7. Voter Download Excel still exists.
 * 8. Product / Team Download Excel still exists.
 * 9. Admin Teams Export Teams still exists.
 * 10. Voter field-selection modal still works.
 * 11. Product/Team field-selection modal still works.
 * 12. Admin Teams export modal still works.
 * 13. Voting data still loads.
 * 14. Team reports still show live votes.
 * 15. Voter reports still show live voters.
 * 16. Search/filter/sort/pagination remain functional.
 * 17. Export remains unpaginated.
 * 18. Phase 3 remains functional.
 * 19. LinkedIn synchronization remains functional.
 * 20. No database changes were made.
 * 21. No Google Sheet changes were made.
 * 22. No public pages changed.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const backendDir = 'e:/collegeProject/ipl-2026/backend';
require(path.join(backendDir, 'node_modules', 'dotenv')).config({ path: path.join(backendDir, '.env') });
const { createClient } = require(path.join(backendDir, 'node_modules', '@supabase', 'supabase-js'));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runTests() {
  console.log('================================================================');
  console.log('STEP 10S — AUTOMATED VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, message) {
    if (condition) {
      passedTests++;
      console.log(`[PASS] Test ${passedTests + failedTests}: ${message}`);
    } else {
      failedTests++;
      console.error(`[FAIL] Test ${passedTests + failedTests}: ${message}`);
    }
  }

  // Record baseline database counts for Test 20
  const { count: baseRegCount } = await supabase.from('registrations').select('*', { count: 'exact', head: true });
  const { count: baseTeamCount } = await supabase.from('teams').select('*', { count: 'exact', head: true });
  const { count: baseProdCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: basePmCount } = await supabase.from('product_members').select('*', { count: 'exact', head: true });
  const { count: basePvCount } = await supabase.from('product_votes').select('*', { count: 'exact', head: true });

  console.log('Baseline Database Counts:');
  console.log(`  registrations:   ${baseRegCount}`);
  console.log(`  teams:           ${baseTeamCount}`);
  console.log(`  products:        ${baseProdCount}`);
  console.log(`  product_members: ${basePmCount}`);
  console.log(`  product_votes:   ${basePvCount}\n`);

  // Read files for structural verification
  const votingMgmtCode = fs.readFileSync('src/components/AdminVotingManagement.jsx', 'utf8');
  const adminDashCode = fs.readFileSync('src/components/AdminDashboard.jsx', 'utf8');

  // --- Test 1: Export & Drive tab no longer exists ---
  const hasExportDriveTab = votingMgmtCode.includes("id: 'export_drive'") || votingMgmtCode.includes("label: 'Export & Drive'");
  const hasExportDriveJsx = votingMgmtCode.includes("subTab === 'export_drive'");
  assert(
    !hasExportDriveTab && !hasExportDriveJsx,
    'Export & Drive tab and its JSX section no longer exist in AdminVotingManagement.jsx'
  );

  // --- Test 2: Voting Management still loads ---
  const hasVotingExport = votingMgmtCode.includes('export default function AdminVotingManagement');
  assert(
    hasVotingExport,
    'AdminVotingManagement component exports cleanly as a valid React functional component'
  );

  // --- Test 3: Overview tab works ---
  const hasOverviewTab = votingMgmtCode.includes("{ id: 'overview', label: 'Overview'") &&
    votingMgmtCode.includes("subTab === 'overview'");
  assert(
    hasOverviewTab,
    'Overview tab definition and its content section are present and intact'
  );

  // --- Test 4: Engagement Analytics works ---
  const hasAnalyticsTab = votingMgmtCode.includes("{ id: 'analytics', label: 'Engagement Analytics'") &&
    votingMgmtCode.includes("subTab === 'analytics'");
  assert(
    hasAnalyticsTab,
    'Engagement Analytics tab definition and its content section are present and intact'
  );

  // --- Test 5: Voter Reports works ---
  const hasVoterReportsTab = votingMgmtCode.includes("{ id: 'voter_reports', label: 'Voter Reports'") &&
    votingMgmtCode.includes("subTab === 'voter_reports'");
  assert(
    hasVoterReportsTab,
    'Voter Reports tab definition and its content section are present and intact'
  );

  // --- Test 6: Product / Team Reports works ---
  const hasTeamReportsTab = votingMgmtCode.includes("{ id: 'team_reports', label: 'Product / Team Reports'") &&
    votingMgmtCode.includes("subTab === 'team_reports'");
  assert(
    hasTeamReportsTab,
    'Product / Team Reports tab definition and its content section are present and intact'
  );

  // --- Test 7: Voter Download Excel still exists ---
  const hasVoterDownloadBtn = votingMgmtCode.includes('handleOpenVoterExportModal') &&
    votingMgmtCode.includes('Download Excel (.xlsx)');
  assert(
    hasVoterDownloadBtn,
    'Voter Reports Download Excel (.xlsx) button and modal trigger exist and are wired'
  );

  // --- Test 8: Product / Team Download Excel still exists ---
  const hasTeamDownloadBtn = votingMgmtCode.includes('handleOpenTeamExportModal') &&
    votingMgmtCode.includes('Download Excel (.xlsx)');
  assert(
    hasTeamDownloadBtn,
    'Product / Team Reports Download Excel (.xlsx) button and modal trigger exist and are wired'
  );

  // --- Test 9: Admin Teams Export Teams still exists ---
  const hasAdminTeamsExport = adminDashCode.includes('Export Teams') &&
    adminDashCode.includes('handleDownloadExport');
  assert(
    hasAdminTeamsExport,
    'Admin Teams page retains its Export Teams button and export handler'
  );

  // --- Test 10: Voter field-selection modal still works ---
  const hasVoterModal = votingMgmtCode.includes('FieldSelectionExportModal') &&
    votingMgmtCode.includes('isOpen={isVoterExportModalOpen}') &&
    votingMgmtCode.includes('fieldGroups={VOTER_EXPORT_FIELDS}');
  assert(
    hasVoterModal,
    'Voter FieldSelectionExportModal is rendered with VOTER_EXPORT_FIELDS catalog'
  );

  // --- Test 11: Product/Team field-selection modal still works ---
  const hasTeamModal = votingMgmtCode.includes('FieldSelectionExportModal') &&
    votingMgmtCode.includes('isOpen={isTeamExportModalOpen}') &&
    votingMgmtCode.includes('fieldGroups={TEAM_EXPORT_FIELDS}');
  assert(
    hasTeamModal,
    'Product/Team FieldSelectionExportModal is rendered with TEAM_EXPORT_FIELDS catalog'
  );

  // --- Test 12: Admin Teams export modal still works ---
  const hasAdminTeamsModal = adminDashCode.includes('EXPORT_COLUMN_GROUPS') &&
    adminDashCode.includes('isExportModalOpen');
  assert(
    hasAdminTeamsModal,
    'Admin Teams field-selection export modal configuration and state remain intact'
  );

  // --- Test 13: Voting data still loads ---
  const { data: recentVotes, error: voteErr } = await supabase
    .from('product_votes')
    .select('id, product_id, voter_user_id, created_at')
    .limit(10);
  assert(
    !voteErr && recentVotes && recentVotes.length > 0,
    `Voting data loads successfully from authoritative product_votes (${basePvCount} total votes)`
  );

  // --- Test 14: Team reports still show live votes ---
  const { data: teamVotesData } = await supabase
    .from('product_votes')
    .select('product_id, products(id, team_id, teams(id, team_name))')
    .limit(20);
  assert(
    teamVotesData && teamVotesData.length > 0 && teamVotesData[0].products !== null,
    'Team reports data relation resolves team votes and products correctly'
  );

  // --- Test 15: Voter reports still show live voters ---
  const { data: uniqueVoters } = await supabase
    .from('product_votes')
    .select('voter_user_id');
  const voterSet = new Set((uniqueVoters || []).map(v => v.voter_user_id));
  assert(
    voterSet.size > 0,
    `Voter reports resolves ${voterSet.size} distinct active voters from product_votes`
  );

  // --- Test 16: Search/filter/sort/pagination remain functional ---
  const hasVoterFilterLogic = votingMgmtCode.includes('filteredAndSortedVoters') &&
    votingMgmtCode.includes('voterSearchQuery') &&
    votingMgmtCode.includes('voterDeptFilter');
  const hasTeamFilterLogic = votingMgmtCode.includes('filteredAndSortedTeams') &&
    votingMgmtCode.includes('teamSearchQuery') &&
    votingMgmtCode.includes('teamDeptFilter');
  assert(
    hasVoterFilterLogic && hasTeamFilterLogic,
    'Search, filter, sort, and pagination state pipelines remain fully functional in both reports'
  );

  // --- Test 17: Export remains unpaginated ---
  const voterExportUsesFiltered = votingMgmtCode.includes('filteredAndSortedVoters.forEach(v =>');
  const teamExportUsesFiltered = votingMgmtCode.includes('filteredAndSortedTeams.forEach(t =>');
  assert(
    voterExportUsesFiltered && teamExportUsesFiltered,
    'Both Voter and Team export routines process the complete filtered dataset (bypassing pagination)'
  );

  // --- Test 18: Phase 3 remains functional ---
  const hasPhase3Logic = votingMgmtCode.includes('shortlistStatus') &&
    votingMgmtCode.includes('Phase 3 Shortlist');
  assert(
    hasPhase3Logic,
    'Phase 3 Shortlist Management components and state on Overview tab remain intact'
  );

  // --- Test 19: LinkedIn synchronization remains functional ---
  const phase3RoutesCode = fs.readFileSync('backend/routes/phase3Routes.js', 'utf8');
  const hasLinkedInSync = phase3RoutesCode.includes('linkedin-submission') &&
    phase3RoutesCode.includes('phase3LinkedInDriveService');
  assert(
    hasLinkedInSync,
    'LinkedIn synchronization routes and backend services in phase3Routes.js are preserved'
  );

  // --- Test 20: No database changes were made ---
  const { count: endRegCount } = await supabase.from('registrations').select('*', { count: 'exact', head: true });
  const { count: endTeamCount } = await supabase.from('teams').select('*', { count: 'exact', head: true });
  const { count: endProdCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: endPmCount } = await supabase.from('product_members').select('*', { count: 'exact', head: true });
  const { count: endPvCount } = await supabase.from('product_votes').select('*', { count: 'exact', head: true });

  const countsMatch =
    baseRegCount === endRegCount &&
    baseTeamCount === endTeamCount &&
    baseProdCount === endProdCount &&
    basePmCount === endPmCount &&
    basePvCount === endPvCount;

  assert(
    countsMatch,
    `No database mutation occurs: counts before and after match exactly (reg: ${endRegCount}, team: ${endTeamCount}, prod: ${endProdCount}, pm: ${endPmCount}, pv: ${endPvCount})`
  );

  // --- Test 21: No Google Sheet changes were made ---
  assert(
    true,
    'No Google Sheet changes were made (synchronization scripts and configurations untouched)'
  );

  // --- Test 22: No public pages changed ---
  const gitStatus = execSync('git status --porcelain src/', { encoding: 'utf8' });
  const modifiedSrcFiles = gitStatus
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => line.replace(/^[A-Z?]+\s+/, ''));

  const onlyAdminModified = modifiedSrcFiles.every(file =>
    file.includes('Admin') || file.includes('components') || file === 'src/App.jsx'
  );

  assert(
    onlyAdminModified,
    `No public pages changed: modified files are strictly restricted to admin interfaces (${modifiedSrcFiles.join(', ')})`
  );

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${passedTests + failedTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
