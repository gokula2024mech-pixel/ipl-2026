const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const googleDriveService = require('../services/googleDriveService')

const router = express.Router()

// Multer memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
})

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
)

// Phase 2 student uploads MUST support exactly these 3 formats:
const ALLOWED_EXTENSIONS = ['.pptx', '.ppt', '.pdf']

const DECISIONS_CONFIG_PATH = path.join(__dirname, '..', 'config', 'phase2_decisions.json')

function readLocalPhase2Decisions() {
  try {
    if (fs.existsSync(DECISIONS_CONFIG_PATH)) {
      const raw = fs.readFileSync(DECISIONS_CONFIG_PATH, 'utf-8')
      return JSON.parse(raw)
    }
  } catch (e) {
    console.warn('[Phase 2 Decisions] Local read error:', e.message)
  }
  return {}
}

function writeLocalPhase2Decisions(decisions) {
  try {
    const dir = path.dirname(DECISIONS_CONFIG_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(DECISIONS_CONFIG_PATH, JSON.stringify(decisions, null, 2), 'utf-8')
  } catch (e) {
    console.warn('[Phase 2 Decisions] Local write error:', e.message)
  }
}

function normalizeOfficialDepartment(deptInput) {
  if (!deptInput) return 'Mechanical Engineering'
  const s = deptInput.trim().toLowerCase().replace(/\s+/g, ' ')

  if (s.includes('aiml') || s.includes('machine learning') || s.includes('ai & ml') || s.includes('ai/ml') || s.includes('ai and ml')) {
    return 'Artificial Intelligence and Machine Learning'
  }
  if (s.includes('aids') || s.includes('data science') || s.includes('ai & ds') || s.includes('ai/ds') || s.includes('ai and ds')) {
    return 'Artificial Intelligence and Data Science'
  }
  if (s.includes('csbs') || s.includes('business system')) {
    return 'Computer Science and Business System'
  }
  if (s.includes('cyber')) {
    return 'Cyber Security'
  }
  if (s.includes('cce') || s.includes('computer and communication') || s.includes('computer & communication')) {
    return 'Computer and Communication Engineering'
  }
  if (s.includes('ece') || s.includes('electronics and communication') || s.includes('electronics & communication') || s.includes('electrical and communication')) {
    return 'Electronics and Communication Engineering'
  }
  if (s.includes('eee') || s.includes('electrical and electronics') || s.includes('electrical & electronics') || s.includes('electrical and electronic')) {
    return 'Electrical and Electronics Engineering'
  }
  if (s.includes('cse') || s.includes('computer science') || s.includes('computer and engineering')) {
    return 'Computer Science and Engineering'
  }
  if (s.includes('information technology') || /\bit\b/.test(s)) {
    return 'Information Technology'
  }
  if (s.includes('mech') || s.includes('mechanical')) {
    return 'Mechanical Engineering'
  }
  return deptInput.trim()
}

/**
 * Authentication Middleware for Admin routes
 */
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

/**
 * Authorization Middleware for Admin privileges
 * Uses the exact authoritative admin verification pattern as Phase 1 & Voting
 */
async function checkAdmin(req, res, next) {
  try {
    if (req.user?.user_metadata?.role === 'admin') {
      return next()
    }

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

/**
 * Team Member Authorization helper
 */
async function authenticateTeamMember(req, cleanTeamId) {
  const { data: reg, error: regErr } = await supabase
    .from('registrations')
    .select('*')
    .eq('registration_id', cleanTeamId)
    .maybeSingle()

  if (regErr || !reg) {
    return { authorized: false, status: 404, message: `Team registration '${cleanTeamId}' not found.` }
  }

  let authenticatedEmail = null
  let isAdmin = false

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    try {
      const token = req.headers.authorization.split(' ')[1]
      const { data: { user } } = await supabase.auth.getUser(token)
      if (user) {
        authenticatedEmail = (user.email || '').toLowerCase().trim()

        if (user.user_metadata?.role === 'admin') {
          isAdmin = true
        } else {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle()

          if (profile && profile.role === 'admin') {
            isAdmin = true
          }
        }
      }
    } catch (authErr) {
      console.warn('[Phase2Routes] Auth token validation warning:', authErr.message)
    }
  }

  if (authenticatedEmail && !isAdmin) {
    const teamEmails = [reg.leader_email, reg.member2_email, reg.member3_email]
      .filter(Boolean)
      .map(e => e.toLowerCase().trim())

    if (!teamEmails.includes(authenticatedEmail)) {
      return { authorized: false, status: 403, message: 'Access Denied: You are not an enrolled member of this team.' }
    }
  }

  const department = normalizeOfficialDepartment(reg.leader_department)
  return { authorized: true, reg, department, isAdmin }
}

/**
 * 1. GET /api/phase2/template
 * Discovers the official Phase 2 template file inside 'phase 2 → Templete'
 */
router.get('/template', async (req, res) => {
  try {
    const template = await googleDriveService.getPhase2Template()
    return res.status(200).json({
      success: true,
      hasTemplate: !!template,
      template: template || null
    })
  } catch (err) {
    console.error('[Phase2Routes] Error discovering template:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Failed to discover Phase 2 template: ' + err.message
    })
  }
})

/**
 * 2. GET /api/phase2/template/download
 * Streams the official Phase 2 template file completely for download without hanging
 */
router.get('/template/download', async (req, res) => {
  try {
    const template = await googleDriveService.getPhase2Template()
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Official Phase 2 template has not been uploaded to the template folder yet.'
      })
    }

    const { stream, metadata } = await googleDriveService.streamFile(template.id)

    const downloadFilename = template.name || 'IPL 2026 – Product + Business Pitch Deck.pptx'
    res.setHeader('Content-Type', metadata?.mimeType || 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadFilename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`
    )
    if (metadata?.size) {
      res.setHeader('Content-Length', metadata.size)
    }

    stream.on('error', (err) => {
      console.error('[Phase2Routes] Error in template stream:', err.message)
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Failed to download template: ' + err.message })
      } else {
        res.end()
      }
    })

    stream.pipe(res)
  } catch (err) {
    console.error('[Phase2Routes] Error downloading template:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Failed to download Phase 2 template: ' + err.message
    })
  }
})

/**
 * 3. GET /api/phase2/submission
 * Queries the current Phase 2 submission for a team directly from Google Drive
 */
router.get('/submission', async (req, res) => {
  try {
    const teamId = (req.query.teamId || '').trim()
    if (!teamId) {
      return res.status(400).json({ success: false, message: 'Team ID is required.' })
    }

    const authCheck = await authenticateTeamMember(req, teamId)
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message })
    }

    const submission = await googleDriveService.getPhase2Submission(authCheck.department, teamId)
    const localDecisions = readLocalPhase2Decisions()
    const teamDec = localDecisions[teamId]

    let finalStatus = submission.status
    if (submission.hasSubmission && teamDec && ['APPROVED', 'REJECTED', 'PENDING'].includes(teamDec.status)) {
      finalStatus = teamDec.status
    }

    return res.status(200).json({
      success: true,
      teamId,
      department: authCheck.department,
      ...submission,
      status: finalStatus,
      decision: teamDec || null
    })
  } catch (err) {
    console.error('[Phase2Routes] Error fetching submission:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve Phase 2 submission: ' + err.message
    })
  }
})

/**
 * 4. POST /api/phase2/upload
 * Uploads or replaces the student's Phase 2 submission in the registered department & team folder
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const teamId = (req.body.teamId || '').trim()
    const file = req.file

    if (!teamId) {
      return res.status(400).json({ success: false, message: 'Team ID is required.' })
    }
    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Please attach a document.' })
    }

    const authCheck = await authenticateTeamMember(req, teamId)
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message })
    }

    const ext = path.extname(file.originalname).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return res.status(400).json({
        success: false,
        message: `Invalid file format. Please upload your presentation document (.pptx, .ppt, .pdf). Received: '${file.originalname}'`
      })
    }

    const uploaded = await googleDriveService.uploadOrReplacePhase2File(
      authCheck.department,
      teamId,
      file.buffer,
      file.originalname,
      file.mimetype
    )

    // Reset review decision to PENDING upon new upload/re-upload
    try {
      const currentDecisions = readLocalPhase2Decisions()
      currentDecisions[teamId] = {
        status: 'PENDING',
        adminComment: null,
        reviewedBy: null,
        reviewedAt: null,
        decisionSeen: false
      }
      writeLocalPhase2Decisions(currentDecisions)
    } catch (decErr) {
      console.warn('[Phase2Routes] Decision reset warning:', decErr.message)
    }

    return res.status(200).json({
      success: true,
      message: 'File uploaded successfully.',
      file: {
        id: uploaded.id,
        name: uploaded.name,
        size: uploaded.size,
        modifiedTime: uploaded.modifiedTime,
        webViewLink: uploaded.webViewLink
      }
    })
  } catch (err) {
    console.error('[Phase2Routes] Error uploading file:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Failed to upload Phase 2 document: ' + err.message
    })
  }
})

/**
 * 5. POST /api/phase2/remove-file
 * Removes the student's Phase 2 submission from Google Drive
 */
router.post('/remove-file', async (req, res) => {
  try {
    const teamId = (req.body.teamId || req.query.teamId || '').trim()
    const fileId = (req.body.fileId || req.query.fileId || '').trim()

    if (!teamId) {
      return res.status(400).json({ success: false, message: 'Team ID is required.' })
    }

    const authCheck = await authenticateTeamMember(req, teamId)
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message })
    }

    await googleDriveService.removePhase2File(authCheck.department, teamId, fileId)

    // Clear decisions for this team so it is treated as incomplete
    try {
      const currentDecisions = readLocalPhase2Decisions()
      if (currentDecisions[teamId]) {
        delete currentDecisions[teamId]
        writeLocalPhase2Decisions(currentDecisions)
      }
    } catch (dErr) {
      console.warn('[Phase2Routes] Decision clear warning:', dErr.message)
    }

    return res.status(200).json({
      success: true,
      message: 'File removed successfully.'
    })
  } catch (err) {
    console.error('[Phase2Routes] Error removing file:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Failed to remove Phase 2 document: ' + err.message
    })
  }
})

/**
 * 6. GET /api/phase2/admin/submissions
 * Aggregated team submissions query for Phase 2 Admin Review Center
 */
router.get('/admin/submissions', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const {
      status = 'ALL',
      search = '',
      department = 'ALL',
      domain = 'ALL',
      mentor = 'ALL',
      trl = 'ALL',
      dateFilter = 'ALL',
      startDate = '',
      endDate = ''
    } = req.query

    // 1. Fetch current Phase 2 submissions directly from Google Drive
    const driveSubmissionsMap = await googleDriveService.getAllPhase2Submissions()

    // 2. Fetch registrations & products
    const [regsResult, prodsResult] = await Promise.all([
      supabase.from('registrations').select('*'),
      supabase.from('products').select('*')
    ])

    const registrations = regsResult.data || []
    const products = prodsResult.data || []
    const localDecisions = readLocalPhase2Decisions()

    // 3. Prune decisions for teams with no files in Drive
    try {
      const activeIds = new Set(Object.keys(driveSubmissionsMap))
      let modified = false
      for (const regId of Object.keys(localDecisions)) {
        if (!activeIds.has(regId)) {
          delete localDecisions[regId]
          modified = true
        }
      }
      if (modified) {
        writeLocalPhase2Decisions(localDecisions)
      }
    } catch (cleanErr) {
      console.warn('[Phase2 Admin] Decision pruning warning:', cleanErr.message)
    }

    // 4. Build team submission objects
    const allSubmissions = registrations.map(reg => {
      const regId = reg.registration_id
      const driveEntry = driveSubmissionsMap[regId]
      const file = driveEntry ? driveEntry.file : null
      const hasFile = Boolean(file)
      const localDec = localDecisions[regId]

      let finalStatus = 'INCOMPLETE'
      if (hasFile) {
        if (localDec && ['APPROVED', 'REJECTED', 'PENDING'].includes(localDec.status)) {
          finalStatus = localDec.status
        } else {
          finalStatus = 'PENDING'
        }
      }

      const teamProducts = products.filter(p => p.legacy_registration_id === regId || p.team_id === reg.id)
      const prod = teamProducts[0] || null

      const mentorObj = {
        name: reg?.mentor_name || 'Unassigned',
        department: reg?.mentor_department || reg?.leader_department || 'General'
      }

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
      }

      const docItem = hasFile ? {
        id: file.id,
        fileId: file.id,
        name: file.name,
        documentType: 'PITCH_DECK',
        slotNumber: '01',
        originalFilename: file.name,
        google_drive_file_id: file.id,
        uploadedAt: file.modifiedTime,
        size: file.size,
        status: 'SUBMITTED',
        review_status: finalStatus === 'APPROVED' ? 'APPROVED' : (finalStatus === 'REJECTED' ? 'REJECTED' : 'UPLOADED'),
        webViewLink: file.webViewLink,
        webContentLink: file.webContentLink
      } : {
        id: 'slot-1',
        name: 'IPL 2026 – Product + Business Pitch Deck',
        documentType: 'PITCH_DECK',
        slotNumber: '01',
        status: 'NOT SUBMITTED'
      }

      return {
        id: regId,
        teamId: regId,
        dbTeamId: reg.id,
        teamName: reg.team_name || 'Unnamed Team',
        productTitle: prod?.product_title || reg.project_title || 'Phase 2 Pitch Deck',
        innovationDomain: prod?.innovation_domain || reg.innovation_domain || 'General',
        department: reg.leader_department || 'General',
        patentType: 'Phase 2 Pitch Deck',
        category: 'Phase 2',
        trl: Number(prod?.trl_level || reg.trl_level || 3),
        mentor: mentorObj,
        members: membersObj,
        problemArea: prod?.problem_area || reg.problem_area || '',
        proposedSolution: prod?.proposed_solution || reg.proposed_solution || '',
        expectedImpact: prod?.expected_impact || reg.expected_impact || '',
        submissionDate: file?.modifiedTime || reg.created_at || new Date().toISOString(),
        status: finalStatus,
        isComplete: hasFile,
        uploadedCount: hasFile ? 1 : 0,
        requiredCount: 1,
        missingSlots: hasFile ? [] : ['IPL 2026 – Product + Business Pitch Deck'],
        completion: {
          uploadedCount: hasFile ? 1 : 0,
          requiredCount: 1,
          isComplete: hasFile,
          percentage: hasFile ? 100 : 0
        },
        documents: [docItem],
        utilityDocs: [],
        designDocs: [],
        adminComment: localDec?.adminComment || null,
        reviewedBy: localDec?.reviewedBy || null,
        reviewedAt: localDec?.reviewedAt || null,
        decisionSeen: Boolean(localDec?.decisionSeen),
        products: []
      }
    })

    // 5. Compute global status counts
    const counts = {
      pending: allSubmissions.filter(s => s.status === 'PENDING').length,
      incomplete: allSubmissions.filter(s => s.status === 'INCOMPLETE').length,
      approved: allSubmissions.filter(s => s.status === 'APPROVED').length,
      rejected: allSubmissions.filter(s => s.status === 'REJECTED').length,
      total: allSubmissions.length
    }

    // 6. Filter by Status
    let filtered = allSubmissions
    if (status !== 'ALL') {
      filtered = filtered.filter(s => s.status === status)
    }

    // 7. Filter by Search Query
    if (search && search.trim()) {
      const q = search.trim().toLowerCase()
      filtered = filtered.filter(s => {
        return (
          s.teamId.toLowerCase().includes(q) ||
          s.teamName.toLowerCase().includes(q) ||
          (s.productTitle && s.productTitle.toLowerCase().includes(q)) ||
          (s.members.leader.name && s.members.leader.name.toLowerCase().includes(q)) ||
          (s.members.leader.email && s.members.leader.email.toLowerCase().includes(q)) ||
          (s.mentor.name && s.mentor.name.toLowerCase().includes(q))
        )
      })
    }

    // 8. Filter by Department
    if (department !== 'ALL') {
      filtered = filtered.filter(s => {
        const normS = normalizeOfficialDepartment(s.department)
        const normF = normalizeOfficialDepartment(department)
        return normS === normF
      })
    }

    // 9. Filter by Domain
    if (domain !== 'ALL') {
      filtered = filtered.filter(s => s.innovationDomain === domain)
    }

    // 10. Filter by Mentor
    if (mentor !== 'ALL') {
      filtered = filtered.filter(s => s.mentor.name === mentor)
    }

    // 11. Filter by TRL
    if (trl !== 'ALL') {
      filtered = filtered.filter(s => String(s.trl) === String(trl))
    }

    // 12. Filter by Date
    if (dateFilter && dateFilter !== 'ALL') {
      const now = Date.now()
      if (dateFilter === 'today') {
        const startOfDay = new Date()
        startOfDay.setHours(0, 0, 0, 0)
        filtered = filtered.filter(s => new Date(s.submissionDate).getTime() >= startOfDay.getTime())
      } else if (dateFilter === '7days') {
        const past7 = now - 7 * 24 * 60 * 60 * 1000
        filtered = filtered.filter(s => new Date(s.submissionDate).getTime() >= past7)
      } else if (dateFilter === '30days') {
        const past30 = now - 30 * 24 * 60 * 60 * 1000
        filtered = filtered.filter(s => new Date(s.submissionDate).getTime() >= past30)
      } else if (dateFilter === 'custom') {
        if (startDate) {
          const sTime = new Date(startDate).getTime()
          filtered = filtered.filter(s => new Date(s.submissionDate).getTime() >= sTime)
        }
        if (endDate) {
          const eTime = new Date(endDate)
          eTime.setHours(23, 59, 59, 999)
          filtered = filtered.filter(s => new Date(s.submissionDate).getTime() <= eTime.getTime())
        }
      }
    }

    return res.status(200).json({
      success: true,
      phase: 'phase_2',
      counts,
      submissions: filtered
    })
  } catch (err) {
    console.error('[Phase2 Admin] Error fetching submissions:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve Phase 2 submissions: ' + err.message
    })
  }
})

/**
 * 7. POST /api/phase2/admin/review-team
 * Approves or Rejects a team's Phase 2 submission
 */
router.post('/admin/review-team', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const { teamId, status, comment } = req.body
    if (!teamId || !['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid team ID or review status.' })
    }

    const currentDecisions = readLocalPhase2Decisions()
    currentDecisions[teamId] = {
      status,
      adminComment: comment ? comment.trim() : null,
      reviewedBy: req.user.email || 'admin',
      reviewedAt: new Date().toISOString(),
      decisionSeen: false
    }
    writeLocalPhase2Decisions(currentDecisions)

    return res.status(200).json({
      success: true,
      message: `Phase 2 submission ${status.toLowerCase()} successfully.`
    })
  } catch (err) {
    console.error('[Phase2 Admin] Error recording review:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Failed to record review: ' + err.message
    })
  }
})

/**
 * 8. POST /api/phase2/admin/return-to-pending
 * Returns a team's Phase 2 submission to PENDING
 */
router.post('/admin/return-to-pending', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const { teamId, comment } = req.body
    if (!teamId) {
      return res.status(400).json({ success: false, message: 'Team ID is required.' })
    }

    const currentDecisions = readLocalPhase2Decisions()
    currentDecisions[teamId] = {
      status: 'PENDING',
      adminComment: comment ? comment.trim() : null,
      reviewedBy: req.user.email || 'admin',
      reviewedAt: new Date().toISOString(),
      decisionSeen: false
    }
    writeLocalPhase2Decisions(currentDecisions)

    return res.status(200).json({
      success: true,
      message: 'Returned to Pending.'
    })
  } catch (err) {
    console.error('[Phase2 Admin] Error returning to pending:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Failed to return to pending: ' + err.message
    })
  }
})

module.exports = router
