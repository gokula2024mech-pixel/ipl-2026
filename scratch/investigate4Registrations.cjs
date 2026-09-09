const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function investigate() {
  const teamNames = ['Astros', 'Team Leo Das and Co', 'Idea Igniters', 'Kirmada'];
  const targetIds = ['IPL26-0327', 'IPL26-0328', 'IPL26-0329', 'IPL26-0332'];
  const allEmails = [
    'aathipraveen.a2024leee@sece.ac.in',
    'sukesh.p2024eee@sece.ac.in',
    'dhinakar.am2024leee@sece.ac.in',
    'vishal.r2024eee@sece.ac.in',
    'sriram.s2024eee@sece.ac.in',
    'sivaraman.m2024eee@sece.ac.in',
    'shreemathimalar.m2024mech@sece.ac.in',
    'priyadharshika.t2024mech@sece.ac.in',
    'shanaafrose.cm2024mech@sece.ac.in',
    'prabanjan.sg2024mech@sece.ac.in',
    'kavinprasanth.rs2024mech@sece.ac.in',
    'saisunjay.j2024mech@sece.ac.in'
  ];
  const titles = [
    'PhysioSense',
    'autonomous vehicle',
    'Smart Wheelchair'
  ];

  console.log('=== 1. CHECKING public.teams ===');
  const { data: allTeams } = await supabase.from('teams').select('*');
  console.log('Total teams in public.teams:', allTeams.length);

  teamNames.forEach(name => {
    const directMatches = allTeams.filter(t => 
      t.team_name.toLowerCase().trim() === name.toLowerCase().trim() ||
      (t.normalized_team_name && t.normalized_team_name === name.toLowerCase().replace(/[^a-z0-9]/g, ''))
    );
    const fuzzyMatches = allTeams.filter(t => 
      t.team_name.toLowerCase().includes(name.toLowerCase().slice(0, 5))
    );
    console.log(`Team search for "${name}":`);
    console.log('  Direct match:', directMatches.length > 0 ? directMatches : 'NONE');
    console.log('  Fuzzy match:', fuzzyMatches.length > 0 ? fuzzyMatches.map(t => t.team_name) : 'NONE');
  });

  console.log('\n=== 2. CHECKING public.products ===');
  const { data: allProducts } = await supabase.from('products').select('*');
  console.log('Total products in public.products:', allProducts.length);

  targetIds.forEach(id => {
    const match = allProducts.filter(p => p.legacy_registration_id === id);
    console.log(`Product with legacy_registration_id "${id}":`, match.length > 0 ? match : 'NONE');
  });

  titles.forEach(title => {
    const match = allProducts.filter(p => p.product_title && p.product_title.toLowerCase().includes(title.toLowerCase()));
    console.log(`Product with title like "${title}":`, match.length > 0 ? match.map(p => ({ id: p.id, title: p.product_title, team_id: p.team_id })) : 'NONE');
  });

  console.log('\n=== 3. CHECKING public.product_members ===');
  const { data: allMembers } = await supabase.from('product_members').select('*');
  console.log('Total product_members:', allMembers.length);

  let matchedMembersCount = 0;
  allEmails.forEach(email => {
    const match = allMembers.filter(m => m.member_email && m.member_email.toLowerCase().trim() === email.toLowerCase().trim());
    if (match.length > 0) {
      console.log(`Member found for "${email}":`, match);
      matchedMembersCount++;
    }
  });
  console.log(`Total emails from the 4 registrations found in product_members: ${matchedMembersCount} / ${allEmails.length}`);

  console.log('\n=== 4. CHECKING DUPLICATE/RE-REGISTRATIONS IN public.registrations ===');
  const { data: allRegs } = await supabase.from('registrations').select('*');
  console.log('Total rows in public.registrations:', allRegs.length);

  allEmails.forEach(email => {
    const matches = allRegs.filter(r => !targetIds.includes(r.registration_id) && (
      (r.leader_email && r.leader_email.toLowerCase().trim() === email.toLowerCase().trim()) ||
      (r.member2_email && r.member2_email.toLowerCase().trim() === email.toLowerCase().trim()) ||
      (r.member3_email && r.member3_email.toLowerCase().trim() === email.toLowerCase().trim())
    ));
    if (matches.length > 0) {
      console.log(`Email ${email} was found in ANOTHER registration:`, matches.map(m => ({ id: m.registration_id, team: m.team_name, role: m.leader_email === email ? 'Leader' : 'Member' })));
    }
  });

  teamNames.forEach(tName => {
    const otherTeamMatches = allRegs.filter(r => !targetIds.includes(r.registration_id) && r.team_name && r.team_name.toLowerCase().trim() === tName.toLowerCase().trim());
    if (otherTeamMatches.length > 0) {
      console.log(`Team name "${tName}" found in another registration:`, otherTeamMatches.map(m => m.registration_id));
    }
  });

  console.log('\n=== 5. CHECKING REGISTRATION ID SEQUENCE & TIMESTAMPS ===');
  const surroundingIds = ['IPL26-0325', 'IPL26-0326', 'IPL26-0327', 'IPL26-0328', 'IPL26-0329', 'IPL26-0330', 'IPL26-0331', 'IPL26-0332', 'IPL26-0333', 'IPL26-0334'];
  const surroundingRegs = allRegs.filter(r => surroundingIds.includes(r.registration_id)).sort((a, b) => a.registration_id.localeCompare(b.registration_id));
  surroundingRegs.forEach(r => {
    const inTeams = allTeams.some(t => t.team_name.toLowerCase().trim() === r.team_name.toLowerCase().trim());
    const inProducts = allProducts.some(p => p.legacy_registration_id === r.registration_id);
    console.log(`${r.registration_id} | Team: "${r.team_name}" | Created: ${r.created_at} | In Teams: ${inTeams} | In Products: ${inProducts}`);
  });
}

investigate().catch(console.error);
