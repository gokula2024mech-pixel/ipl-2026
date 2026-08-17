const express = require('express')
const http = require('http')
const registrationRoutes = require('./routes/registrationRoutes')

const app = express()
app.use(express.json())
app.use('/api', registrationRoutes)

async function runValidationTests() {
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, resolve))
  const port = server.address().port
  const baseUrl = `http://localhost:${port}`

  console.log('================================')
  console.log(`API Validation Tests running on ${baseUrl}`)
  console.log('================================')

  let passed = 0
  let total = 0

  function assert(condition, message) {
    total++
    if (condition) {
      console.log(`  ✅ PASS: ${message}`)
      passed++
    } else {
      console.error(`  ❌ FAIL: ${message}`)
    }
  }

  try {
    // 1. Health check
    const resHealth = await fetch(`${baseUrl}/api/health`)
    const dataHealth = await resHealth.json()
    assert(resHealth.status === 200 || resHealth.status === 503, `GET /api/health returned ${resHealth.status}`)

    // Helper for base valid payload
    const getValidPayload = (overrides = {}) => Object.assign({
      email: 'team@sece.ac.in',
      teamName: 'Innovators 2026',
      teamLeaderName: 'Leader Name',
      teamLeaderEmail: 'leader@sece.ac.in',
      teamLeaderMobile: '9876543210',
      teamLeaderDepartment: 'Mechanical Department',
      member2Name: 'Member 2',
      member2Email: 'member2@sece.ac.in',
      member2Mobile: '8765432109',
      member2Department: 'Mechanical Department',
      member3Name: 'Member 3',
      member3Email: 'member3@sece.ac.in',
      member3Mobile: '7654321098',
      member3Department: 'Mechanical Department',
      facultyMentorName: 'Dr. Mentor',
      facultyMentorDepartment: 'Mechanical Department',
      innovationDomain: 'AI & Machine Learning',
      projectTitle: 'Smart Robot',
      problemArea: 'Manual labor',
      proposedSolution: 'Automate',
      expectedImpact: 'High efficiency',
      declarationAccepted: true,
    }, overrides)

    // 2. Test invalid email: student@gmail.com
    const resGmail = await fetch(`${baseUrl}/api/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getValidPayload({ email: 'student@gmail.com' })),
    })
    const dataGmail = await resGmail.json()
    assert(resGmail.status === 400 && dataGmail.message.includes('sece.ac.in'), 'student@gmail.com rejected with HTTP 400')

    // 3. Test invalid email: student@yahoo.com
    const resYahoo = await fetch(`${baseUrl}/api/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getValidPayload({ teamLeaderEmail: 'student@yahoo.com' })),
    })
    const dataYahoo = await resYahoo.json()
    assert(resYahoo.status === 400 && dataYahoo.message.includes('sece.ac.in'), 'student@yahoo.com rejected with HTTP 400')

    // 4. Test invalid mobile: 1234567890 (starts with 1)
    const resMobile1 = await fetch(`${baseUrl}/api/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getValidPayload({ teamLeaderMobile: '1234567890' })),
    })
    const dataMobile1 = await resMobile1.json()
    assert(resMobile1.status === 400 && dataMobile1.message.includes('mobile'), 'Mobile 1234567890 rejected with HTTP 400')

    // 5. Test invalid mobile: 987654321 (9 digits)
    const resMobile9 = await fetch(`${baseUrl}/api/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getValidPayload({ member2Mobile: '987654321' })),
    })
    const dataMobile9 = await resMobile9.json()
    assert(resMobile9.status === 400 && dataMobile9.message.includes('mobile'), '9-digit mobile 987654321 rejected with HTTP 400')

    // 6. Test invalid mobile: 98765432101 (11 digits)
    const resMobile11 = await fetch(`${baseUrl}/api/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getValidPayload({ member3Mobile: '98765432101' })),
    })
    const dataMobile11 = await resMobile11.json()
    assert(resMobile11.status === 400 && dataMobile11.message.includes('mobile'), '11-digit mobile 98765432101 rejected with HTTP 400')

    // 7. Test invalid mobile: +919876543210
    const resMobilePlus91 = await fetch(`${baseUrl}/api/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getValidPayload({ teamLeaderMobile: '+919876543210' })),
    })
    const dataMobilePlus91 = await resMobilePlus91.json()
    assert(resMobilePlus91.status === 400 && dataMobilePlus91.message.includes('mobile'), '+919876543210 mobile rejected with HTTP 400')

    console.log('================================')
    console.log(`Passed ${passed} / ${total} validation tests successfully.`)
    console.log('================================')
  } catch (err) {
    console.error('Test execution error:', err)
  } finally {
    server.close()
  }
}

runValidationTests()
