const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const googleDriveService = require('../services/googleDriveService')

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
 * GET /api/patents/templates
 * Dynamically list all official templates from the Google Drive 'templetes' folder
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = await googleDriveService.listTemplates()
    return res.status(200).json({
      success: true,
      count: templates.length,
      templates
    })
  } catch (err) {
    console.error('[PatentRoutes] Error listing templates:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve templates from Google Drive: ' + err.message
    })
  }
})

/**
 * GET /api/patents/templates/:templateId
 * Download/stream official template file directly from Google Drive
 */
router.get('/templates/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params
    const template = await googleDriveService.validateTemplate(templateId)

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found in Google Drive templates folder.'
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
      message: 'Failed to download template from Google Drive: ' + err.message
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
      message: 'Failed to discover Drive hierarchy: ' + err.message
    })
  }
})

/**
 * POST /api/patents/upload
 * Upload a completed patent document to the dynamic destination folder
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
    if (!department || !department.trim()) {
      return res.status(400).json({ success: false, message: 'Department is required.' })
    }
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
    const cleanDept = department.trim()
    const cleanCat = category.trim()
    const cleanPatentType = patentType.trim()

    // 2. Validate file extension
    const ext = path.extname(file.originalname).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return res.status(400).json({
        success: false,
        message: `Invalid file extension '${ext}'. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`
      })
    }

    // 3. Validate template exists in dynamic templates folder
    const template = await googleDriveService.validateTemplate(templateId)
    if (!template) {
      return res.status(400).json({
        success: false,
        message: 'Invalid templateId: Template does not exist in the official Drive templetes folder.'
      })
    }

    // 4. Validate filename format: Must follow `<teamId>_<templateName>` or `<teamId>-<templateName>`
    // E.g. TEAM123_Abstract for Product.docx
    const uploadedOriginalName = file.originalname.trim()
    const expectedBaseName = `${cleanTeamId}_${template.name}`
    const expectedAltBaseName = `${cleanTeamId}-${template.name}`

    // Case-insensitive filename validation
    const uploadedLower = uploadedOriginalName.toLowerCase()
    const expectedLower = expectedBaseName.toLowerCase()
    const expectedAltLower = expectedAltBaseName.toLowerCase()

    if (uploadedLower !== expectedLower && uploadedLower !== expectedAltLower) {
      return res.status(400).json({
        success: false,
        message: `Uploaded filename '${uploadedOriginalName}' does not match the required naming convention. Expected: '${expectedBaseName}' (Format: <TeamID>_<TemplateName>)`
      })
    }

    // Standardize destination filename
    const destinationFileName = uploadedOriginalName

    // 5. Navigate / Discover Destination Hierarchy
    // Phase Folder
    let phaseFolder
    try {
      phaseFolder = await googleDriveService.getPhaseFolder(phase)
    } catch (e) {
      return res.status(404).json({ success: false, message: e.message })
    }

    // Department Folder
    let deptFolder
    try {
      deptFolder = await googleDriveService.getDepartmentFolder(phaseFolder.id, cleanDept)
    } catch (e) {
      return res.status(404).json({ success: false, message: e.message })
    }

    // Category Folder (Hardware / Software)
    let catFolder
    try {
      catFolder = await googleDriveService.getCategoryFolder(deptFolder.id, cleanCat)
    } catch (e) {
      return res.status(404).json({ success: false, message: e.message })
    }

    // Patent Type Folder (Design Patent / Utility Patent)
    let patentFolder
    try {
      patentFolder = await googleDriveService.getPatentTypeFolder(catFolder.id, cleanPatentType)
    } catch (e) {
      return res.status(404).json({ success: false, message: e.message })
    }

    // Team ID Folder (Find existing or create new)
    const teamFolderResult = await googleDriveService.getOrCreateTeamFolder(patentFolder.id, cleanTeamId)
    const targetFolderId = teamFolderResult.id

    // 6. Upload file with duplicate protection
    try {
      const uploadedFile = await googleDriveService.uploadFileToFolder(targetFolderId, file, destinationFileName)

      const fullPathString = `${phaseFolder.name} / ${deptFolder.name} / ${catFolder.name} / ${patentFolder.name} / ${cleanTeamId}`

      return res.status(200).json({
        success: true,
        message: 'Patent document uploaded successfully.',
        data: {
          fileId: uploadedFile.id,
          fileName: uploadedFile.name,
          teamId: cleanTeamId,
          department: deptFolder.name,
          category: catFolder.name,
          patentType: patentFolder.name,
          folderId: targetFolderId,
          path: fullPathString,
          webViewLink: uploadedFile.webViewLink,
          isNewFolder: teamFolderResult.isNew
        }
      })
    } catch (uploadErr) {
      if (uploadErr.code === 'FILE_EXISTS') {
        return res.status(409).json({
          success: false,
          code: 'FILE_EXISTS',
          message: 'This document has already been uploaded.',
          fileId: uploadErr.fileId
        })
      }
      throw uploadErr
    }

  } catch (err) {
    console.error('[PatentRoutes] Upload Error:', err.message)
    return res.status(500).json({
      success: false,
      message: 'Google Drive upload failed: ' + err.message
    })
  }
})

/**
 * GET /api/patents/file/:fileId
 * Download/stream any uploaded document from Google Drive
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
      message: 'Failed to retrieve document from Google Drive: ' + err.message
    })
  }
})

module.exports = router
