// scratch/dryRunMigration.cjs
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

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CANONICAL_DEPARTMENTS = [
  'Artificial Intelligence and Data Science',
  'Artificial Intelligence and Machine Learning',
  'Computer and Communication Engineering',
  'Computer Science and Business System',
  'Computer Science and Engineering',
  'Cyber Security',
  'Electrical and Electronics Engineering',
  'Electronics and Communication Engineering',
  'Information Technology',
  'Mechanical Engineering'
];

async function checkProfiles() {
  const { data: { users }, error: userErr } = await s.auth.admin.listUsers({ perPage: 1000 });
  if (userErr) {
    console.error('listUsers error:', userErr);
    return;
  }
  const usersWithDept = users.filter(u => u.user_metadata && u.user_metadata.department);
  const userIds = usersWithDept.map(u => u.id);

  console.log('DRY-RUN DEPARTMENT MIGRATION REPORT:');
  console.log('========================================================================================');
  console.log('EMAIL / USER_ID / AUTH_DEPARTMENT / PROFILE_DEPARTMENT / ACTION');
  console.log('========================================================================================');

  for (const id of userIds) {
    const { data: userRes } = await s.auth.admin.getUserById(id);
    const { data: prof } = await s.from('profiles').select('*').eq('user_id', id).maybeSingle();
    const email = userRes?.user?.email || 'unknown';
    const authDept = userRes?.user?.user_metadata?.department || null;
    const profileDept = prof?.department || null;
    const isValid = CANONICAL_DEPARTMENTS.includes(authDept);

    let action = 'MIGRATE';
    if (!prof) {
      action = 'NO_PROFILE';
    } else if (!authDept) {
      action = 'NO_DEPARTMENT';
    } else if (!isValid) {
      action = 'INVALID_DEPARTMENT';
    } else if (profileDept) {
      action = 'ALREADY_SET';
    }

    console.log(`${email} / ${id} / "${authDept}" / ${profileDept ? `"${profileDept}"` : 'NULL'} / ${action}`);
  }
  console.log('========================================================================================');
}

checkProfiles().catch(console.error);
