const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const googleDriveService = require('../services/googleDriveService')
const { supabase } = require('../supabaseClient')

// Configure Multer for in-memory file handling (max 15MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
})

// Allowed document file extensions
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx']

/**
 * Standard department normalizer to match authoritative Google Drive department folders
 */
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
 * GET /api/patents/templates
 * Dynamically list official templates, optionally filtered by patentType ('Utility Patent' or 'Design Patent')
 */
router.get('/templates', async (req, res) => {
  try {
    const { patentType } = req.query
    const templates = await googleDriveService.listTemplates(patentType)
    return res.status(200).json({
      success: true,
      count: templates.length,
      patentType: patentType || null,
      templates
    })
  } catch (err) {
    console.error('[PatentRoutes] Error listing templates:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve templates: ' + err.message
    })
  }
})

/**
 * GET /api/patents/templates/:templateId
 * Download/stream official template file
 */
router.get('/templates/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params
    const template = await googleDriveService.validateTemplate(templateId)

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found.'
      })
    }

    const { stream, metadata } = await googleDriveService.streamFile(templateId)

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(metadata.name)}"`)
    res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream')
    if (metadata.size) {
      res.setHeader('Content-Length', metadata.size)
    }

    stream.pipe(res)
  } catch (err) {
    console.error('[PatentRoutes] Error streaming template:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Failed to download template: ' + err.message
    })
  }
})

/**
 * GET /api/patents/submissions
 * List all uploaded files in a team's patent folder
 */
router.get('/submissions', async (req, res) => {
  try {
    let { phase = 'phase 1', department, category, patentType, teamId } = req.query

    if (!teamId || !category || !patentType) {
      return res.status(400).json({
        success: false,
        message: 'teamId, category, and patentType query parameters are required.'
      })
    }

    const cleanTeamId = teamId.trim()
    let cleanDept = (department || '').trim()

    // Authoritative team department resolution
    const { data: reg } = await supabase
      .from('registrations')
      .select('leader_department')
      .eq('registration_id', cleanTeamId)
      .maybeSingle()

    if (reg && reg.leader_department) {
      cleanDept = normalizeOfficialDepartment(reg.leader_department)
    } else if (cleanDept) {
      cleanDept = normalizeOfficialDepartment(cleanDept)
    } else {
      cleanDept = 'Mechanical Engineering'
    }

    const files = await googleDriveService.listTeamSubmissions({
      phase,
      department: cleanDept,
      category: category.trim(),
      patentType: patentType.trim(),
      teamId: cleanTeamId
    })

    return res.status(200).json({
      success: true,
      count: files.length,
      submissions: files
    })
  } catch (err) {
    console.error('[PatentRoutes] Error querying team submissions:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Failed to query submissions: ' + err.message
    })
  }
})

/**
 * GET /api/patents/structure
 * Dynamically discover and return existing phase, department, category, and patent type options
 */
router.get('/structure', async (req, res) => {
  try {
    const phaseParam = req.query.phase || 'phase 1'
    const phaseFolder = await googleDriveService.getPhaseFolder(phaseParam)
    const depts = await googleDriveService.listFolderChildren(phaseFolder.id)

    const departments = depts
      .filter(d => d.mimeType === 'application/vnd.google-apps.folder')
      .map(d => ({ id: d.id, name: d.name }))

    return res.status(200).json({
      success: true,
      phase: {
        id: phaseFolder.id,
        name: phaseFolder.name
      },
      departments,
      categories: ['Hardware', 'Software'],
      patentTypes: ['Design Patent', 'Utility Patent']
    })
  } catch (err) {
    console.error('[PatentRoutes] Error fetching structure:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Failed to discover structure: ' + err.message
    })
  }
})

/**
 * POST /api/patents/upload
 * Upload a completed patent document to the authoritative destination folder
 * Expected fields: phase, department, category, patentType, teamId, templateId, file
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const {
      phase = 'phase 1',
      department,
      category,
      patentType,
      teamId,
      templateId
    } = req.body

    const file = req.file

    // 1. Validate required fields
    if (!category || !category.trim()) {
      return res.status(400).json({ success: false, message: 'Category (Hardware or Software) is required.' })
    }
    if (!patentType || !patentType.trim()) {
      return res.status(400).json({ success: false, message: 'Patent Type (Design Patent or Utility Patent) is required.' })
    }
    if (!teamId || !teamId.trim()) {
      return res.status(400).json({ success: false, message: 'Team ID is required.' })
    }
    if (!templateId || !templateId.trim()) {
      return res.status(400).json({ success: false, message: 'Template ID is required.' })
    }
    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Please attach a document.' })
    }

    const cleanTeamId = teamId.trim()
    const cleanCat = category.trim()
    const cleanPatentType = patentType.trim()

    if (!['Hardware', 'Software'].includes(cleanCat)) {
      return res.status(400).json({ success: false, message: 'Invalid Category. Must be Hardware or Software.' })
    }

    if (!['Design Patent', 'Utility Patent'].includes(cleanPatentType)) {
      return res.status(400).json({ success: false, message: 'Invalid Patent Type. Must be Design Patent or Utility Patent.' })
    }

    // 2. Authoritative Team Department & Membership Resolution from Supabase
    const { data: reg, error: regErr } = await supabase
      .from('registrations')
      .select('registration_id, team_name, leader_department, leader_email, member2_email, member3_email')
      .eq('registration_id', cleanTeamId)
      .maybeSingle()

    let authoritativeDept = (department || '').trim()
    if (reg && reg.leader_department) {
      authoritativeDept = normalizeOfficialDepartment(reg.leader_department)
    } else if (authoritativeDept) {
      authoritativeDept = normalizeOfficialDepartment(authoritativeDept)
    } else {
      authoritativeDept = 'Mechanical Engineering'
    }

    // 3. Security: Check that uploader is an authorized member of the team
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1]
        const { data: { user } } = await supabase.auth.getUser(token)
        if (user && user.email && reg) {
          const uEmail = user.email.toLowerCase().trim()
          const teamEmails = [reg.leader_email, reg.member2_email, reg.member3_email]
            .filter(Boolean)
            .map(e => e.toLowerCase().trim())

          if (!teamEmails.includes(uEmail)) {
            return res.status(403).json({
              success: false,
              message: 'Access Denied: You are not an enrolled member of this team.'
            })
          }
        }
      } catch (authErr) {
        console.warn('[PatentRoutes] Auth token validation warning:', authErr.message)
      }
    }

    // 4. Validate file extension
    const ext = path.extname(file.originalname).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return res.status(400).json({
        success: false,
        message: `Invalid file extension '${ext}'. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`
      })
    }

    // 5. Validate template exists
    const template = await googleDriveService.validateTemplate(templateId)
    if (!template) {
      return res.status(400).json({
        success: false,
        message: 'Invalid template: Template does not exist in the official templates directory.'
      })
    }

    // 6. Validate filename format: Must follow `<teamId>_<templateName>` or `<teamId>-<templateName>`
    const uploadedOriginalName = file.originalname.trim()
    const expectedBaseName = `${cleanTeamId}_${template.name}`
    const expectedAltBaseName = `${cleanTeamId}-${template.name}`

    const uploadedLower = uploadedOriginalName.toLowerCase()
    const expectedLower = expectedBaseName.toLowerCase()
    const expectedAltLower = expectedAltBaseName.toLowerCase()

    if (uploadedLower !== expectedLower && uploadedLower !== expectedAltLower) {
      return res.status(400).json({
        success: false,
        message: `Uploaded filename '${uploadedOriginalName}' does not match the required naming convention. Expected: '${expectedBaseName}' (Format: <TeamID>_<TemplateName>)`
      })
    }

    const destinationFileName = uploadedOriginalName

    // 7. Discover Destination Hierarchy using Authoritative Team Department
    const phaseFolder = await googleDriveService.getPhaseFolder(phase)
    const deptFolder = await googleDriveService.getDepartmentFolder(phaseFolder.id, authoritativeDept)
    const catFolder = await googleDriveService.getCategoryFolder(deptFolder.id, cleanCat)
    const patentFolder = await googleDriveService.getPatentTypeFolder(catFolder.id, cleanPatentType)
    const teamFolderResult = await googleDriveService.getOrCreateTeamFolder(patentFolder.id, cleanTeamId)
    const targetFolderId = teamFolderResult.id

    // 8. Upload file with duplicate protection
    try {
      const uploadedFile = await googleDriveService.uploadFileToFolder(targetFolderId, file, destinationFileName)

      return res.status(200).json({
        success: true,
        message: 'Patent document submitted successfully.',
        data: {
          fileId: uploadedFile.id,
          fileName: uploadedFile.name,
          teamId: cleanTeamId,
          department: deptFolder.name,
          category: catFolder.name,
          patentType: patentFolder.name,
          webViewLink: uploadedFile.webViewLink,
          isNewFolder: teamFolderResult.isNew
        }
      })
    } catch (uploadErr) {
      if (uploadErr.code === 'FILE_EXISTS') {
        return res.status(409).json({
          success: false,
          code: 'FILE_EXISTS',
          message: 'This document has already been uploaded for this team.',
          fileId: uploadErr.fileId
        })
      }
      throw uploadErr
    }

  } catch (err) {
    console.error('[PatentRoutes] Upload Error:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Document submission failed: ' + err.message
    })
  }
})

/**
 * GET /api/patents/file/:fileId
 * Download/stream any uploaded document
 */
router.get('/file/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params
    const { stream, metadata } = await googleDriveService.streamFile(fileId)

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(metadata.name)}"`)
    res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream')
    if (metadata.size) {
      res.setHeader('Content-Length', metadata.size)
    }

    stream.pipe(res)
  } catch (err) {
    console.error('[PatentRoutes] Error streaming document:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve document: ' + err.message
    })
  }
})

module.exports = router
