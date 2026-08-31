const express = require('express')
const router = express.Router()

const multer = require('multer')
const path = require('path')
const { Readable } = require('stream')
const { google } = require('googleapis')
const { supabase } = require('../supabaseClient')

// Configure Multer for in-memory file handling (max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
})

// Initialize Google Drive API Client
const dotenv = require('dotenv')
dotenv.config({ path: path.join(__dirname, '../.env') })

let driveClient = null
const parentFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || process.env.IPL_PHASE1_GOOGLE_DRIVE_FOLDER_ID || '11qARJIKCPNhn4mCwe-5X2OeLJYl2x0g5'

try {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  let privateKey = process.env.GOOGLE_PRIVATE_KEY
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (clientId && clientSecret && refreshToken) {
    console.log('[Google Drive Router Init] Initializing via OAuth2 client...')
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret)
    oauth2Client.setCredentials({ refresh_token: refreshToken })
    driveClient = google.drive({ version: 'v3', auth: oauth2Client })
    console.log('[Google Drive] OAuth2 Client initialized successfully.')
  } else if (serviceAccountEmail && privateKey) {
    console.log('[Google Drive Router Init] Initializing via Service Account JWT... email:', serviceAccountEmail)
    // Handle escaped newlines in env variables
    privateKey = privateKey.replace(/\\n/g, '\n')

    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/drive']
    })

    driveClient = google.drive({ version: 'v3', auth })
    console.log('[Google Drive] Service Account Client initialized successfully.')
  } else {
    console.warn('[Google Drive] Client disabled: No valid credentials (OAuth2 or Service Account) configured.')
  }
} catch (err) {
  console.error('[Google Drive] Initialization error:', err.message)
}

// Allowed extensions for Phase 1 documents
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx']
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]

// ------------------------------------------------------------------
// GOOGLE DRIVE HELPERS
// ------------------------------------------------------------------

async function getOrCreateTemplatesFolder() {
  if (!driveClient) throw new Error('Google Drive integration is unconfigured.')

  const response = await driveClient.files.list({
    q: `name = 'Templates' and mimeType = 'application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed = false`,
    fields: 'files(id)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  })

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id
  }

  const folderMetadata = {
    name: 'Templates',
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentFolderId]
  }

  const folder = await driveClient.files.create({
    resource: folderMetadata,
    fields: 'id',
    supportsAllDrives: true
  })

  return folder.data.id
}

async function discoverTemplatesFromDrive() {
  if (!driveClient) throw new Error('Google Drive integration is unconfigured.')

  const templatesFolderId = process.env.GOOGLE_DRIVE_TEMPLATES_FOLDER_ID || process.env.IPL_PHASE1_TEMPLATES_FOLDER_ID || '11B9SnNRH7v1f9W1HZkDVCtNwt9Y5Mm6p'

  const response = await driveClient.files.list({
    q: `'${templatesFolderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, mimeType)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  })

  const files = response.data.files || []

  return files.map(f => {
    let docType = 'OTHER'
    if (/form\s*[-_]?\s*2/i.test(f.name) || /grant/i.test(f.name)) docType = 'FORM_2'
    else if (/form\s*[-_]?\s*5/i.test(f.name) || /declaration/i.test(f.name)) docType = 'FORM_5'
    else if (/abstract/i.test(f.name)) docType = 'FIGURE_OF_ABSTRACT'
    else if (/drawing/i.test(f.name)) docType = 'LIST_OF_DRAWINGS'
    else docType = f.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()

    return {
      id: f.id,
      document_type: docType,
      template_name: f.name.replace(/\.[^/.]+$/, ''),
      filename: f.name,
      google_drive_file_id: f.id,
      mimeType: f.mimeType
    }
  })
}

async function getOrCreateTeamFolder(registrationId) {
  if (!driveClient) throw new Error('Google Drive integration is unconfigured.')

  const folderName = `TEAM-${registrationId}`

  const response = await driveClient.files.list({
    q: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed = false`,
    fields: 'files(id)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  })

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id
  }

  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentFolderId]
  }

  const folder = await driveClient.files.create({
    resource: folderMetadata,
    fields: 'id',
    supportsAllDrives: true
  })

  return folder.data.id
}

async function uploadFileToFolder(folderId, driveFileName, file) {
  if (!driveClient) throw new Error('Google Drive integration is unconfigured.')

  const mediaStream = new Readable()
  mediaStream.push(file.buffer)
  mediaStream.push(null)

  const fileMetadata = {
    name: driveFileName,
    parents: [folderId]
  }

  const media = {
    mimeType: file.mimetype,
    body: mediaStream
  }

  const response = await driveClient.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, name, webViewLink',
    supportsAllDrives: true
  })

  return response.data
}

// ------------------------------------------------------------------
// AUTH & ROUTE CONTROLLERS
// ------------------------------------------------------------------

// Shared Auth middleware checking token validity
async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required. Token is missing.' })
  }

  const token = authHeader.split(' ')[1]
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session.' })
  }

  req.user = user
  next()
}

// Check Phase 1 Running State
async function checkPhase1Active(req, res, next) {
  try {
    const { data: phase, error } = await supabase
      .from('phases')
      .select('timer_status')
      .eq('phase_number', 1)
      .maybeSingle()

    if (error || !phase || phase.timer_status !== 'running') {
      return res.status(403).json({ success: false, message: 'Phase 1 submissions are currently closed.' })
    }
    next()
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to verify phase availability: ' + err.message })
  }
}

// Check if user has admin role
async function checkAdmin(req, res, next) {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', req.user.id)
      .maybeSingle()

    if (error || !profile || profile.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Administrator privileges required.' })
    }
    next()
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Authorization error: ' + err.message })
  }
}

// Authorization check for registration_id
async function isAuthorizedForRegistration(userId, userEmail, registrationId) {
  // Check if admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  if (profile && profile.role === 'admin') {
    return true
  }

  // Check registration row matching user email
  const cleanEmail = (userEmail || '').toLowerCase().trim()
  if (!cleanEmail) return false

  const { data: reg } = await supabase
    .from('registrations')
    .select('*')
    .eq('registration_id', registrationId)
    .maybeSingle()

  if (!reg) return false

  const isLeader = (reg.leader_email || '').toLowerCase().trim() === cleanEmail
  const isM2 = (reg.member2_email || '').toLowerCase().trim() === cleanEmail
  const isM3 = (reg.member3_email || '').toLowerCase().trim() === cleanEmail
  const isM4 = (reg.member4_email || '').toLowerCase().trim() === cleanEmail

  if (isLeader || isM2 || isM3 || isM4) {
    return true
  }

  return false
}

// ------------------------------------------------------------------
// API ENDPOINTS
// ------------------------------------------------------------------

// 1. GET /api/phase1/template/:documentType
// Download official template file from Google Drive
router.get('/phase1/template/:documentType', authenticateUser, async (req, res) => {
  try {
    if (!driveClient) {
      return res.status(503).json({ success: false, message: 'Google Drive integration is unconfigured.' })
    }

    const { documentType } = req.params
    if (!['FORM_2', 'FORM_5', 'FIGURE_OF_ABSTRACT', 'LIST_OF_DRAWINGS'].includes(documentType)) {
      return res.status(400).json({ success: false, message: 'Invalid document type.' })
    }

    const templates = await discoverTemplatesFromDrive()
    const target = templates.find(t => t.document_type === documentType)

    if (!target) {
      return res.status(404).json({ success: false, message: `Template for ${documentType} not found in Google Drive.` })
    }

    const fileId = target.google_drive_file_id
    const filename = target.filename

    // Stream document from Google Drive
    const driveResponse = await driveClient.files.get(
      { fileId: fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    )

    res.setHeader('Content-Type', driveResponse.headers['content-type'] || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    driveResponse.data
      .on('error', err => {
        console.error('[Drive Stream Error]:', err.message)
        if (!res.headersSent) {
          res.status(500).send('Error streaming document')
        }
      })
      .pipe(res)
  } catch (err) {
    console.error('[Template Download Error]:', err.message)
    return res.status(500).json({ success: false, message: 'Template streaming failed: ' + err.message })
  }
})

// 2. POST /api/phase1/upload
// Student upload of completed document template
router.post('/phase1/upload', authenticateUser, checkPhase1Active, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        success: false,
        message: err.message || 'File upload error'
      })
    }

    try {
      const { documentType } = req.body
      const file = req.file

      if (!documentType || !['FORM_2', 'FORM_5', 'FIGURE_OF_ABSTRACT', 'LIST_OF_DRAWINGS'].includes(documentType)) {
        return res.status(400).json({ success: false, message: 'Invalid or missing document type.' })
      }
      if (!file) {
        return res.status(400).json({ success: false, message: 'File is required.' })
      }

      // Check extensions
      const ext = path.extname(file.originalname).toLowerCase()
      const mime = (file.mimetype || '').toLowerCase()
      if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_MIME_TYPES.includes(mime)) {
        return res.status(400).json({ success: false, message: 'Unsupported file type.' })
      }

      // Resolve target registration_id
      let registrationId = req.body.registrationId || req.query.registrationId
      if (!registrationId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('registration_id')
          .eq('user_id', req.user.id)
          .maybeSingle()
        registrationId = profile?.registration_id
      }

      if (!registrationId) {
        return res.status(403).json({ success: false, message: 'User is not linked to any registered team.' })
      }

      // Verify authorization
      const authorized = await isAuthorizedForRegistration(req.user.id, req.user.email, registrationId)
      if (!authorized) {
        return res.status(403).json({ success: false, message: 'Access Denied: You are not authorized for this team registration.' })
      }

      // Resolve registered team details
      const { data: reg, error: regErr } = await supabase
        .from('registrations')
        .select('*')
        .eq('registration_id', registrationId)
        .maybeSingle()

      if (regErr || !reg) {
        return res.status(404).json({ success: false, message: 'Team registration record not found.' })
      }

      // Get team_id from teams table by matching normalized name
      const { data: team, error: teamErr } = await supabase
        .from('teams')
        .select('*')
        .eq('normalized_team_name', reg.team_name.toLowerCase().trim())
        .maybeSingle()

      if (teamErr || !team) {
        return res.status(404).json({ success: false, message: 'Team record not found.' })
      }

      // Check if existing document submission status prevents update
      const { data: currentSub } = await supabase
        .from('phase1_submissions')
        .select('review_status')
        .eq('team_id', team.id)
        .eq('document_type', documentType)
        .maybeSingle()

      if (currentSub && (currentSub.review_status === 'APPROVED' || currentSub.review_status === 'UNDER_REVIEW')) {
        return res.status(403).json({
          success: false,
          message: `Cannot replace document. Current status is ${currentSub.review_status}.`
        })
      }

      const templateVersionUsed = 1

      // Search or create team Google Drive folder
      const teamFolderId = await getOrCreateTeamFolder(registrationId)

      // Upload file to Drive. Drive filename is sanitized and static: e.g. "FORM_2.pdf"
      const driveFileName = `${documentType}${ext}`

      // Retrieve previous file ID to delete it later
      const { data: oldSub } = await supabase
        .from('phase1_submissions')
        .select('google_drive_file_id')
        .eq('team_id', team.id)
        .eq('document_type', documentType)
        .maybeSingle()

      // Upload the new file first
      const driveFile = await uploadFileToFolder(teamFolderId, driveFileName, file)

      if (!driveFile || !driveFile.id) {
        throw new Error('Google Drive file upload failed.')
      }

      // Update/Upsert metadata database record
      const { data: submission, error: insErr } = await supabase
        .from('phase1_submissions')
        .upsert({
          team_id: team.id,
          registration_id: registrationId,
          team_name: reg.team_name,
          document_type: documentType,
          original_filename: file.originalname,
          google_drive_file_id: driveFile.id,
          google_drive_folder_id: teamFolderId,
          uploaded_by: req.user.email,
          uploaded_at: new Date().toISOString(),
          review_status: 'UPLOADED',
          rejection_reason: null,
          template_version_used: templateVersionUsed,
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (insErr) {
        // If DB update fails, attempt to clean up the newly uploaded file to avoid orphaned files in Drive
        try {
          await driveClient.files.delete({ fileId: driveFile.id, supportsAllDrives: true })
        } catch (e) {}
        throw new Error('Failed to record submission metadata: ' + insErr.message)
      }

      // Confirm upload success and DB save. Now delete previous file safely.
      if (oldSub && oldSub.google_drive_file_id && oldSub.google_drive_file_id !== driveFile.id) {
        try {
          await driveClient.files.delete({ fileId: oldSub.google_drive_file_id, supportsAllDrives: true })
        } catch (delErr) {
          console.warn('[Google Drive] Old file cleanup error:', delErr.message)
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Document uploaded successfully.',
        submission
      })
    } catch (err) {
      console.error('[Student Upload Error]:', err.message)
      return res.status(500).json({ success: false, message: err.message })
    }
  })
})

// 3. GET /api/phase1/submissions
// Retrieve Phase 1 submissions
router.get('/phase1/submissions', authenticateUser, async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, registration_id')
      .eq('user_id', req.user.id)
      .maybeSingle()

    const isAdmin = profile?.role === 'admin'

    let registrationId = req.query.registrationId
    if (!registrationId) {
      registrationId = profile?.registration_id
    }

    if (isAdmin && !req.query.registrationId) {
      // Admin sees all submissions when no specific registration is requested
      const { data: submissions, error } = await supabase
        .from('phase1_submissions')
        .select('*')
        .order('uploaded_at', { ascending: false })

      if (error) throw error
      return res.status(200).json({ success: true, submissions })
    } else {
      if (!registrationId) {
        return res.status(200).json({ success: true, submissions: [] })
      }

      // Verify authorization
      const authorized = await isAuthorizedForRegistration(req.user.id, req.user.email, registrationId)
      if (!authorized) {
        return res.status(403).json({ success: false, message: 'Access Denied: You are not authorized for this team.' })
      }

      const { data: submissions, error } = await supabase
        .from('phase1_submissions')
        .select('*')
        .eq('registration_id', registrationId)

      if (error) throw error
      return res.status(200).json({ success: true, submissions })
    }
  } catch (err) {
    console.error('[Fetch Submissions Error]:', err.message)
    return res.status(500).json({ success: false, message: 'Database error retrieving submissions.' })
  }
})

// 4. GET /api/phase1/templates
// Retrieve list of currently active official templates
router.get('/phase1/templates', authenticateUser, async (req, res) => {
  try {
    const templates = await discoverTemplatesFromDrive()
    return res.status(200).json({ success: true, templates })
  } catch (err) {
    console.error('[Fetch Templates Error]:', err.message)
    return res.status(500).json({ success: false, message: 'Failed to retrieve templates: ' + err.message })
  }
})

// 5. GET /api/phase1/document/:fileId
// Stream secure document from Google Drive
router.get('/phase1/document/:fileId', authenticateUser, async (req, res) => {
  try {
    if (!driveClient) {
      return res.status(503).json({ success: false, message: 'Google Drive integration is unconfigured.' })
    }

    const fileId = req.params.fileId

    // 2. Locate document source to check ownership and retrieve filename
    let filename = 'document'
    let isAuthorized = false

    // Is it a template?
    const templates = await discoverTemplatesFromDrive()
    const template = templates.find(t => t.google_drive_file_id === fileId)

    if (template) {
      isAuthorized = true
      filename = template.filename
    } else {
      // Is it a student submission?
      const { data: submission } = await supabase
        .from('phase1_submissions')
        .select('registration_id, original_filename')
        .eq('google_drive_file_id', fileId)
        .maybeSingle()

      if (submission) {
        filename = submission.original_filename
        const authorized = await isAuthorizedForRegistration(req.user.id, req.user.email, submission.registration_id)
        if (authorized) {
          isAuthorized = true
        }
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Access Denied.' })
    }

    // 3. Stream document from Google Drive
    const driveResponse = await driveClient.files.get(
      { fileId: fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    )

    res.setHeader('Content-Type', driveResponse.headers['content-type'] || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    driveResponse.data
      .on('error', err => {
        console.error('[Drive Stream Error]:', err.message)
        if (!res.headersSent) {
          res.status(500).send('Error streaming document')
        }
      })
      .pipe(res)
  } catch (err) {
    console.error('[Document Fetch Error]:', err.message)
    return res.status(500).json({ success: false, message: 'Document streaming failed.' })
  }
})

// 6. POST /api/phase1/review
// Review document submission (APPROVED / REJECTED)
router.post('/phase1/review', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const { submissionId, status, rejectionReason } = req.body

    if (!submissionId || !status || !['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Missing or invalid parameters.' })
    }
    if (status === 'REJECTED' && (!rejectionReason || !rejectionReason.trim())) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' })
    }

    const { data: submission, error: fetchErr } = await supabase
      .from('phase1_submissions')
      .select('*')
      .eq('id', submissionId)
      .maybeSingle()

    if (fetchErr || !submission) {
      return res.status(404).json({ success: false, message: 'Submission not found.' })
    }

    const updateFields = {
      review_status: status,
      rejection_reason: status === 'REJECTED' ? rejectionReason.trim() : null,
      reviewed_by: req.user.email,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { error: updErr } = await supabase
      .from('phase1_submissions')
      .update(updateFields)
      .eq('id', submissionId)

    if (updErr) {
      throw updErr
    }

    return res.status(200).json({
      success: true,
      message: `Submission marked as ${status}.`
    })
  } catch (err) {
    console.error('[Review Error]:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update review state.' });
  }
});

// GET active products' innovation domains, TRLs, and timestamps (bypasses client-side RLS)
router.get('/leaderboard-domains', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('team_id, innovation_domain, trl_level, created_at, id')
      .eq('status', 'active');
    if (error) {
      throw error;
    }
    return res.status(200).json({
      success: true,
      data: data || []
    });
  } catch (err) {
    console.error('[leaderboard-domains API Error]:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to query active products data.' });
  }
});

module.exports = router
