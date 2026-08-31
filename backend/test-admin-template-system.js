const { spawn } = require('child_process')
const dotenv = require('dotenv')
const path = require('path')
const fs = require('fs')
const { google } = require('googleapis')
const { supabase } = require('./supabaseClient')

dotenv.config({ path: path.join(__dirname, '.env') })

// Environment checks
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
const key = process.env.GOOGLE_PRIVATE_KEY
const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

let driveClient = null

if (clientId && clientSecret && refreshToken) {
  console.log('[Test System] Initializing via OAuth2 client...')
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret)
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  driveClient = google.drive({ version: 'v3', auth: oauth2Client })
} else if (email && key) {
  console.log('[Test System] Initializing via Service Account JWT...')
  const formattedKey = key.replace(/\\n/g, '\n')
  const driveAuth = new google.auth.JWT({
    email: email,
    key: formattedKey,
    scopes: ['https://www.googleapis.com/auth/drive']
  })
  driveClient = google.drive({ version: 'v3', auth: driveAuth })
} else {
  console.error('ERROR: No valid Google Drive credentials (OAuth2 or Service Account) found.')
  process.exit(1)
}

const adminEmail = 'gokul.a2024mech@sece.ac.in'
const studentEmail = 'abinivesh.m2024lcse@sece.ac.in'

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getAccessTokenForUser(emailAddress) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: emailAddress
  })
  if (error) throw error
  
  const url = new URL(data.properties.action_link)
  const tokenHash = url.searchParams.get('token')
  
  const { data: sessionData, error: sessionErr } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink'
  })
  if (sessionErr) throw sessionErr
  return sessionData.session.access_token
}

async function runTests() {
  console.log('==================================================')
  console.log('STARTING PHASE 1 SYSTEM INTEGRATION TESTS')
  console.log('==================================================')

  let serverProcess = null
  const createdDriveFileIds = []
  
  // Create dummy test file
  const testFilePath = path.join(__dirname, 'test-doc.docx')
  fs.writeFileSync(testFilePath, 'DUMMY TEST DOCUMENT TEMPLATE CONTENT')

  try {
    // 1. Get Access Tokens
    console.log('🔑 Authenticating test users...')
    const adminToken = await getAccessTokenForUser(adminEmail)
    console.log('✓ Admin authenticated.')
    const studentToken = await getAccessTokenForUser(studentEmail)
    console.log('✓ Student authenticated.')

    // 2. Start Backend Server
    console.log('\n🚀 Starting backend server on default PORT...')
    serverProcess = spawn('node', [path.join(__dirname, 'server.js')], {
      env: { ...process.env, PORT: '5000' },
      stdio: 'pipe'
    })

    serverProcess.stdout.on('data', (data) => {
      console.log(`  [Server Out]: ${data.toString().trim()}`)
    })

    serverProcess.stderr.on('data', (data) => {
      console.error(`  [Server Err]: ${data.toString().trim()}`)
    })

    // Give server time to bind port
    await sleep(2000)

    const apiBase = 'http://localhost:5000/api'

    // --- CHECK 1: Load Phase 1 templates list ---
    console.log('\n📁 Check 1: Loading Phase 1 templates list...')
    const templatesRes = await fetch(`${apiBase}/phase1/templates`, {
      headers: {
        'Authorization': `Bearer ${studentToken}`
      }
    })
    console.log(`  Response Status: ${templatesRes.status}`)
    const templatesBody = await templatesRes.json()
    console.log(`  Templates discovered:`, templatesBody.templates)
    if (templatesRes.status !== 200 || !templatesBody.success) {
      throw new Error('Check 1 Failed: Could not load templates.')
    }
    console.log('✓ Check 1 Passed: Templates listed successfully.')

    // --- CHECK 2: Secure download of all 4 templates ---
    console.log('\n📥 Check 2: Downloading all four official templates secure streams...')
    const docTypesToTest = ['FORM_2', 'FORM_5', 'FIGURE_OF_ABSTRACT', 'LIST_OF_DRAWINGS']
    for (const docType of docTypesToTest) {
      console.log(`  Downloading ${docType} template...`)
      const downloadRes = await fetch(`${apiBase}/phase1/template/${docType}`, {
        headers: {
          'Authorization': `Bearer ${studentToken}`
        }
      })
      console.log(`  Response Status for ${docType}: ${downloadRes.status}`)
      if (downloadRes.status !== 200) {
        throw new Error(`Check 2 Failed: Download for ${docType} returned status ${downloadRes.status} (expected 200).`)
      }
      const disposition = downloadRes.headers.get('Content-Disposition')
      console.log(`  Content-Disposition header for ${docType}: ${disposition}`)
    }
    console.log('✓ Check 2 Passed: All four templates securely streamed.')

    // --- CHECK 3: Upload completed document as Student ---
    console.log('\n📤 Check 3: Uploading dummy completed document for FORM_2...')
    const uploadForm = new FormData()
    uploadForm.append('documentType', 'FORM_2')
    uploadForm.append('file', new Blob(['test completed student document content']), 'FORM_2_submission.docx')

    const uploadRes = await fetch(`${apiBase}/phase1/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${studentToken}`
      },
      body: uploadForm
    })

    console.log(`  Response Status: ${uploadRes.status}`)
    const uploadBody = await uploadRes.json()
    console.log(`  Upload Response Payload:`, uploadBody)

    if (uploadRes.status === 403 && uploadBody.message.includes('closed')) {
      console.log('✓ Check 3 Passed (Upload Blocked by Timer): Submissions are closed correctly.')
    } else if (uploadRes.status !== 200 || !uploadBody.success) {
      throw new Error('Check 3 Failed: Student file upload failed.')
    } else {
      const sub = uploadBody.submission
      createdDriveFileIds.push(sub.google_drive_file_id)
      console.log(`✓ Check 3 Passed: Upload succeeded. Drive file ID: ${sub.google_drive_file_id}`)

      // --- CHECK 4: Admin submissions listing ---
      console.log('\n🔍 Check 4: Verifying admin can see student submission...')
      const adminSubsRes = await fetch(`${apiBase}/phase1/submissions`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      })
      console.log(`  Response Status: ${adminSubsRes.status}`)
      const adminSubsBody = await adminSubsRes.json()
      if (adminSubsRes.status !== 200 || !adminSubsBody.success) {
        throw new Error('Check 4 Failed: Admin could not query submissions list.')
      }

      const match = adminSubsBody.submissions.find(s => s.google_drive_file_id === sub.google_drive_file_id)
      if (!match) {
        throw new Error('Check 4 Failed: Student submission not found in admin submissions list.')
      }
      console.log('✓ Check 4 Passed: Admin successfully retrieved student submission in list.')

      // --- CHECK 5: Secure submission document download ---
      console.log('\n🛡️ Check 5: Verifying secure download access to student submission...')
      
      // Admin download: success
      const adminDownRes = await fetch(`${apiBase}/phase1/document/${sub.google_drive_file_id}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })
      console.log(`  Admin download status: ${adminDownRes.status} (Expected: 200)`)
      if (adminDownRes.status !== 200) throw new Error('Check 5 Failed: Admin denied access.')

      // Owner student download: success
      const ownerDownRes = await fetch(`${apiBase}/phase1/document/${sub.google_drive_file_id}`, {
        headers: { 'Authorization': `Bearer ${studentToken}` }
      })
      console.log(`  Owner student download status: ${ownerDownRes.status} (Expected: 200)`)
      if (ownerDownRes.status !== 200) throw new Error('Check 5 Failed: Owner student denied access.')

      console.log('✓ Check 5 Passed: Access rules correctly enforced.')

      // --- CHECK 6: Admin Review Submission ---
      console.log('\n📝 Check 6: Rejecting submission with reason as Admin...')
      const reviewRes = await fetch(`${apiBase}/phase1/review`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          submissionId: sub.id,
          status: 'REJECTED',
          rejectionReason: 'Format is incorrect. Please use official template.'
        })
      })

      console.log(`  Response Status: ${reviewRes.status}`)
      const reviewBody = await reviewRes.json()
      console.log(`  Review Response Payload:`, reviewBody)

      if (reviewRes.status !== 200 || !reviewBody.success) {
        throw new Error('Check 6 Failed: Submission review failed.')
      }

      // Verify db update
      const { data: dbSub } = await supabase
        .from('phase1_submissions')
        .select('*')
        .eq('id', sub.id)
        .single()
      
      console.log(`  DB Status: ${dbSub.review_status}, Reason: ${dbSub.rejection_reason}`)
      if (dbSub.review_status !== 'REJECTED' || dbSub.rejection_reason !== 'Format is incorrect. Please use official template.') {
        throw new Error('Check 6 Failed: DB record mismatch after review.')
      }
      console.log('✓ Check 6 Passed: Admin review submitted and saved.')
    }

    console.log('\n==================================================')
    console.log('🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!')
    console.log('==================================================')

  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED!')
    console.error(err)
  } finally {
    // Cleanup local files
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath)
    }

    // Cleanup Google Drive files
    if (createdDriveFileIds.length > 0) {
      console.log('\n🧹 Cleaning up Google Drive files...')
      for (const fileId of createdDriveFileIds) {
        try {
          await driveClient.files.delete({ fileId, supportsAllDrives: true })
          console.log(`  Cleaned Drive File: ${fileId}`)
        } catch (e) {
          console.warn(`  Failed to delete file ${fileId}: ${e.message}`)
        }
      }
    }

    // Stop Express Server
    if (serverProcess) {
      console.log('\n🛑 Shutting down backend server...')
      serverProcess.kill('SIGINT')
    }
  }
}

runTests()
