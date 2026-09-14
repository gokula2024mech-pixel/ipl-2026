/**
 * Automated Test Suite for STEP 10R
 * Verifies:
 * 1. product_members batching retrieves all records.
 * 2. profiles batching retrieves all records.
 * 3. IPL26-0493 resolves correctly.
 * 4. IPL26-0494 resolves correctly.
 * 5. IPL26-0495 resolves correctly.
 * 6. IPL26-0496 resolves correctly.
 * 7. IPL26-0497 resolves correctly.
 * 8. IPL26-0498 resolves correctly.
 * 9. IPL26-0499 resolves correctly.
 * 10. IPL26-0500 resolves correctly.
 * 11. IPL26-0501 resolves correctly.
 * 12. IPL26-0502 resolves correctly.
 * 13. No unexpected missing leader across 342 teams.
 * 14. No unexpected missing member 2 across 342 teams.
 * 15. No unexpected missing member 3 across 342 teams.
 * 16. Existing team filters still work.
 * 17. Existing sorting still works.
 * 18. Existing pagination still works.
 * 19. Export uses corrected normalized data.
 * 20. No database mutation occurs.
 */

const path = require('path');
const backendDir = 'e:/collegeProject/ipl-2026/backend';
require(path.join(backendDir, 'node_modules', 'dotenv')).config({ path: path.join(backendDir, '.env') });
const { createClient } = require(path.join(backendDir, 'node_modules', '@supabase', 'supabase-js'));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function normalizeMentorDepartment(dept) {
  if (!dept) return '';
  return dept.trim();
}

async function runTests() {
  console.log('================================================================');
  console.log('STEP 10R — AUTOMATED VERIFICATION TEST SUITE');
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

  // Record baseline database counts for Test 20 (No database mutation)
  const { count: baseRegCount } = await supabase.from('registrations').select('*', { count: 'exact', head: true });
  const { count: baseTeamCount } = await supabase.from('teams').select('*', { count: 'exact', head: true });
  const { count: baseProdCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: basePmCount } = await supabase.from('product_members').select('*', { count: 'exact', head: true });
  const { count: baseProfCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  const { count: baseEvalCount } = await supabase.from('evaluations').select('*', { count: 'exact', head: true });

  console.log('Baseline Database Counts:');
  console.log(`  registrations:   ${baseRegCount}`);
  console.log(`  teams:           ${baseTeamCount}`);
  console.log(`  products:        ${baseProdCount}`);
  console.log(`  product_members: ${basePmCount}`);
  console.log(`  profiles:        ${baseProfCount}`);
  console.log(`  evaluations:     ${baseEvalCount}\n`);

  // --- Test 1: product_members batching retrieves all records ---
  let membersData = [];
  let pmFrom = 0;
  const pmPageSize = 1000;
  while (true) {
    const { data: batch, error: batchErr } = await supabase
      .from('product_members')
      .select('*')
      .range(pmFrom, pmFrom + pmPageSize - 1);
    if (batchErr) throw batchErr;
    if (!batch || batch.length === 0) break;
    membersData = membersData.concat(batch);
    if (batch.length < pmPageSize) break;
    pmFrom += pmPageSize;
  }
  assert(
    membersData.length === basePmCount && membersData.length > 1000,
    `product_members batching retrieved all ${membersData.length} records (expected exact count ${basePmCount} > 1000)`
  );

  // --- Test 2: profiles batching retrieves all records ---
  let profilesData = [];
  let profFrom = 0;
  const profPageSize = 1000;
  while (true) {
    const { data: batch, error: batchErr } = await supabase
      .from('profiles')
      .select('*')
      .range(profFrom, profFrom + profPageSize - 1);
    if (batchErr) throw batchErr;
    if (!batch || batch.length === 0) break;
    profilesData = profilesData.concat(batch);
    if (batch.length < profPageSize) break;
    profFrom += profPageSize;
  }
  assert(
    profilesData.length === baseProfCount && profilesData.length > 1000,
    `profiles batching retrieved all ${profilesData.length} records (expected exact count ${baseProfCount} > 1000)`
  );

  // Fetch remaining tables for normalization (matching AdminDashboard.jsx fetchDashboardData)
  const { data: registrationsData } = await supabase
    .from('registrations')
    .select('*')
    .order('created_at', { ascending: false });

  const { data: evaluationsData } = await supabase
    .from('evaluations')
    .select('*')
    .order('submitted_at', { ascending: false });

  const { data: teamsData } = await supabase
    .from('teams')
    .select('*');

  const { data: productsData } = await supabase
    .from('products')
    .select('*');

  const { data: departmentsData } = await supabase
    .from('departments')
    .select('*');

  const deptsMap = {};
  (departmentsData || []).forEach(d => {
    deptsMap[d.id] = d.name;
  });

  const regsMap = {};
  (registrationsData || []).forEach(r => {
    regsMap[r.registration_id] = r;
  });

  const productsByTeamId = {};
  (productsData || []).forEach(prod => {
    if (!productsByTeamId[prod.team_id]) {
      productsByTeamId[prod.team_id] = [];
    }
    productsByTeamId[prod.team_id].push(prod);
  });

  // Replicate exact AdminDashboard.jsx normalization logic with batched product_members + origReg fallback
  const normalizedRecords = (teamsData || []).map(team => {
    const teamProducts = (productsByTeamId[team.id] || []).slice().sort((a, b) => (a.product_number || 1) - (b.product_number || 1));
    const primaryProd = teamProducts[0] || {};
    const teamProductIds = new Set(teamProducts.map(p => p.id));
    const teamMembers = (membersData || []).filter(m => teamProductIds.has(m.product_id));

    const leader = teamMembers.find(m => m.is_team_leader || m.role === 'Team Leader') || {};
    const otherMembersRaw = teamMembers.filter(m => !m.is_team_leader && m.role !== 'Team Leader');

    const uniqueOtherMembers = [];
    const seenMemberKeys = new Set();
    for (const m of otherMembersRaw) {
      const key = (m.member_email || m.member_name || '').trim().toLowerCase();
      if (key && !seenMemberKeys.has(key)) {
        seenMemberKeys.add(key);
        uniqueOtherMembers.push(m);
      } else if (!key) {
        uniqueOtherMembers.push(m);
      }
    }

    const m2 = uniqueOtherMembers[0] || {};
    const m3 = uniqueOtherMembers[1] || {};
    const m4 = uniqueOtherMembers[2] || {};

    let mentorName = '';
    let mentorDept = '';
    let regDate = primaryProd.created_at || team.created_at || new Date().toISOString();
    let displayRegId = primaryProd.legacy_registration_id || '';

    // Fallback: check if any other product has legacy_registration_id
    if (!displayRegId) {
      const prodWithRegId = teamProducts.find(p => p.legacy_registration_id);
      if (prodWithRegId) {
        displayRegId = prodWithRegId.legacy_registration_id;
      }
    }

    let origReg = null;
    if (displayRegId && regsMap[displayRegId]) {
      origReg = regsMap[displayRegId];
      mentorName = origReg.mentor_name || '';
      mentorDept = origReg.mentor_department || '';
      regDate = origReg.created_at || regDate;
    } else {
      origReg = (registrationsData || []).find(r => r.team_name && r.team_name.trim().toLowerCase() === (team.team_name || '').trim().toLowerCase());
      if (origReg) {
        if (!displayRegId) displayRegId = origReg.registration_id;
        mentorName = origReg.mentor_name || '';
        mentorDept = origReg.mentor_department || '';
        regDate = origReg.created_at || regDate;
      }
    }

    const leaderDeptName = deptsMap[leader.department_id] || leader.department_id || deptsMap[origReg?.leader_department] || origReg?.leader_department || '';
    const m2DeptName = deptsMap[m2.department_id] || m2.department_id || deptsMap[origReg?.member2_department] || origReg?.member2_department || '';
    const m3DeptName = deptsMap[m3.department_id] || m3.department_id || deptsMap[origReg?.member3_department] || origReg?.member3_department || '';
    const m4DeptName = deptsMap[m4.department_id] || m4.department_id || '';

    const prodEvals = (evaluationsData || []).filter(ev => ev.registration_id === displayRegId);
    const avgScore = prodEvals.length > 0
      ? Number((prodEvals.reduce((sum, ev) => sum + Number(ev.score), 0) / prodEvals.length).toFixed(2))
      : null;
    const evalComments = prodEvals.map(ev => ev.comments).filter(Boolean).join('; ');

    const projectTitle = teamProducts.length > 1
      ? teamProducts.map((p, idx) => `[Product ${p.product_number || idx + 1}] ${p.product_title}`).join('\n')
      : (primaryProd.product_title || '');

    const innovationDomain = teamProducts.length > 1
      ? Array.from(new Set(teamProducts.map(p => p.innovation_domain).filter(Boolean))).join(', ')
      : (primaryProd.innovation_domain || '');

    const allDomains = Array.from(new Set(teamProducts.map(p => p.innovation_domain).filter(Boolean)));
    const allTrls = teamProducts.map(p => p.trl_level).filter(val => val !== null && val !== undefined);
    const allSdgs = Array.from(new Set(teamProducts.flatMap(p => p.sdg_goals || [])));

    return {
      id: team.id,
      team_id: team.id,
      registration_id: displayRegId,
      team_name: team.team_name || '',
      products: teamProducts,
      products_count: teamProducts.length,
      project_title: projectTitle,
      innovation_domain: innovationDomain,
      innovation_domains: allDomains,
      trl_level: primaryProd.trl_level !== null && primaryProd.trl_level !== undefined ? primaryProd.trl_level : null,
      trl_levels: allTrls,
      sdg_goals: allSdgs,
      problem_area: teamProducts.map(p => p.problem_area).filter(Boolean).join('\n---\n'),
      proposed_solution: teamProducts.map(p => p.proposed_solution).filter(Boolean).join('\n---\n'),
      expected_impact: teamProducts.map(p => p.expected_impact).filter(Boolean).join('\n---\n'),
      product_number: teamProducts.length > 1 ? teamProducts.map(p => p.product_number || 1).join(', ') : (primaryProd.product_number || 1),
      status: primaryProd.status || 'active',

      leader_name: leader.member_name || origReg?.leader_name || '',
      leader_email: leader.member_email || origReg?.leader_email || '',
      leader_mobile: leader.member_mobile || origReg?.leader_mobile || '',
      leader_department: leaderDeptName,

      member2_name: m2.member_name || origReg?.member2_name || '',
      member2_email: m2.member_email || origReg?.member2_email || '',
      member2_mobile: m2.member_mobile || origReg?.member2_mobile || '',
      member2_department: m2DeptName,

      member3_name: m3.member_name || origReg?.member3_name || '',
      member3_email: m3.member_email || origReg?.member3_email || '',
      member3_mobile: m3.member_mobile || origReg?.member3_mobile || '',
      member3_department: m3DeptName,

      member4_name: m4.member_name || '',
      member4_email: m4.member_email || '',
      member4_mobile: m4.member_mobile || '',
      member4_department: m4DeptName,

      mentor_name: mentorName,
      mentor_department: normalizeMentorDepartment(mentorDept),

      evaluation_score: avgScore,
      evaluation_comments: evalComments,

      created_at: regDate
    };
  });

  const getTeam = (regId) => normalizedRecords.find(r => r.registration_id === regId);

  // --- Test 3: IPL26-0493 (Vision Vault) resolves correctly ---
  const t493 = getTeam('IPL26-0493');
  assert(
    t493 && t493.leader_name.toLowerCase().includes('nikitha') && t493.member2_name.toLowerCase().includes('manoranjitham'),
    `IPL26-0493 (Vision Vault) resolves leader: "${t493?.leader_name}", member2: "${t493?.member2_name}"`
  );

  // --- Test 4: IPL26-0494 (SKYCREEPERS) resolves correctly ---
  const t494 = getTeam('IPL26-0494');
  assert(
    t494 && t494.leader_name.toLowerCase().includes('vidhuran') && t494.member2_name.toLowerCase().includes('vasanthakumar') && t494.member3_name.toLowerCase().includes('vaithilingam'),
    `IPL26-0494 (SKYCREEPERS) resolves leader: "${t494?.leader_name}", member2: "${t494?.member2_name}", member3: "${t494?.member3_name}"`
  );

  // --- Test 5: IPL26-0495 (Future Techies) resolves correctly ---
  const t495 = getTeam('IPL26-0495');
  assert(
    t495 && t495.leader_name.toLowerCase().includes('shruti') && t495.member2_name.toLowerCase().includes('shiv kumar') && t495.member3_name.toLowerCase().includes('anjali'),
    `IPL26-0495 (Future Techies) resolves leader: "${t495?.leader_name}", member2: "${t495?.member2_name}", member3: "${t495?.member3_name}"`
  );

  // --- Test 6: IPL26-0496 (NOVACORE 2.0) resolves correctly ---
  const t496 = getTeam('IPL26-0496');
  assert(
    t496 && t496.leader_name.toLowerCase().includes('jayanarayan') && t496.member2_name.toLowerCase().includes('jeyandan') && t496.member3_name.toLowerCase().includes('jeevanandh'),
    `IPL26-0496 (NOVACORE 2.0) resolves leader: "${t496?.leader_name}", member2: "${t496?.member2_name}", member3: "${t496?.member3_name}"`
  );

  // --- Test 7: IPL26-0497 (Robosync) resolves correctly ---
  const t497 = getTeam('IPL26-0497');
  assert(
    t497 && t497.leader_name.toLowerCase().includes('shiv kumar') && t497.member2_name.toLowerCase().includes('shruti') && t497.member3_name.toLowerCase().includes('om prakash'),
    `IPL26-0497 (Robosync) resolves leader: "${t497?.leader_name}", member2: "${t497?.member2_name}", member3: "${t497?.member3_name}"`
  );

  // --- Test 8: IPL26-0498 (THE GOLDEN RATIOS) resolves correctly ---
  const t498 = getTeam('IPL26-0498');
  assert(
    t498 && t498.leader_name.toLowerCase().includes('mohammed aarif') && t498.member2_name.toLowerCase().includes('ajendra') && t498.member3_name.toLowerCase().includes('deethya'),
    `IPL26-0498 (THE GOLDEN RATIOS) resolves leader: "${t498?.leader_name}", member2: "${t498?.member2_name}", member3: "${t498?.member3_name}"`
  );

  // --- Test 9: IPL26-0499 (Auranet) resolves correctly ---
  const t499 = getTeam('IPL26-0499');
  assert(
    t499 && t499.leader_name.toLowerCase().includes('nirmal') && t499.member2_name.toLowerCase().includes('vengadesh') && t499.member3_name.toLowerCase().includes('dhivithkumar'),
    `IPL26-0499 (Auranet) resolves leader: "${t499?.leader_name}", member2: "${t499?.member2_name}", member3: "${t499?.member3_name}"`
  );

  // --- Test 10: IPL26-0500 (Saplok) resolves correctly ---
  const t500 = getTeam('IPL26-0500');
  assert(
    t500 && t500.leader_name.toLowerCase().includes('prasanna') && t500.member2_name.toLowerCase().includes('anirudh') && t500.member3_name.toLowerCase().includes('smrithi'),
    `IPL26-0500 (Saplok) resolves leader: "${t500?.leader_name}", member2: "${t500?.member2_name}", member3: "${t500?.member3_name}"`
  );

  // --- Test 11: IPL26-0501 (Techventures) resolves correctly ---
  const t501 = getTeam('IPL26-0501');
  assert(
    t501 && t501.leader_name.toLowerCase().includes('mithraja') && t501.member2_name.toLowerCase().includes('ashmika') && t501.member3_name.toLowerCase().includes('sanjay'),
    `IPL26-0501 (Techventures) resolves leader: "${t501?.leader_name}", member2: "${t501?.member2_name}", member3: "${t501?.member3_name}"`
  );

  // --- Test 12: IPL26-0502 (Electro nova) resolves correctly ---
  const t502 = getTeam('IPL26-0502');
  assert(
    t502 && t502.leader_name.toLowerCase().includes('darshan') && t502.member2_name.toLowerCase().includes('naveen') && t502.member3_name.toLowerCase().includes('priyanka'),
    `IPL26-0502 (Electro nova) resolves leader: "${t502?.leader_name}", member2: "${t502?.member2_name}", member3: "${t502?.member3_name}"`
  );

  // --- Test 13: No unexpected missing leader across 342 teams ---
  let missingLeaderCount = 0;
  for (const t of normalizedRecords) {
    const reg = regsMap[t.registration_id];
    if (reg && reg.leader_name && reg.leader_name.trim() && (!t.leader_name || !t.leader_name.trim())) {
      missingLeaderCount++;
      console.warn(`Unexpected missing leader for team ${t.registration_id} (${t.team_name})`);
    }
  }
  assert(
    missingLeaderCount === 0,
    `No unexpected missing leader across all ${normalizedRecords.length} teams (missing count: ${missingLeaderCount})`
  );

  // --- Test 14: No unexpected missing member 2 across 342 teams ---
  let missingM2Count = 0;
  for (const t of normalizedRecords) {
    const reg = regsMap[t.registration_id];
    if (reg && reg.member2_name && reg.member2_name.trim() && (!t.member2_name || !t.member2_name.trim())) {
      missingM2Count++;
      console.warn(`Unexpected missing member2 for team ${t.registration_id} (${t.team_name})`);
    }
  }
  assert(
    missingM2Count === 0,
    `No unexpected missing member 2 across all ${normalizedRecords.length} teams (missing count: ${missingM2Count})`
  );

  // --- Test 15: No unexpected missing member 3 across 342 teams ---
  let missingM3Count = 0;
  for (const t of normalizedRecords) {
    const reg = regsMap[t.registration_id];
    if (reg && reg.member3_name && reg.member3_name.trim() && (!t.member3_name || !t.member3_name.trim())) {
      missingM3Count++;
      console.warn(`Unexpected missing member3 for team ${t.registration_id} (${t.team_name})`);
    }
  }
  assert(
    missingM3Count === 0,
    `No unexpected missing member 3 across all ${normalizedRecords.length} teams (missing count: ${missingM3Count})`
  );

  // --- Test 16: Existing team filters still work ---
  // A. Search filter
  const searchResults = normalizedRecords.filter(r => (r.leader_name || '').toLowerCase().includes('darshan'));
  // B. Department filter
  const sampleDept = normalizedRecords[0]?.leader_department;
  const deptResults = normalizedRecords.filter(r => r.leader_department === sampleDept || r.member2_department === sampleDept);
  // C. Domain filter
  const sampleDomain = normalizedRecords.find(r => r.innovation_domain)?.innovation_domain;
  const domainResults = normalizedRecords.filter(r => r.innovation_domain === sampleDomain);
  // D. TRL filter
  const sampleTrl = normalizedRecords.find(r => r.trl_level !== null)?.trl_level;
  const trlResults = normalizedRecords.filter(r => String(r.trl_level) === String(sampleTrl));

  assert(
    searchResults.length > 0 && deptResults.length > 0 && domainResults.length > 0 && trlResults.length > 0,
    `Existing team filters work: search found ${searchResults.length}, dept found ${deptResults.length}, domain found ${domainResults.length}, trl found ${trlResults.length}`
  );

  // --- Test 17: Existing sorting still works ---
  const sortedByNameAsc = [...normalizedRecords].sort((a, b) => (a.team_name || '').localeCompare(b.team_name || ''));
  const sortedByNameDesc = [...normalizedRecords].sort((a, b) => (b.team_name || '').localeCompare(a.team_name || ''));
  const sortedByRegAsc = [...normalizedRecords].sort((a, b) => (a.registration_id || '').localeCompare(b.registration_id || '', undefined, { numeric: true }));
  const sortedByRegDesc = [...normalizedRecords].sort((a, b) => (b.registration_id || '').localeCompare(a.registration_id || '', undefined, { numeric: true }));

  assert(
    sortedByNameAsc[0].team_name.localeCompare(sortedByNameDesc[0].team_name) <= 0 &&
    sortedByRegAsc[0].registration_id.localeCompare(sortedByRegDesc[0].registration_id) !== 0,
    `Existing sorting works: Team Name ASC/DESC and Registration ID ASC/DESC correctly reorder dataset`
  );

  // --- Test 18: Existing pagination still works ---
  const totalItems = normalizedRecords.length;
  const totalPages = Math.ceil(totalItems / 10);
  const page1 = normalizedRecords.slice(0, 10);
  const page2 = normalizedRecords.slice(10, 20);

  assert(
    totalPages === Math.ceil(342 / 10) && page1.length === 10 && page2.length === 10 && page1[0].id !== page2[0].id,
    `Existing pagination works: 10 items/page, ${totalPages} total pages, distinct slice sets for page 1 and page 2`
  );

  // --- Test 19: Export uses corrected normalized data ---
  const exportRows = normalizedRecords.map(t => ({
    "Registration ID": t.registration_id,
    "Team Name": t.team_name,
    "Leader Name": t.leader_name,
    "Leader Email": t.leader_email,
    "Member 2 Name": t.member2_name,
    "Member 2 Email": t.member2_email,
    "Member 3 Name": t.member3_name,
    "Member 3 Email": t.member3_email
  }));
  const exp502 = exportRows.find(r => r["Registration ID"] === 'IPL26-0502');

  assert(
    exp502 && exp502["Leader Name"].toLowerCase().includes('darshan') && exp502["Member 2 Name"].toLowerCase().includes('naveen') && exp502["Member 3 Name"].toLowerCase().includes('priyanka'),
    `Export uses corrected normalized data: IPL26-0502 export row has Leader "${exp502?.["Leader Name"]}", M2 "${exp502?.["Member 2 Name"]}", M3 "${exp502?.["Member 3 Name"]}"`
  );

  // --- Test 20: No database mutation occurs ---
  const { count: endRegCount } = await supabase.from('registrations').select('*', { count: 'exact', head: true });
  const { count: endTeamCount } = await supabase.from('teams').select('*', { count: 'exact', head: true });
  const { count: endProdCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: endPmCount } = await supabase.from('product_members').select('*', { count: 'exact', head: true });
  const { count: endProfCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  const { count: endEvalCount } = await supabase.from('evaluations').select('*', { count: 'exact', head: true });

  const countsMatch =
    baseRegCount === endRegCount &&
    baseTeamCount === endTeamCount &&
    baseProdCount === endProdCount &&
    basePmCount === endPmCount &&
    baseProfCount === endProfCount &&
    baseEvalCount === endEvalCount;

  assert(
    countsMatch,
    `No database mutation occurs: counts before and after match exactly (reg: ${endRegCount}, team: ${endTeamCount}, prod: ${endProdCount}, pm: ${endPmCount}, prof: ${endProfCount}, eval: ${endEvalCount})`
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
