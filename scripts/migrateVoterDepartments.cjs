// scripts/migrateVoterDepartments.cjs
// Utility script to verify profiles.department column and migrate departments from auth.users raw_user_meta_data
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from backend/.env
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

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('--- Step 1: Check if public.profiles.department column exists ---');
  const { data: testCol, error: testErr } = await supabase
    .from('profiles')
    .select('department')
    .limit(1);

  if (testErr && testErr.code === '42703') {
    console.log('Column public.profiles.department DOES NOT exist yet in Supabase.');
    console.log('Please execute profiles_department_migration.sql in the Supabase Dashboard -> SQL Editor first.');
    return;
  } else if (testErr) {
    console.error('Error checking column:', testErr.message);
    return;
  }

  console.log('Column public.profiles.department is present.');

  console.log('\n--- Step 2: Fetch users with department in auth.users ---');
  const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersErr) {
    console.error('Failed to list auth users:', usersErr.message);
    return;
  }

  const usersWithDept = (users || []).filter(u => u.user_metadata?.department);
  console.log(`Found ${usersWithDept.length} users with department in auth user_metadata:`);
  usersWithDept.forEach(u => console.log(`  - ${u.email}: "${u.user_metadata.department}"`));

  let migratedCount = 0;
  for (const u of usersWithDept) {
    const dept = u.user_metadata.department.trim();
    console.log(`\nMigrating: ${u.email} -> "${dept}"`);

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ department: dept, updated_at: new Date().toISOString() })
      .eq('user_id', u.id);

    if (updateErr) {
      console.warn(`  Failed to update profile for ${u.email}:`, updateErr.message);
    } else {
      migratedCount++;
      console.log(`  Successfully updated profile for ${u.email}`);
    }
  }

  console.log(`\n--- Step 3: Verification ---`);
  console.log(`Successfully migrated ${migratedCount} profiles.`);

  const { data: verifiedProfiles } = await supabase
    .from('profiles')
    .select('user_id, email, name, department')
    .not('department', 'is', null);

  console.log('Profiles with department populated:', verifiedProfiles);
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
});
