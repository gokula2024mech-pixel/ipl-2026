const express = require('express')
const router = express.Router()

const multer = require('multer')
const path = require('path')
const fs = require('fs')
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
      let effectiveDocType = documentType;
      let { data: submission, error: insErr } = await supabase
        .from('phase1_submissions')
        .upsert({
          team_id: team.id,
          registration_id: registrationId,
          team_name: reg.team_name,
          document_type: effectiveDocType,
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

      if (insErr && (insErr.code === '23514' || insErr.message?.includes('chk_submission_document_type'))) {
        if (documentType === 'NOVELTY_FORM') effectiveDocType = 'FORM_2';
        else if (documentType === 'REPRESENTATION_SHEET') effectiveDocType = 'FORM_5';
        else effectiveDocType = 'FORM_2';

        const retry = await supabase
          .from('phase1_submissions')
          .upsert({
            team_id: team.id,
            registration_id: registrationId,
            team_name: reg.team_name,
            document_type: effectiveDocType,
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
          .single();
        submission = retry.data;
        insErr = retry.error;
      }

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

      // Reset team decision to PENDING so new upload is queued for admin review
      try {
        const localDecs = readLocalDecisions();
        localDecs[registrationId] = {
          status: 'PENDING',
          adminComment: null,
          reviewedBy: null,
          reviewedAt: null,
          decisionSeen: false
        };
        writeLocalDecisions(localDecs);
      } catch (cacheErr) {
        console.warn('[Upload Decision Cache Warning]:', cacheErr.message);
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

// ------------------------------------------------------------------
// ADMIN SUBMISSIONS REVIEW CENTER ENDPOINTS
// ------------------------------------------------------------------

const DECISIONS_CONFIG_PATH = path.join(__dirname, '..', 'config', 'team_decisions.json');

function readLocalDecisions() {
  try {
    if (fs.existsSync(DECISIONS_CONFIG_PATH)) {
      const raw = fs.readFileSync(DECISIONS_CONFIG_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[Team Decisions] Local read error:', e.message);
  }
  return {};
}

function writeLocalDecisions(decisions) {
  try {
    const dir = path.dirname(DECISIONS_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DECISIONS_CONFIG_PATH, JSON.stringify(decisions, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Team Decisions] Local write error:', e.message);
  }
}

// 7. GET /api/phase1/admin/submissions
// Aggregated team submissions query for Admin Review Center
router.get('/phase1/admin/submissions', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const {
      status = 'PENDING',
      search = '',
      patentType = 'ALL',
      department = 'ALL',
      domain = 'ALL',
      mentor = 'ALL',
      trl = 'ALL',
      dateFilter = 'ALL',
      startDate = '',
      endDate = ''
    } = req.query;

    // 1. Fetch all documents from phase1_submissions
    const { data: subs, error: subsErr } = await supabase
      .from('phase1_submissions')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (subsErr) throw subsErr;

    const allSubs = subs || [];
    // Prune orphaned decisions for registrations with 0 submitted documents
    try {
      const currentDecisions = readLocalDecisions();
      const activeIds = new Set(allSubs.map(s => s.registration_id).filter(Boolean));
      let modified = false;
      for (const regId of Object.keys(currentDecisions)) {
        if (!activeIds.has(regId)) {
          delete currentDecisions[regId];
          modified = true;
        }
      }
      if (modified) {
        writeLocalDecisions(currentDecisions);
      }
    } catch (cleanErr) {
      console.warn('[Admin Submissions] Decision pruning warning:', cleanErr.message);
    }

    if (allSubs.length === 0) {
      return res.status(200).json({
        success: true,
        counts: { pending: 0, approved: 0, rejected: 0, total: 0 },
        submissions: []
      });
    }

    // 2. Extract unique registration IDs
    const regIds = [...new Set(allSubs.map(s => s.registration_id).filter(Boolean))];

    // 3. Fetch matching registrations & products
    const [regsResult, prodsResult] = await Promise.all([
      supabase
        .from('registrations')
        .select('*')
        .in('registration_id', regIds),
      supabase
        .from('products')
        .select('*')
        .in('legacy_registration_id', regIds)
    ]);

    const registrations = regsResult.data || [];
    const products = prodsResult.data || [];
    const localDecisions = readLocalDecisions();

    // Canonical templates for Utility vs Design
    const UTILITY_TEMPLATES = [
      { name: 'Abstract_for_Product.docx', type: 'FIGURE_OF_ABSTRACT' },
      { name: 'Declaration_Form.docx', type: 'FORM_5' },
      { name: 'Grant_Form.docx', type: 'FORM_2' },
      { name: 'List_of_Drawing.docx', type: 'LIST_OF_DRAWINGS' }
    ];
    const DESIGN_TEMPLATES = [
      { name: 'Novelty_Form.docx', type: 'NOVELTY_FORM' },
      { name: 'Representation_Sheet.docx', type: 'REPRESENTATION_SHEET' }
    ];

    // 4. Aggregate by team registration
    const teamSubmissions = regIds.map(regId => {
      const teamDocs = allSubs.filter(s => s.registration_id === regId);
      const reg = registrations.find(r => r.registration_id === regId);
      const prod = products.find(p => p.legacy_registration_id === regId || (reg && p.team_id === reg.id));
      const localDec = localDecisions[regId];

      // Detect Patent Type
      let detectedPatentType = 'Utility Patent';
      if (teamDocs.some(d => (d.original_filename && /novelty|representation/i.test(d.original_filename)) || d.patent_type === 'Design Patent')) {
        detectedPatentType = 'Design Patent';
      }

      // Compute aggregate review status
      let finalStatus = 'PENDING';
      if (localDec && localDec.status) {
        finalStatus = localDec.status;
      } else {
        const hasRejected = teamDocs.some(d => d.review_status === 'REJECTED');
        const allApproved = teamDocs.length > 0 && teamDocs.every(d => d.review_status === 'APPROVED');
        if (hasRejected) finalStatus = 'REJECTED';
        else if (allApproved) finalStatus = 'APPROVED';
        else finalStatus = 'PENDING';
      }

      // Admin Comment & Reviewer Metadata ONLY if status is APPROVED or REJECTED
      let comment = null;
      let finalReviewedBy = null;
      let finalReviewedAt = null;

      if (finalStatus === 'APPROVED' || finalStatus === 'REJECTED') {
        comment = (localDec && localDec.adminComment !== undefined)
          ? localDec.adminComment
          : (teamDocs.find(d => d.admin_comment)?.admin_comment ||
             (finalStatus === 'REJECTED' ? teamDocs.find(d => d.rejection_reason)?.rejection_reason : null) ||
             null);
        finalReviewedBy = localDec?.reviewedBy || teamDocs.find(d => d.reviewed_by)?.reviewed_by || null;
        finalReviewedAt = localDec?.reviewedAt || teamDocs.find(d => d.reviewed_at)?.reviewed_at || null;
      }

      // Decision Seen
      const decisionSeen = localDec ? !!localDec.decisionSeen : teamDocs.every(d => d.decision_seen === true);

      // Assemble document checklist based on patent type
      const expectedTemplates = detectedPatentType === 'Design Patent' ? DESIGN_TEMPLATES : UTILITY_TEMPLATES;
      const docs = expectedTemplates.map((tmpl, index) => {
        // Find if this team uploaded a file matching this template type or filename
        const match = teamDocs.find(d => {
          const docTypeNorm = (d.document_type || '').toUpperCase();
          const fileNorm = (d.original_filename || '').toLowerCase();
          const tmplNameNorm = tmpl.name.replace(/\.[^/.]+$/, '').toLowerCase();
          return docTypeNorm === tmpl.type || fileNorm.includes(tmplNameNorm);
        });

        if (match) {
          return {
            id: match.id,
            slotNumber: String(index + 1).padStart(2, '0'),
            name: match.original_filename || tmpl.name,
            templateName: tmpl.name,
            documentType: match.document_type,
            status: 'SUBMITTED',
            fileId: match.google_drive_file_id,
            webViewLink: match.google_drive_file_id
              ? `https://drive.google.com/file/d/${match.google_drive_file_id}/view`
              : null,
            uploadedAt: match.uploaded_at
          };
        } else {
          return {
            id: `missing-${regId}-${tmpl.type}`,
            slotNumber: String(index + 1).padStart(2, '0'),
            name: tmpl.name,
            templateName: tmpl.name,
            documentType: tmpl.type,
            status: 'NOT SUBMITTED',
            fileId: null,
            webViewLink: null,
            uploadedAt: null
          };
        }
      });

      // Also append any extra documents uploaded that didn't match canonical slots
      teamDocs.forEach((d, extraIdx) => {
        const alreadyIncluded = docs.some(doc => doc.id === d.id);
        if (!alreadyIncluded) {
          docs.push({
            id: d.id,
            slotNumber: String(docs.length + 1).padStart(2, '0'),
            name: d.original_filename,
            templateName: d.original_filename,
            documentType: d.document_type,
            status: 'SUBMITTED',
            fileId: d.google_drive_file_id,
            webViewLink: d.google_drive_file_id
              ? `https://drive.google.com/file/d/${d.google_drive_file_id}/view`
              : null,
            uploadedAt: d.uploaded_at
          });
        }
      });

      // Resolve mentor
      const mentorObj = {
        name: reg?.mentor_name || 'Unassigned',
        department: reg?.mentor_department || reg?.leader_department || 'General'
      };

      // Resolve team members
      const membersObj = {
        leader: {
          name: reg?.leader_name || 'N/A',
          email: reg?.leader_email || '',
          phone: reg?.leader_mobile || '',
          department: reg?.leader_department || ''
        },
        member2: reg?.member2_name ? {
          name: reg?.member2_name,
          email: reg?.member2_email || '',
          phone: reg?.member2_mobile || '',
          department: reg?.member2_department || ''
        } : null,
        member3: reg?.member3_name ? {
          name: reg?.member3_name,
          email: reg?.member3_email || '',
          phone: reg?.member3_mobile || '',
          department: reg?.member3_department || ''
        } : null,
        member4: reg?.member4_name ? {
          name: reg?.member4_name,
          email: reg?.member4_email || '',
          phone: reg?.member4_mobile || '',
          department: reg?.member4_department || ''
        } : null
      };

      // Earliest and latest upload timestamps
      const dates = teamDocs.map(d => new Date(d.uploaded_at).getTime()).filter(t => !isNaN(t));
      const latestDate = dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : new Date().toISOString();

      return {
        id: regId,
        teamId: regId,
        dbTeamId: teamDocs[0]?.team_id || null,
        teamName: reg?.team_name || teamDocs[0]?.team_name || 'Unnamed Team',
        productTitle: prod?.product_title || reg?.project_title || 'Untitled Project',
        innovationDomain: prod?.innovation_domain || reg?.innovation_domain || 'General',
        department: reg?.leader_department || 'General',
        patentType: detectedPatentType,
        category: teamDocs[0]?.category || (detectedPatentType === 'Design Patent' ? 'Hardware' : 'Hardware'),
        trl: Number(prod?.trl_level || reg?.trl_level || 3),
        mentor: mentorObj,
        members: membersObj,
        problemArea: prod?.problem_area || reg?.problem_area || '',
        proposedSolution: prod?.proposed_solution || reg?.proposed_solution || '',
        expectedImpact: prod?.expected_impact || reg?.expected_impact || '',
        submissionDate: latestDate,
        status: finalStatus, // 'PENDING' | 'APPROVED' | 'REJECTED'
        adminComment: comment,
        reviewedBy: finalReviewedBy,
        reviewedAt: finalReviewedAt,
        decisionSeen: decisionSeen,
        documents: docs
      };
    });

    // 5. Calculate global status counts
    const pendingCount = teamSubmissions.filter(s => s.status === 'PENDING').length;
    const approvedCount = teamSubmissions.filter(s => s.status === 'APPROVED').length;
    const rejectedCount = teamSubmissions.filter(s => s.status === 'REJECTED').length;

    // 6. Apply filters
    let filtered = teamSubmissions;

    // Status filter
    if (status && status !== 'ALL') {
      const cleanStatus = status.trim().toUpperCase();
      filtered = filtered.filter(s => s.status === cleanStatus);
    }

    // Patent Type filter
    if (patentType && patentType !== 'ALL') {
      filtered = filtered.filter(s => s.patentType.toLowerCase() === patentType.toLowerCase());
    }

    // Department filter
    if (department && department !== 'ALL') {
      filtered = filtered.filter(s => (s.department || '').toLowerCase() === department.toLowerCase());
    }

    // Innovation Domain filter
    if (domain && domain !== 'ALL') {
      filtered = filtered.filter(s => (s.innovationDomain || '').toLowerCase() === domain.toLowerCase());
    }

    // Mentor filter
    if (mentor && mentor !== 'ALL') {
      filtered = filtered.filter(s => (s.mentor?.name || '').toLowerCase() === mentor.toLowerCase());
    }

    // TRL filter
    if (trl && trl !== 'ALL') {
      const targetTrl = Number(trl);
      if (!isNaN(targetTrl)) {
        filtered = filtered.filter(s => s.trl === targetTrl);
      }
    }

    // Date range filter
    if (dateFilter && dateFilter !== 'ALL') {
      const now = Date.now();
      if (dateFilter === 'today') {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        filtered = filtered.filter(s => new Date(s.submissionDate).getTime() >= startOfDay.getTime());
      } else if (dateFilter === '7days') {
        const past7 = now - 7 * 24 * 60 * 60 * 1000;
        filtered = filtered.filter(s => new Date(s.submissionDate).getTime() >= past7);
      } else if (dateFilter === '30days') {
        const past30 = now - 30 * 24 * 60 * 60 * 1000;
        filtered = filtered.filter(s => new Date(s.submissionDate).getTime() >= past30);
      } else if (dateFilter === 'custom') {
        if (startDate) {
          const sTime = new Date(startDate).getTime();
          filtered = filtered.filter(s => new Date(s.submissionDate).getTime() >= sTime);
        }
        if (endDate) {
          const eTime = new Date(endDate);
          eTime.setHours(23, 59, 59, 999);
          filtered = filtered.filter(s => new Date(s.submissionDate).getTime() <= eTime.getTime());
        }
      }
    }

    // Global Search filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(s => {
        const tId = (s.teamId || '').toLowerCase();
        const tName = (s.teamName || '').toLowerCase();
        const pTitle = (s.productTitle || '').toLowerCase();
        const leaderName = (s.members?.leader?.name || '').toLowerCase();
        const leaderEmail = (s.members?.leader?.email || '').toLowerCase();
        const leaderPhone = (s.members?.leader?.phone || '').toLowerCase();
        const m2Name = (s.members?.member2?.name || '').toLowerCase();
        const m2Email = (s.members?.member2?.email || '').toLowerCase();
        const m3Name = (s.members?.member3?.name || '').toLowerCase();
        const m3Email = (s.members?.member3?.email || '').toLowerCase();
        const m4Name = (s.members?.member4?.name || '').toLowerCase();

        return tId.includes(q) ||
          tName.includes(q) ||
          pTitle.includes(q) ||
          leaderName.includes(q) ||
          leaderEmail.includes(q) ||
          leaderPhone.includes(q) ||
          m2Name.includes(q) ||
          m2Email.includes(q) ||
          m3Name.includes(q) ||
          m3Email.includes(q) ||
          m4Name.includes(q);
      });
    }

    return res.status(200).json({
      success: true,
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: teamSubmissions.length
      },
      submissions: filtered
    });
  } catch (err) {
    console.error('[Admin Submissions Error]:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve submissions: ' + err.message });
  }
});

// 8. POST /api/phase1/admin/review-team
// Team-level Phase 1 decision (APPROVE / REJECT) with optional comment
router.post('/phase1/admin/review-team', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const registrationId = req.body.registrationId;
    const status = (req.body.status || req.body.reviewStatus || '').toUpperCase();
    const rawComment = req.body.adminComment !== undefined ? req.body.adminComment : req.body.comment;

    if (!registrationId || !status || !['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request: registrationId and status (APPROVED, REJECTED, or PENDING) are required.'
      });
    }

    const cleanComment = rawComment && typeof rawComment === 'string' ? rawComment.trim() : null;
    const nowIso = new Date().toISOString();

    // 1. Update Supabase phase1_submissions records for this team
    const isPending = status === 'PENDING';
    const targetDbStatus = isPending ? 'PENDING' : status;
    const finalComment = isPending ? null : cleanComment;
    const finalReviewer = isPending ? null : req.user.email;
    const finalReviewedAt = isPending ? null : nowIso;

    const updatePayload = {
      review_status: targetDbStatus,
      rejection_reason: status === 'REJECTED' ? finalComment : null,
      reviewed_by: finalReviewer,
      reviewed_at: finalReviewedAt,
      updated_at: nowIso
    };

    try {
      const extPayload = {
        ...updatePayload,
        admin_comment: finalComment,
        decision_seen: false
      };
      let { error: updErr } = await supabase
        .from('phase1_submissions')
        .update(extPayload)
        .eq('registration_id', registrationId);

      if (updErr && targetDbStatus === 'PENDING') {
        // Fallback for check constraint if 'PENDING' is represented as 'UPLOADED'
        extPayload.review_status = 'UPLOADED';
        updatePayload.review_status = 'UPLOADED';
        const retry = await supabase
          .from('phase1_submissions')
          .update(extPayload)
          .eq('registration_id', registrationId);
        updErr = retry.error;
      }

      if (updErr) {
        // Fallback without newly added columns if not yet migrated
        await supabase
          .from('phase1_submissions')
          .update(updatePayload)
          .eq('registration_id', registrationId);
      }
    } catch (dbErr) {
      console.warn('[Review Team DB Update Warning]:', dbErr.message);
    }

    // 2. Persist to local decisions fallback cache
    const localDecisions = readLocalDecisions();
    localDecisions[registrationId] = {
      status,
      adminComment: finalComment,
      reviewedBy: finalReviewer,
      reviewedAt: finalReviewedAt,
      decisionSeen: false
    };
    writeLocalDecisions(localDecisions);

    console.log(`[Review Team] Admin ${req.user.email} set team ${registrationId} to ${status}`);

    return res.status(200).json({
      success: true,
      message: `Team ${registrationId} submission marked as ${status}.`,
      status,
      adminComment: finalComment,
      reviewedBy: finalReviewer,
      reviewedAt: finalReviewedAt
    });
  } catch (err) {
    console.error('[Review Team Error]:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to record team decision: ' + err.message });
  }
});

// 8b. POST /api/phase1/admin/return-to-pending
// Focused admin correction endpoint: returns APPROVED or REJECTED team submission back to PENDING
router.post('/phase1/admin/return-to-pending', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const registrationId = (req.body.registrationId || req.body.teamId || '').trim();
    const rawComment = req.body.adminComment !== undefined ? req.body.adminComment : req.body.comment;

    if (!registrationId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request: registrationId is required.'
      });
    }

    const cleanComment = rawComment && typeof rawComment === 'string' ? rawComment.trim() : null;
    const nowIso = new Date().toISOString();

    // 1. Update Supabase phase1_submissions records for this team
    // Return to pending clears all final-decision metadata
    const updatePayload = {
      review_status: 'PENDING',
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      updated_at: nowIso
    };

    try {
      const extPayload = {
        ...updatePayload,
        admin_comment: null,
        decision_seen: false
      };
      let { error: updErr } = await supabase
        .from('phase1_submissions')
        .update(extPayload)
        .eq('registration_id', registrationId);

      if (updErr) {
        // Fallback for check constraint if 'PENDING' is represented as 'UPLOADED'
        extPayload.review_status = 'UPLOADED';
        updatePayload.review_status = 'UPLOADED';
        const retry = await supabase
          .from('phase1_submissions')
          .update(extPayload)
          .eq('registration_id', registrationId);
        updErr = retry.error;
      }

      if (updErr) {
        // Fallback without newly added columns if not yet migrated
        await supabase
          .from('phase1_submissions')
          .update(updatePayload)
          .eq('registration_id', registrationId);
      }
    } catch (dbErr) {
      console.warn('[Return to Pending DB Update Warning]:', dbErr.message);
    }

    // 2. Persist to local decisions fallback cache
    const localDecisions = readLocalDecisions();
    localDecisions[registrationId] = {
      status: 'PENDING',
      adminComment: null,
      reviewedBy: null,
      reviewedAt: null,
      decisionSeen: false
    };
    writeLocalDecisions(localDecisions);

    console.log(`[Return to Pending] Admin ${req.user.email} returned team ${registrationId} to PENDING`);

    return res.status(200).json({
      success: true,
      message: `Team ${registrationId} submission returned to Pending Review.`,
      status: 'PENDING',
      adminComment: null,
      reviewedBy: null,
      reviewedAt: null
    });
  } catch (err) {
    console.error('[Return to Pending Error]:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to return submission to pending: ' + err.message });
  }
});

// 9. POST /api/phase1/decision-seen
// Student marks their team's decision notification as seen
router.post('/phase1/decision-seen', authenticateUser, async (req, res) => {
  try {
    const { registrationId } = req.body;
    if (!registrationId) {
      return res.status(400).json({ success: false, message: 'registrationId is required.' });
    }

    // Authorize student for registration
    const authorized = await isAuthorizedForRegistration(req.user.id, req.user.email, registrationId);
    if (!authorized) {
      return res.status(403).json({ success: false, message: 'Access denied: You are not authorized for this team.' });
    }

    try {
      await supabase
        .from('phase1_submissions')
        .update({ decision_seen: true })
        .eq('registration_id', registrationId);
    } catch (e) {}

    const localDecisions = readLocalDecisions();
    if (localDecisions[registrationId]) {
      localDecisions[registrationId].decisionSeen = true;
      writeLocalDecisions(localDecisions);
    }

    return res.status(200).json({ success: true, message: 'Decision marked as seen.' });
  } catch (err) {
    console.error('[Decision Seen Error]:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to mark decision as seen.' });
  }
});

// 10. GET /api/phase1/team-status/:registrationId
// Authoritative decision status endpoint for Student My Submissions
router.get('/phase1/team-status/:registrationId', authenticateUser, async (req, res) => {
  try {
    const { registrationId } = req.params;
    if (!registrationId) {
      return res.status(400).json({ success: false, message: 'registrationId is required.' });
    }

    const authorized = await isAuthorizedForRegistration(req.user.id, req.user.email, registrationId);
    if (!authorized) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const { data: subs } = await supabase
      .from('phase1_submissions')
      .select('*')
      .eq('registration_id', registrationId);

    const localDecisions = readLocalDecisions();
    const localDec = localDecisions[registrationId];

    if (!subs || subs.length === 0) {
      if (localDecisions[registrationId]) {
        delete localDecisions[registrationId];
        writeLocalDecisions(localDecisions);
      }
      return res.status(200).json({
        success: true,
        hasSubmission: false,
        status: null,
        adminComment: null,
        decisionSeen: true
      });
    }

    // Determine status
    let finalStatus = 'PENDING';
    if (localDec && localDec.status) {
      finalStatus = localDec.status;
    } else {
      const hasRejected = subs.some(s => s.review_status === 'REJECTED');
      const allApproved = subs.length > 0 && subs.every(s => s.review_status === 'APPROVED');
      if (hasRejected) finalStatus = 'REJECTED';
      else if (allApproved) finalStatus = 'APPROVED';
      else finalStatus = 'PENDING';
    }

    let comment = null;
    if (finalStatus === 'APPROVED' || finalStatus === 'REJECTED') {
      comment = (localDec && localDec.adminComment !== undefined)
        ? localDec.adminComment
        : (subs.find(s => s.admin_comment)?.admin_comment ||
           (finalStatus === 'REJECTED' ? subs.find(s => s.rejection_reason)?.rejection_reason : null) ||
           null);
    }

    const seen = localDec ? !!localDec.decisionSeen : subs.every(s => s.decision_seen === true);

    return res.status(200).json({
      success: true,
      hasSubmission: true,
      status: finalStatus,
      adminComment: comment,
      decisionSeen: seen
    });
  } catch (err) {
    console.error('[Team Status Error]:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to query status.' });
  }
});

// GET active products' innovation domains, TRLs, and timestamps (bypasses client-side RLS)
router.get('/leaderboard-domains', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('team_id, product_title, innovation_domain, trl_level, created_at, id')
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

// Helper functions for persistent local configuration storage
const CONFIG_FILE_PATH = path.join(__dirname, '..', 'config', 'app_settings.json');

function readLocalSettings() {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[Leaderboard Config] Local config read error:', e.message);
  }
  return { leaderboard_type: 'TRL_BASED' };
}

function writeLocalSettings(cfg) {
  try {
    const dir = path.dirname(CONFIG_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Leaderboard Config] Local config write error:', e.message);
  }
}

// GET /api/leaderboard-config (Public endpoint)
// Returns current active leaderboard type: 'TRL_BASED' | 'VOTING_BASED'
router.get('/leaderboard-config', async (req, res) => {
  try {
    // 1. Try reading from supabase app_settings table
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'leaderboard_type')
      .maybeSingle();

    if (!error && data && data.value && data.value.type) {
      const type = data.value.type === 'VOTING_BASED' ? 'VOTING_BASED' : 'TRL_BASED';
      return res.status(200).json({ success: true, leaderboard_type: type });
    }

    // 2. Fallback to persistent local file configuration
    const localCfg = readLocalSettings();
    const type = localCfg.leaderboard_type === 'VOTING_BASED' ? 'VOTING_BASED' : 'TRL_BASED';
    return res.status(200).json({ success: true, leaderboard_type: type });
  } catch (err) {
    console.error('[leaderboard-config GET Error]:', err.message);
    const localCfg = readLocalSettings();
    return res.status(200).json({ success: true, leaderboard_type: localCfg.leaderboard_type || 'TRL_BASED' });
  }
});

// POST /api/admin/leaderboard-config (Admin only endpoint)
// Updates the active leaderboard type
router.post('/admin/leaderboard-config', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const { leaderboard_type } = req.body;
    if (!['TRL_BASED', 'VOTING_BASED'].includes(leaderboard_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid leaderboard type. Must be TRL_BASED or VOTING_BASED.'
      });
    }

    // 1. Persist to Supabase app_settings table
    try {
      const { error: upsertErr } = await supabase
        .from('app_settings')
        .upsert({
          key: 'leaderboard_type',
          value: { type: leaderboard_type },
          updated_at: new Date().toISOString(),
          updated_by: req.user.id
        }, { onConflict: 'key' });

      if (upsertErr) {
        console.warn('[Leaderboard Config] Supabase app_settings upsert warning:', upsertErr.message);
      }
    } catch (dbErr) {
      console.warn('[Leaderboard Config] DB error:', dbErr.message);
    }

    // 2. Persist to local config file as guaranteed fallback
    const localCfg = readLocalSettings();
    localCfg.leaderboard_type = leaderboard_type;
    localCfg.updated_at = new Date().toISOString();
    localCfg.updated_by = req.user.id;
    writeLocalSettings(localCfg);

    console.log(`[Leaderboard Config] Admin ${req.user.email} set leaderboard_type to: ${leaderboard_type}`);

    return res.status(200).json({
      success: true,
      leaderboard_type,
      message: `Leaderboard type successfully updated to ${leaderboard_type === 'TRL_BASED' ? 'TRL Based' : 'Voting Based'}.`
    });
  } catch (err) {
    console.error('[leaderboard-config POST Error]:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update leaderboard configuration.' });
  }
});

module.exports = router
