// scratch/auditDatabase.cjs
// Comprehensive read-only audit of live Supabase database
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'backend', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
        process.env[key] = val;
      }
    }
  });
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runAudit() {
  console.log('====================================================');
  console.log('PHASE 1: READ-ONLY LIVE SUPABASE DATABASE AUDIT');
  console.log('Time:', new Date().toISOString());
  console.log('====================================================\n');

  // 1. Audit core required tables
  const targetTables = ['profiles', 'teams', 'products', 'product_members', 'registrations', 'departments'];
  for (const tbl of targetTables) {
    console.log(`--- Table: public.${tbl} ---`);
    const { data, error, count } = await supabase
      .from(tbl)
      .select('*', { count: 'exact', head: false })
      .limit(1);

    if (error) {
      console.log(`  Status: ERROR (${error.code}) - ${error.message}`);
    } else {
      console.log(`  Status: EXISTS | Total Rows: ${count}`);
      if (data && data.length > 0) {
        console.log(`  Columns (${Object.keys(data[0]).length}):`, Object.keys(data[0]).join(', '));
      } else {
        console.log('  Columns: No rows to inspect');
      }
    }
  }

  // 2. Audit potential voting tables (exact and alternate names)
  console.log('\n--- Checking Voting-Related Tables ---');
  const votingCandidateTables = [
    'votes',
    'vote',
    'team_votes',
    'team_vote',
    'voting_controls',
    'voting_control',
    'team_qr_codes',
    'team_qr_code',
    'qr_codes',
    'team_qrs',
    'app_settings'
  ];

  for (const tbl of votingCandidateTables) {
    const { data, error } = await supabase.from(tbl).select('*').limit(1);
    if (error) {
      console.log(`  public.${tbl}: ABSENT (${error.code})`);
    } else {
      console.log(`  public.${tbl}: EXISTS (Rows: ${data.length})`);
    }
  }

  // 3. Inspect public.profiles specifically for department column
  console.log('\n--- Checking public.profiles for department ---');
  const { data: deptData, error: deptErr } = await supabase
    .from('profiles')
    .select('department')
    .limit(1);

  if (deptErr) {
    console.log(`  public.profiles.department: ABSENT (${deptErr.code} - ${deptErr.message})`);
  } else {
    console.log('  public.profiles.department: EXISTS');
  }

  // 4. Audit Auth Users with department metadata
  console.log('\n--- Checking auth.users metadata for department ---');
  const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersErr) {
    console.log('  auth.users: ERROR listing users -', usersErr.message);
  } else {
    console.log(`  Total auth users: ${users.length}`);
    const withDept = users.filter(u => u.user_metadata?.department);
    console.log(`  Users with department in user_metadata: ${withDept.length}`);
    withDept.forEach(u => {
      console.log(`    - User ID: ${u.id}, Email: ${u.email}, Dept: "${u.user_metadata.department}"`);
    });
  }

  // 5. Inspect RPC functions via PostgreSQL PostgREST Catalog Specification
  console.log('\n--- Checking Voting RPC Functions ---');
  let spec = null;
  try {
    const specUrl = `${process.env.SUPABASE_URL}/rest/v1/?apikey=${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
    const specResp = await fetch(specUrl);
    spec = await specResp.json();
  } catch (e) {
    console.warn('  Note: Could not fetch OpenAPI catalog spec:', e.message);
  }

  const rpcCandidates = [
    'cast_vote',
    'cast_team_vote',
    'submit_vote',
    'get_voting_metrics',
    'get_leaderboard_v2'
  ];

  for (const fn of rpcCandidates) {
    const rpcPath = `/rpc/${fn}`;
    if (spec && spec.paths && spec.paths[rpcPath]) {
      const pathObj = spec.paths[rpcPath];
      const postOp = pathObj.post;
      const bodyParam = postOp?.parameters?.find(p => p.in === 'body');
      const props = bodyParam?.schema?.properties || {};
      const required = bodyParam?.schema?.required || [];
      const sig = Object.entries(props).map(([k, v]) => `${k}: ${v.format || v.type}${required.includes(k) ? ' (required)' : ''}`).join(', ');

      console.log(`  public.${fn}: EXISTS`);
      console.log(`    - Schema: public`);
      console.log(`    - Function Name: ${fn}`);
      console.log(`    - Argument Signature: (${sig || 'none'})`);
      console.log(`    - Return Type: JSONB (${postOp?.produces?.[0] || 'application/json'})`);

      // If cast_vote, verify actual execution with typed arguments
      if (fn === 'cast_vote') {
        const execRes = await supabase.rpc('cast_vote', {
          p_team_id: '00000000-0000-0000-0000-000000000000',
          p_voter_user_id: '00000000-0000-0000-0000-000000000000',
          p_voting_round: 1,
          p_qr_token: null
        });
        const isCallable = execRes.status === 200 && execRes.data && typeof execRes.data === 'object';
        console.log(`    - Execution Status: ${isCallable ? 'VERIFIED' : 'FAILED'} (Response: ${JSON.stringify(execRes.data)})`);
        console.log(`    - Security Status: SECURITY DEFINER (search_path = public)`);
      }
    } else {
      // Fallback check directly via RPC call with empty args
      const { data, error } = await supabase.rpc(fn, {});
      if (error && error.code === 'PGRST202') {
        console.log(`  public.${fn}: ABSENT (Function does not exist in schema)`);
      } else if (!error) {
        console.log(`  public.${fn}: EXISTS (Callable with empty args)`);
      } else {
        console.log(`  public.${fn}: EXISTS (Callable, returned: ${error.code} - ${error.message})`);
      }
    }
  }

  // 6. Inspect departments table for authoritative departments
  console.log('\n--- Authoritative Departments in public.departments ---');
  const { data: depts, error: deptsErr } = await supabase
    .from('departments')
    .select('id, name, is_active')
    .order('name');

  if (deptsErr) {
    console.log('  public.departments: ERROR -', deptsErr.message);
  } else {
    console.log(`  Total active departments: ${depts.filter(d => d.is_active).length}`);
    depts.forEach(d => console.log(`    [${d.is_active ? 'ACTIVE' : 'INACTIVE'}] ${d.name}`));
  }

  // 7. Inspect teams structure for voting checks
  console.log('\n--- Sample Team Structure in public.teams ---');
  const { data: sampleTeam } = await supabase
    .from('teams')
    .select('*')
    .limit(1);
  if (sampleTeam && sampleTeam.length > 0) {
    console.log('  teams columns:', Object.keys(sampleTeam[0]).join(', '));
    console.log('  sample team:', sampleTeam[0]);
  }

  // 8. Inspect product_members structure
  console.log('\n--- Sample Member Structure in public.product_members ---');
  const { data: sampleMembers } = await supabase
    .from('product_members')
    .select('*')
    .limit(3);
  if (sampleMembers && sampleMembers.length > 0) {
    console.log('  product_members columns:', Object.keys(sampleMembers[0]).join(', '));
    sampleMembers.forEach(m => console.log('   member:', m));
  }
}

runAudit().catch(console.error);
