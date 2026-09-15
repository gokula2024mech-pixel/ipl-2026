/**
 * STEP 10U-FIX Automated Verification Suite
 * Covers all 16 Part E requirements using native http runner:
 * 1. IPL26-0292 exact corrected email -> Team Debuggers returned
 * 2. IPL26-0292 authenticated Google email (with dot) -> Team Debuggers returned
 * 3. Existing working teammate of IPL26-0292 -> still sees Team Debuggers
 * 4. Affected IPL26-0283 -> correct registration resolves
 * 5. Affected IPL26-0241 -> correct registration resolves
 * 6. Affected IPL26-0247 -> correct registration resolves
 * 7. Affected IPL26-0499 -> correct registration resolves
 * 8. Affected IPL26-0147 -> correct registration resolves
 * 9. Affected IPL26-0136 -> correct registration resolves
 * 10. Existing normally formatted emails -> continue working
 * 11. Unknown @sece.ac.in user -> must NOT receive any team
 * 12. Ambiguous normalized-email match -> must fail safely
 * 13. User from Team A -> cannot access Team B submissions
 * 14. Team Leader permissions remain unchanged (canEdit all slots)
 * 15. Team Member permissions remain unchanged (canEdit only own slot)
 * 16. Existing LinkedIn submission save/edit/remove flow remains unchanged
 * 17. Profile synchronization: unlinked profile is populated, existing profile is preserved
 */

const assert = require('assert');
const path = require('path');
const http = require('http');

process.env.NODE_ENV = 'test';

const projectRoot = path.resolve('e:/collegeProject/ipl-2026');
const backendDir = path.resolve(projectRoot, 'backend');
const backendRequire = (id) => require(path.join(backendDir, 'node_modules', id));
const express = backendRequire('express');

const registrationRoutes = require(path.join(backendDir, 'routes', 'registrationRoutes'));
const { router: phase3Router, isMatchingEmail, phase3LinkedInDriveService } = require(path.join(backendDir, 'routes', 'phase3Routes'));

let passed = 0;
let failed = 0;

function it(desc, condition) {
  if (condition) {
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
    failed++;
  }
}

function makeRequest(app, method, url, body = null, userId = 'user1', email = 'alice@sece.ac.in', role = 'student') {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const parsedUrl = new URL(url, `http://127.0.0.1:${port}`);
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer TEST_TOKEN_${userId}:${email}:${role}`
      };

      const payload = body ? JSON.stringify(body) : null;
      if (payload) {
        headers['Content-Length'] = Buffer.byteLength(payload);
      }

      const req = http.request({
        hostname: '127.0.0.1',
        port: port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: method,
        headers: headers
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          server.close();
          try {
            const json = JSON.parse(data);
            resolve({ status: res.statusCode, body: json });
          } catch (_) {
            resolve({ status: res.statusCode, text: data });
          }
        });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  });
}

async function runTests() {
  console.log('======================================================================');
  console.log('STEP 10U-FIX: EMAIL MISMATCH & RESILIENT RESOLUTION TEST SUITE');
  console.log('======================================================================\n');

  // Set up mock test store with the 7 affected registrations as currently in DB
  const mockStore = {
    registrations: [
      {
        id: 'reg-0292',
        registration_id: 'IPL26-0292',
        team_name: 'Team Debuggers',
        leader_name: 'Niket Kumar',
        leader_email: 'niketkumar2024cse@sece.ac.in', // DB currently has no dot
        leader_department: 'CSE',
        member2_name: 'Ombabu Chaurasiya',
        member2_email: 'ombabuchaurasiya.2024cse@sece.ac.in',
        member2_department: 'CSE',
        member3_name: 'Sagar Kumar Patel',
        member3_email: 'sagarkumarpatel.2024cse@sece.ac.in',
        member3_department: 'CSE'
      },
      {
        id: 'reg-0283',
        registration_id: 'IPL26-0283',
        team_name: 'Hacktivators',
        leader_name: 'Vaanathi J',
        leader_email: 'vaanathi.j2025cse@sece.ac.in',
        member2_name: 'Shobika.s',
        member2_email: 'shobika.s2025cse@sece.ac.in',
        member3_name: 'Sethukamal.P.G',
        member3_email: 'sethukamal.p.g2025cse@sece.ac.in'
      },
      {
        id: 'reg-0241',
        registration_id: 'IPL26-0241',
        team_name: 'Team brute force',
        leader_name: 'Bikram Patel',
        leader_email: 'bikrampatel.2025cse@sece.ac.in',
        member2_name: 'Md jabed akhtar',
        member2_email: 'jabedakhtarmd.2025cse@sece.ac.in',
        member3_name: 'Kishore R',
        member3_email: 'kishoreramakrishnan2025cse@sece.ac.in'
      },
      {
        id: 'reg-0247',
        registration_id: 'IPL26-0247',
        team_name: 'QUANTUM CODERS',
        leader_name: 'AADHIDHYA',
        leader_email: 'aadhidhya.s2025aiml@sece.ac.in',
        member2_name: 'ABIARASAN K.M',
        member2_email: 'abiarasan.k.m2025aiml@sece.ac.in',
        member3_name: 'Dharaneesh.M',
        member3_email: 'dharaneesh.m2025aiml@sece.ac.in'
      },
      {
        id: 'reg-0499',
        registration_id: 'IPL26-0499',
        team_name: 'Auranet',
        leader_name: 'NIRMAL S',
        leader_email: 'nirmal.s2023csbs@sece.ac.in',
        member2_name: 'Vengadesh P',
        member2_email: 'vengadesh.p2023csbs@sece.ac.in',
        member3_name: 'Dhivithkumar R',
        member3_email: 'dhivithkumar2023csbs@sece.ac.in'
      },
      {
        id: 'reg-0147',
        registration_id: 'IPL26-0147',
        team_name: 'WhiteWakers',
        leader_name: 'Dharaneesh Y',
        leader_email: 'dharaneesh.y2024lit@sece.ac.in',
        member2_name: 'Vasanthan S',
        member2_email: 'vasanthan.s2024lit@sece.ac.in',
        member3_name: 'Mohamed Adhil A',
        member3_email: 'mohamedadhil.2024lit@sece.ac.in'
      },
      {
        id: 'reg-0136',
        registration_id: 'IPL26-0136',
        team_name: 'ZeroBugs',
        leader_name: 'Jegashree A',
        leader_email: 'jegashree.a2025cse@sece.ac.in',
        member2_name: 'Harinisri S',
        member2_email: 'harinisri.s2025cse@sece.ac.in',
        member3_name: 'Mogitha Gowri Sankar',
        member3_email: 'mogithagowrisankar2025cse@sece.ac.in'
      },
      {
        id: 'reg-0090',
        registration_id: 'IPL26-0090',
        team_name: 'Innovators',
        leader_name: 'Devadharsini S',
        leader_email: 'devadharsini.s2024cse@sece.ac.in',
        member2_name: 'Member Two',
        member2_email: 'member2.2024cse@sece.ac.in'
      },
      // Ambiguous candidate pair for Test 12
      {
        id: 'reg-ambig1',
        registration_id: 'IPL26-AMB1',
        team_name: 'Ambiguous Alpha',
        leader_email: 'johndoe.2024cse@sece.ac.in'
      },
      {
        id: 'reg-ambig2',
        registration_id: 'IPL26-AMB2',
        team_name: 'Ambiguous Beta',
        leader_email: 'john.doe2024cse@sece.ac.in'
      }
    ],
    teams: [
      { id: 'team-0292', team_name: 'Team Debuggers', normalized_team_name: 'team debuggers' },
      { id: 'team-0283', team_name: 'Hacktivators', normalized_team_name: 'hacktivators' },
      { id: 'team-0241', team_name: 'Team brute force', normalized_team_name: 'team brute force' },
      { id: 'team-0247', team_name: 'QUANTUM CODERS', normalized_team_name: 'quantum coders' },
      { id: 'team-0499', team_name: 'Auranet', normalized_team_name: 'auranet' },
      { id: 'team-0147', team_name: 'WhiteWakers', normalized_team_name: 'whitewakers' },
      { id: 'team-0136', team_name: 'ZeroBugs', normalized_team_name: 'zerobugs' },
      { id: 'team-0090', team_name: 'Innovators', normalized_team_name: 'innovators' }
    ],
    products: [
      { id: 'prod-0292', team_id: 'team-0292', legacy_registration_id: 'IPL26-0292', product_number: 1, product_title: 'RideAlert' },
      { id: 'prod-0090', team_id: 'team-0090', legacy_registration_id: 'IPL26-0090', product_number: 1, product_title: 'Smart Solar' }
    ],
    product_members: [
      { id: 'pm-0292-l', product_id: 'prod-0292', member_email: 'niketkumar2024cse@sece.ac.in', role: 'Team Leader' },
      { id: 'pm-0292-m2', product_id: 'prod-0292', member_email: 'ombabuchaurasiya.2024cse@sece.ac.in', role: 'Team Member' }
    ],
    profiles: [
      { user_id: 'user-niket', email: 'niketkumar.2024cse@sece.ac.in', registration_id: null },
      { user_id: 'user-ombabu', email: 'ombabuchaurasiya.2024cse@sece.ac.in', registration_id: 'IPL26-0292' },
      { user_id: 'user-deva', email: 'devadharsini.s2024cse@sece.ac.in', registration_id: 'IPL26-0090' }
    ],
    linkedin_submissions: []
  };

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.testStore = mockStore;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.includes('TEST_TOKEN_')) {
      const parts = authHeader.replace('Bearer TEST_TOKEN_', '').split(':');
      const [uid, uemail, urole] = parts;
      req.user = { id: uid, email: uemail, user_metadata: { role: urole } };
    }
    next();
  });

  app.use('/api', registrationRoutes);
  app.use('/api/phase3', phase3Router);

  // Test 1: IPL26-0292 exact corrected email -> Team Debuggers returned
  {
    const res = await makeRequest(app, 'GET', '/api/my-submissions', null, 'user-niket-exact', 'niketkumar2024cse@sece.ac.in');
    it('Test 1: Status 200 returned for exact email', res.status === 200);
    it('Test 1: Exactly 1 submission returned for exact email', res.body?.submissions?.length === 1);
    it('Test 1: registrationId is IPL26-0292', res.body?.submissions?.[0]?.registrationId === 'IPL26-0292');
    it('Test 1: Team name is Team Debuggers', res.body?.submissions?.[0]?.teamName === 'Team Debuggers');
    it('Test 1: userRole is Team Leader', res.body?.submissions?.[0]?.userRole === 'Team Leader');
  }

  // Test 2: IPL26-0292 authenticated Google email (with dot) -> Team Debuggers returned
  {
    const res = await makeRequest(app, 'GET', '/api/my-submissions', null, 'user-niket', 'niketkumar.2024cse@sece.ac.in');
    it('Test 2: Status 200 returned for Google Auth dot email', res.status === 200);
    it('Test 2: Resolves IPL26-0292 for Google Auth dot email', res.body?.submissions?.[0]?.registrationId === 'IPL26-0292');
    it('Test 2: Correctly assigns Team Leader role despite dot difference', res.body?.submissions?.[0]?.userRole === 'Team Leader');
  }

  // Test 3: Existing working teammate of IPL26-0292 -> still sees Team Debuggers
  {
    const res = await makeRequest(app, 'GET', '/api/my-submissions', null, 'user-ombabu', 'ombabuchaurasiya.2024cse@sece.ac.in');
    it('Test 3: Teammate status 200 returned', res.status === 200);
    it('Test 3: Teammate sees IPL26-0292', res.body?.submissions?.[0]?.registrationId === 'IPL26-0292');
    it('Test 3: Teammate has role Member', res.body?.submissions?.[0]?.userRole === 'Member');
  }

  // Test 4: Affected IPL26-0283 -> correct registration resolves
  {
    const res = await makeRequest(app, 'GET', '/api/my-submissions', null, 'user-0283', 'sethukamal.pg2025cse@sece.ac.in');
    it('Test 4: IPL26-0283 resolves for sethukamal.pg2025cse@sece.ac.in', res.body?.submissions?.[0]?.registrationId === 'IPL26-0283');
  }

  // Test 5: Affected IPL26-0241 -> correct registration resolves
  {
    const res = await makeRequest(app, 'GET', '/api/my-submissions', null, 'user-0241', 'jabedakhtar.md2025cse@sece.ac.in');
    it('Test 5: IPL26-0241 resolves for jabedakhtar.md2025cse@sece.ac.in', res.body?.submissions?.[0]?.registrationId === 'IPL26-0241');
  }

  // Test 6: Affected IPL26-0247 -> correct registration resolves
  {
    const res = await makeRequest(app, 'GET', '/api/my-submissions', null, 'user-0247', 'abiarasan.km2025aiml@sece.ac.in');
    it('Test 6: IPL26-0247 resolves for abiarasan.km2025aiml@sece.ac.in', res.body?.submissions?.[0]?.registrationId === 'IPL26-0247');
  }

  // Test 7: Affected IPL26-0499 -> correct registration resolves
  {
    const res = await makeRequest(app, 'GET', '/api/my-submissions', null, 'user-0499', 'dhivithkumar.2023csbs@sece.ac.in');
    it('Test 7: IPL26-0499 resolves for dhivithkumar.2023csbs@sece.ac.in', res.body?.submissions?.[0]?.registrationId === 'IPL26-0499');
  }

  // Test 8: Affected IPL26-0147 -> correct registration resolves
  {
    const res = await makeRequest(app, 'GET', '/api/my-submissions', null, 'user-0147', 'mohamedadhil2024lit@sece.ac.in');
    it('Test 8: IPL26-0147 resolves for mohamedadhil2024lit@sece.ac.in', res.body?.submissions?.[0]?.registrationId === 'IPL26-0147');
  }

  // Test 9: Affected IPL26-0136 -> correct registration resolves
  {
    const res = await makeRequest(app, 'GET', '/api/my-submissions', null, 'user-0136', 'mogithagowrisankar.2025cse@sece.ac.in');
    it('Test 9: IPL26-0136 resolves for mogithagowrisankar.2025cse@sece.ac.in', res.body?.submissions?.[0]?.registrationId === 'IPL26-0136');
  }

  // Test 10: Existing normally formatted emails -> continue working
  {
    const res = await makeRequest(app, 'GET', '/api/my-submissions', null, 'user-deva', 'devadharsini.s2024cse@sece.ac.in');
    it('Test 10: Normal email resolves IPL26-0090', res.body?.submissions?.[0]?.registrationId === 'IPL26-0090');
    it('Test 10: Normal email resolves Team Leader role', res.body?.submissions?.[0]?.userRole === 'Team Leader');
  }

  // Test 11: Unknown @sece.ac.in user -> must NOT receive any team
  {
    const res = await makeRequest(app, 'GET', '/api/my-submissions', null, 'user-unknown', 'unknownstudent.2024cse@sece.ac.in');
    it('Test 11: Unknown SECE user receives empty submissions []', res.body?.submissions?.length === 0);
  }

  // Test 12: Ambiguous normalized-email match -> must fail safely
  {
    const res = await makeRequest(app, 'GET', '/api/my-submissions', null, 'user-ambig', 'johndoe2024cse@sece.ac.in');
    it('Test 12: Ambiguous dot-match candidate fails safely without guessing (submissions [])', res.body?.submissions?.length === 0);
  }

  // Test 13: User from Team A -> cannot access Team B submissions in Phase 3
  {
    const res = await makeRequest(app, 'GET', '/api/phase3/status?teamId=team-0090&registrationId=IPL26-0090', null, 'user-niket', 'niketkumar.2024cse@sece.ac.in');
    it('Test 13: Team A member accessing Team B receives 403 FORBIDDEN', res.status === 403);
    it('Test 13: Error code is FORBIDDEN', res.body?.error_code === 'FORBIDDEN');
  }

  // Test 14: Team Leader permissions remain unchanged (canEdit all slots)
  {
    const res = await makeRequest(app, 'GET', '/api/phase3/status?teamId=team-0292&registrationId=IPL26-0292', null, 'user-niket', 'niketkumar.2024cse@sece.ac.in');
    it('Test 14: Team Leader Phase 3 status returns 200', res.status === 200);
    it('Test 14: Leader can edit leader slot', res.body?.canEdit?.leader === true);
    it('Test 14: Leader can edit member1 slot', res.body?.canEdit?.member1 === true);
    it('Test 14: Leader can edit member2 slot', res.body?.canEdit?.member2 === true);
  }

  // Test 15: Team Member permissions remain unchanged (canEdit only own slot)
  {
    const res = await makeRequest(app, 'GET', '/api/phase3/status?teamId=team-0292&registrationId=IPL26-0292', null, 'user-ombabu', 'ombabuchaurasiya.2024cse@sece.ac.in');
    it('Test 15: Member 1 Phase 3 status returns 200', res.status === 200);
    it('Test 15: Member 1 cannot edit leader slot', res.body?.canEdit?.leader === false);
    it('Test 15: Member 1 CAN edit member1 slot', res.body?.canEdit?.member1 === true);
    it('Test 15: Member 1 cannot edit member2 slot', res.body?.canEdit?.member2 === false);
  }

  // Test 16: Existing LinkedIn submission save/edit/remove flow remains unchanged
  {
    // Populate mock drive sheet with the team row so save & remove can update it
    phase3LinkedInDriveService.setMockStoreForTesting([
      {
        registration_id: 'IPL26-0292',
        team_id: 'team-0292',
        team_name: 'Team Debuggers',
        leader_name: 'Niket Kumar',
        leader_email: 'niketkumar.2024cse@sece.ac.in',
        leader_linkedin_post_link: ''
      }
    ]);

    // Save
    const saveRes = await makeRequest(
      app,
      'POST',
      '/api/phase3/linkedin-submission',
      {
        teamId: 'team-0292',
        registrationId: 'IPL26-0292',
        role: 'leader',
        linkedin_post_url: 'https://www.linkedin.com/posts/activity-7235284619385'
      },
      'user-niket',
      'niketkumar.2024cse@sece.ac.in'
    );

    it('Test 16A: Save LinkedIn submission succeeds (200)', saveRes.status === 200);
    it('Test 16A: Save success flag is true', saveRes.body?.success === true);

    // Remove
    const removeRes = await makeRequest(
      app,
      'DELETE',
      '/api/phase3/linkedin-submission',
      {
        teamId: 'team-0292',
        registrationId: 'IPL26-0292',
        role: 'leader'
      },
      'user-niket',
      'niketkumar.2024cse@sece.ac.in'
    );

    it('Test 16B: Remove LinkedIn submission succeeds (200)', removeRes.status === 200);
    it('Test 16B: Remove success flag is true', removeRes.body?.success === true);
  }

  // Test 17: Profile synchronization check
  {
    const niketProf = mockStore.profiles.find(p => p.user_id === 'user-niket');
    it('Test 17: Niket profile was synchronized to IPL26-0292', niketProf?.registration_id === 'IPL26-0292');

    const devaProf = mockStore.profiles.find(p => p.user_id === 'user-deva');
    it('Test 17: Existing valid registration_id on Deva profile is preserved', devaProf?.registration_id === 'IPL26-0090');
  }

  console.log('\n======================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
