const { google } = require('googleapis')
const { Readable } = require('stream')
const path = require('path')
const dotenv = require('dotenv')

dotenv.config({ path: path.join(__dirname, '../.env') })

// Fixed or environment-configured Root and Templates folder IDs
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '1dWIKn-jEu8-BCZrpw8YAUTeKvoJy2R5H'
const TEMPLATES_FOLDER_ID = process.env.GOOGLE_DRIVE_TEMPLATES_FOLDER_ID || '11B9SnNRH7v1f9W1HZkDVCtNwt9Y5Mm6p'

let cachedDriveClient = null

/**
 * Set a mock Drive client for testing purposes
 */
function setDriveClientForTesting(client) {
  cachedDriveClient = client
}

/**
 * Initialize and return an authenticated Google Drive API client
 */
function getDriveClient() {
  if (cachedDriveClient) {
    return cachedDriveClient
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  let privateKey = process.env.GOOGLE_PRIVATE_KEY

  if (clientId && clientSecret && refreshToken) {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret)
    oauth2Client.setCredentials({ refresh_token: refreshToken })
    cachedDriveClient = google.drive({ version: 'v3', auth: oauth2Client })
    console.log('[GoogleDriveService] Drive Client initialized via OAuth2 (College account: gokul.a2024mech@sece.ac.in).')
  } else if (serviceAccountEmail && privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n')
    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/drive']
    })
    cachedDriveClient = google.drive({ version: 'v3', auth })
    console.log('[GoogleDriveService] Drive Client initialized via Service Account.')
  } else {
    throw new Error('Google Drive integration unconfigured: Missing OAuth credentials or Service Account credentials in .env')
  }

  return cachedDriveClient
}

/**
 * List all non-trashed children in a folder
 */
async function listFolderChildren(folderId) {
  const drive = getDriveClient()
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  })
  return response.data.files || []
}

/**
 * Normalize text for case-insensitive and whitespace-tolerant matching
 */
function normalizeName(str) {
  return (str || '').toString().toLowerCase().trim().replace(/[-_]/g, ' ').replace(/\s+/g, ' ')
}

/**
 * Find a specific folder by name inside parentId
 */
async function findFolderByName(parentId, folderName) {
  const drive = getDriveClient()
  const children = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, mimeType)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  })

  const files = children.data.files || []
  const targetNorm = normalizeName(folderName)

  // 1. Exact match
  const exact = files.find(f => f.name === folderName)
  if (exact) return exact

  // 2. Case-insensitive normalized match
  return files.find(f => normalizeName(f.name) === targetNorm) || null
}

/**
 * Find a file by name inside parentId
 */
async function findFileByName(parentId, fileName) {
  const drive = getDriveClient()
  const children = await drive.files.list({
    q: `'${parentId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  })

  const files = children.data.files || []
  const targetNorm = normalizeName(fileName)

  // 1. Exact match
  const exact = files.find(f => f.name === fileName)
  if (exact) return exact

  // 2. Normalized match
  return files.find(f => normalizeName(f.name) === targetNorm) || null
}

/**
 * Find the phase folder under Root (e.g. 'phase 1', 'phase 2', 'phase3')
 */
async function getPhaseFolder(phaseInput) {
  const rootId = ROOT_FOLDER_ID
  const drive = getDriveClient()

  // List all folders in root
  const children = await drive.files.list({
    q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  })

  const folders = children.data.files || []
  const inputNorm = normalizeName(phaseInput)

  // Match e.g. "phase 1" or "phase1" or "phase_1"
  const cleanInput = inputNorm.replace(/\s+/g, '')
  const matched = folders.find(f => {
    const norm = normalizeName(f.name)
    const cleanNorm = norm.replace(/\s+/g, '')
    return norm === inputNorm || cleanNorm === cleanInput
  })

  if (!matched) {
    throw new Error(`Phase folder '${phaseInput}' not found under root Google Drive folder.`)
  }

  return matched
}

/**
 * Find the Department folder under a Phase folder
 */
async function getDepartmentFolder(phaseFolderId, departmentName) {
  const deptFolder = await findFolderByName(phaseFolderId, departmentName)
  if (!deptFolder) {
    throw new Error(`Department folder '${departmentName}' not found in phase folder.`)
  }
  return deptFolder
}

/**
 * Find the Category folder (Hardware or Software) under Department
 */
async function getCategoryFolder(departmentFolderId, category) {
  const catFolder = await findFolderByName(departmentFolderId, category)
  if (!catFolder) {
    throw new Error(`Category folder '${category}' not found in department folder.`)
  }
  return catFolder
}

/**
 * Find the Patent Type folder (Design Patent or Utility Patent) under Category
 */
async function getPatentTypeFolder(categoryFolderId, patentType) {
  const patentFolder = await findFolderByName(categoryFolderId, patentType)
  if (!patentFolder) {
    throw new Error(`Patent type folder '${patentType}' not found in category folder.`)
  }
  return patentFolder
}

/**
 * Find or create the Team ID folder inside the Patent Type folder.
 * NEVER creates duplicate folders if one already exists.
 */
async function getOrCreateTeamFolder(patentTypeFolderId, teamId) {
  const cleanTeamId = (teamId || '').trim()
  if (!cleanTeamId) {
    throw new Error('Team ID is required to resolve or create team folder.')
  }

  const drive = getDriveClient()

  // 1. Search if team folder already exists
  const existing = await findFolderByName(patentTypeFolderId, cleanTeamId)
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      isNew: false
    }
  }

  // 2. Create new team folder inside patentTypeFolderId
  const folderMetadata = {
    name: cleanTeamId,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [patentTypeFolderId]
  }

  const response = await drive.files.create({
    resource: folderMetadata,
    fields: 'id, name',
    supportsAllDrives: true
  })

  return {
    id: response.data.id,
    name: response.data.name,
    isNew: true
  }
}

function getCanonicalDocTypeFromName(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('abstract')) return 'FIGURE_OF_ABSTRACT'
  if (n.includes('declaration') || n.includes('form_5') || n.includes('form 5')) return 'FORM_5'
  if (n.includes('grant') || n.includes('form_2') || n.includes('form 2')) return 'FORM_2'
  if (n.includes('drawing')) return 'LIST_OF_DRAWINGS'
  if (n.includes('novelty')) return 'NOVELTY_FORM'
  if (n.includes('representation')) return 'REPRESENTATION_SHEET'
  return 'OTHER'
}

/**
 * Dynamically list official templates, optionally filtered by patentType ('Utility Patent' or 'Design Patent')
 */
async function listTemplates(patentType = null) {
  const drive = getDriveClient()
  const rootTemplatesFolderId = TEMPLATES_FOLDER_ID

  let targetFolderIds = [rootTemplatesFolderId]

  // Fetch all subfolders inside the templates folder
  const subfoldersRes = await drive.files.list({
    q: `'${rootTemplatesFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  })
  const subfolders = subfoldersRes.data.files || []

  const utilityFolder = subfolders.find(f => f.name.toLowerCase().includes('utility'))
  const designFolder = subfolders.find(f => f.name.toLowerCase().includes('design'))

  if (patentType && patentType.trim()) {
    const cleanType = patentType.trim().toLowerCase()
    if (cleanType.includes('both')) {
      targetFolderIds = [utilityFolder?.id, designFolder?.id].filter(Boolean)
      if (targetFolderIds.length === 0 && subfolders.length > 0) {
        targetFolderIds = subfolders.map(f => f.id)
      }
    } else if (cleanType.includes('utility')) {
      targetFolderIds = utilityFolder ? [utilityFolder.id] : []
    } else if (cleanType.includes('design')) {
      targetFolderIds = designFolder ? [designFolder.id] : []
    } else {
      targetFolderIds = []
    }
  } else if (subfolders.length > 0) {
    // If no specific patentType specified, include both root and all subfolders
    targetFolderIds = [rootTemplatesFolderId, ...subfolders.map(f => f.id)]
  }

  const allFiles = []
  for (const folderId of targetFolderIds) {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
      spaces: 'drive',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    })
    if (response.data.files) {
      const isDesignFolder = designFolder && folderId === designFolder.id
      for (const f of response.data.files) {
        let filePatentType = isDesignFolder ? 'Design Patent' : 'Utility Patent'
        const fn = (f.name || '').toLowerCase()
        if (fn.includes('novelty') || fn.includes('representation')) {
          filePatentType = 'Design Patent'
        }
        allFiles.push({ ...f, patentType: filePatentType })
      }
    }
  }

  // Deduplicate files by id
  const uniqueFilesMap = new Map()
  for (const f of allFiles) {
    if (!uniqueFilesMap.has(f.id)) {
      const docType = getCanonicalDocTypeFromName(f.name)
      uniqueFilesMap.set(f.id, {
        id: f.id,
        name: f.name,
        patentType: f.patentType,
        documentType: docType,
        mimeType: f.mimeType,
        size: f.size ? parseInt(f.size, 10) : null,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink
      })
    }
  }

  return Array.from(uniqueFilesMap.values())
}

/**
 * Validate that a given templateId exists
 */
async function validateTemplate(templateId) {
  if (!templateId) return null
  try {
    const allTemplates = await listTemplates()
    const match = allTemplates.find(t => t.id === templateId)
    if (match) return match
    const file = await getFileMetadata(templateId)
    return file && !file.trashed ? file : null
  } catch (e) {
    return null
  }
}

/**
 * List all uploaded files in a team folder
 */
async function listTeamSubmissions({ phase = 'phase 1', department, category, patentType, teamId }) {
  if (!department || !category || !patentType || !teamId) return []

  try {
    const phaseFolder = await getPhaseFolder(phase)
    const deptFolder = await getDepartmentFolder(phaseFolder.id, department)
    const catFolder = await getCategoryFolder(deptFolder.id, category)
    const patentFolder = await getPatentTypeFolder(catFolder.id, patentType)
    const teamFolder = await findFolderByName(patentFolder.id, teamId)
    if (!teamFolder) return []

    const children = await listFolderChildren(teamFolder.id)
    return children
      .filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
      .map(f => ({
        id: f.id,
        name: f.name,
        size: f.size ? parseInt(f.size, 10) : null,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink
      }))
  } catch (err) {
    return []
  }
}

/**
 * Upload a file into a destination folder with duplicate filename protection
 */
async function uploadFileToFolder(folderId, file, targetFileName) {
  const drive = getDriveClient()
  const cleanName = (targetFileName || file.originalname).trim()

  // 1. Check for duplicate file
  const existingFile = await findFileByName(folderId, cleanName)
  if (existingFile) {
    const err = new Error(`File '${cleanName}' already exists in this team folder.`)
    err.code = 'FILE_EXISTS'
    err.status = 409
    err.fileId = existingFile.id
    throw err
  }

  // 2. Upload file stream
  const mediaStream = new Readable()
  mediaStream.push(file.buffer)
  mediaStream.push(null)

  const fileMetadata = {
    name: cleanName,
    parents: [folderId]
  }

  const media = {
    mimeType: file.mimetype || 'application/octet-stream',
    body: mediaStream
  }

  const response = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, name, mimeType, size, webViewLink, createdTime',
    supportsAllDrives: true
  })

  return response.data
}

/**
 * Upload or replace a document in the destination folder.
 * If an existing file exists for this team and document template slot, it updates the existing file.
 * Otherwise, it creates a new file.
 */
async function updateOrUploadFileToFolder(folderId, file, canonicalFileName, normalizedTemplateName, teamId, productNumber = null, isSingleProductTeam = false) {
  const drive = getDriveClient()
  const cleanName = canonicalFileName.trim()

  // 1. Search for an existing file in folderId for this template slot and product
  const children = await listFolderChildren(folderId)
  const slotMatch = children.find(f => {
    if (f.mimeType === 'application/vnd.google-apps.folder') return false
    const nameLower = f.name.toLowerCase()
    const cleanSlotLower = (normalizedTemplateName || '').toLowerCase()
    const rawSlotLower = (normalizedTemplateName || '').replace(/_/g, ' ').toLowerCase()
    const teamLower = (teamId || '').toLowerCase()

    // 1. Exact match with canonical name
    if (nameLower === cleanName.toLowerCase()) return true

    // Check if filename contains this template slot and team
    const hasSlot = (nameLower.includes(cleanSlotLower) || nameLower.includes(rawSlotLower)) && nameLower.includes(teamLower)
    if (!hasSlot) return false

    // 2. If productNumber is specified:
    if (productNumber !== null && productNumber !== undefined) {
      const prodToken = `_p${productNumber}_`
      if (nameLower.includes(prodToken)) return true

      // If file belongs to another product (e.g. _p2_ when uploading for P1), NEVER match
      if (/_p\d+_/i.test(nameLower)) return false

      // For legacy files without _p token:
      // Only match if this is productNumber === 1 AND isSingleProductTeam (safe legacy upgrade)
      if (productNumber === 1 && isSingleProductTeam) {
        return true
      }

      // Multi-product teams or productNumber > 1 MUST NOT match legacy un-prefixed files
      return false
    }

    // Fallback if productNumber is not provided
    return true
  })

  const mediaStream = new Readable()
  mediaStream.push(file.buffer)
  mediaStream.push(null)

  const media = {
    mimeType: file.mimetype || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    body: mediaStream
  }

  if (slotMatch) {
    // Replace / update existing file content and name
    const response = await drive.files.update({
      fileId: slotMatch.id,
      resource: { name: cleanName },
      media: media,
      fields: 'id, name, mimeType, size, webViewLink, modifiedTime',
      supportsAllDrives: true
    })
    return { ...response.data, isReplacement: true }
  }

  // Otherwise create new file
  const fileMetadata = {
    name: cleanName,
    parents: [folderId]
  }

  const response = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, name, mimeType, size, webViewLink, createdTime, modifiedTime',
    supportsAllDrives: true
  })

  return { ...response.data, isReplacement: false }
}

/**
 * Retrieve metadata for a file
 */
async function getFileMetadata(fileId) {
  const drive = getDriveClient()
  const response = await drive.files.get({
    fileId: fileId,
    fields: 'id, name, mimeType, size, modifiedTime, webViewLink, parents',
    supportsAllDrives: true
  })
  return response.data
}

/**
 * Stream file content for download
 */
async function streamFile(fileId) {
  const drive = getDriveClient()
  const metadata = await getFileMetadata(fileId)
  const response = await drive.files.get(
    { fileId: fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  )

  return {
    stream: response.data,
    metadata
  }
}

/**
 * Dedicated Google Drive Folder for IPL 2026 Voting Reports
 * Isolated under ROOT_FOLDER_ID without touching Phase 1/2/3 student submissions.
 */
async function getOrCreateVotingReportsFolder() {
  const rootId = ROOT_FOLDER_ID
  const drive = getDriveClient()
  const folderName = 'IPL 2026 Voting Reports'

  const existing = await findFolderByName(rootId, folderName)
  if (existing) {
    return existing
  }

  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [rootId]
  }

  const response = await drive.files.create({
    resource: folderMetadata,
    fields: 'id, name, webViewLink',
    supportsAllDrives: true
  })

  return response.data
}

/**
 * Upload a generated voting report (.xlsx) to the dedicated Voting Reports folder
 */
async function uploadVotingReportToDrive({ fileName, buffer, mimeType }) {
  const folder = await getOrCreateVotingReportsFolder()
  const drive = getDriveClient()
  const cleanName = (fileName || `IPL_2026_Voting_Report_${Date.now()}.xlsx`).trim()

  const mediaStream = new Readable()
  mediaStream.push(buffer)
  mediaStream.push(null)

  const fileMetadata = {
    name: cleanName,
    parents: [folder.id]
  }

  const media = {
    mimeType: mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: mediaStream
  }

  const response = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, name, mimeType, size, webViewLink, createdTime, modifiedTime',
    supportsAllDrives: true
  })

  return {
    ...response.data,
    folderId: folder.id,
    folderName: folder.name
  }
}

/**
 * List existing generated reports from the dedicated Voting Reports folder
 */
async function listVotingReportsFromDrive() {
  try {
    const folder = await getOrCreateVotingReportsFolder()
    const children = await listFolderChildren(folder.id)
    return (children || []).filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
  } catch (err) {
    console.warn('[GoogleDrive] Failed to list voting reports:', err.message)
    return []
  }
}

/**
 * Permanently delete a specific file by its fileId
 */
/**
 * Permanently delete a specific file by its fileId
 */
async function deleteFile(fileId) {
  if (!fileId) {
    throw new Error('fileId is required to delete a file')
  }
  const drive = getDriveClient()
  await drive.files.delete({
    fileId: fileId,
    supportsAllDrives: true
  })
  return true
}

/**
 * =============================================================================
 * PHASE 2 GOOGLE DRIVE SERVICE METHODS
 * =============================================================================
 */

/**
 * Resolves the existing 'phase 2' root folder
 */
async function getPhase2RootFolder() {
  const rootId = ROOT_FOLDER_ID
  const drive = getDriveClient()
  const children = await drive.files.list({
    q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })
  const folders = children.data.files || []
  const matched = folders.find(f => normalizeName(f.name) === 'phase 2' || normalizeName(f.name).replace(/\s+/g, '') === 'phase2')
  if (!matched) {
    throw new Error("Phase 2 folder ('phase 2') not found in root Google Drive folder.")
  }
  return matched
}

/**
 * Resolves the existing 'Templete' folder inside 'phase 2'
 */
async function getPhase2TemplateFolder() {
  const p2Folder = await getPhase2RootFolder()
  const drive = getDriveClient()
  const children = await drive.files.list({
    q: `'${p2Folder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })
  const folders = children.data.files || []
  // Matches "Templete" (exact or normalized)
  const matched = folders.find(f => normalizeName(f.name) === 'templete' || normalizeName(f.name) === 'templates')
  if (!matched) {
    throw new Error("Phase 2 template folder ('Templete') not found inside 'phase 2'.")
  }
  return matched
}

/**
 * Discovers the official Phase 2 template file inside 'phase 2 → Templete'
 */
async function getPhase2Template() {
  const templeteFolder = await getPhase2TemplateFolder()
  const drive = getDriveClient()
  const filesRes = await drive.files.list({
    q: `'${templeteFolder.id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, webContentLink)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })
  const files = filesRes.data.files || []
  if (files.length === 0) {
    return null
  }
  // Return the first template file found
  const t = files[0]
  return {
    id: t.id,
    name: t.name,
    mimeType: t.mimeType,
    size: t.size,
    modifiedTime: t.modifiedTime,
    webViewLink: t.webViewLink,
    webContentLink: t.webContentLink
  }
}

/**
 * Resolves the existing department folder under 'phase 2'
 * Uses normalized matching to safely match existing manually created folders like 'computer Science and Engineering'.
 * NEVER creates a duplicate department folder.
 */
async function getPhase2DepartmentFolder(departmentName) {
  const p2Folder = await getPhase2RootFolder()
  const drive = getDriveClient()
  const children = await drive.files.list({
    q: `'${p2Folder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })
  const folders = children.data.files || []
  const targetNorm = normalizeName(departmentName)
  const matched = folders.find(f => normalizeName(f.name) === targetNorm)
  if (!matched) {
    throw new Error(`Department folder for '${departmentName}' not found in 'phase 2'.`)
  }
  return matched
}

/**
 * Finds or creates ONLY the student's Team ID folder inside the department folder.
 * NEVER creates duplicate folders.
 */
async function getOrCreatePhase2TeamFolder(deptFolderId, teamId) {
  const cleanTeamId = (teamId || '').trim()
  if (!cleanTeamId) {
    throw new Error('Team ID is required to resolve or create team folder.')
  }
  const drive = getDriveClient()
  const existing = await findFolderByName(deptFolderId, cleanTeamId)
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      isNew: false
    }
  }
  // Create ONLY the team folder inside deptFolderId
  const response = await drive.files.create({
    resource: {
      name: cleanTeamId,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [deptFolderId]
    },
    fields: 'id, name',
    supportsAllDrives: true
  })
  return {
    id: response.data.id,
    name: response.data.name,
    isNew: true
  }
}

/**
 * Reads the current Phase 2 submission for a given department and team from Google Drive
 */
async function getPhase2Submission(departmentName, teamId) {
  const deptFolder = await getPhase2DepartmentFolder(departmentName)
  const cleanTeamId = (teamId || '').trim()
  const teamFolder = await findFolderByName(deptFolder.id, cleanTeamId)
  if (!teamFolder) {
    return {
      hasSubmission: false,
      file: null,
      status: 'INCOMPLETE',
      completion: { uploadedCount: 0, requiredCount: 1, isComplete: false }
    }
  }
  const drive = getDriveClient()
  const children = await drive.files.list({
    q: `'${teamFolder.id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, webContentLink)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })
  const files = (children.data.files || []).sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime))
  if (files.length === 0) {
    return {
      hasSubmission: false,
      file: null,
      status: 'INCOMPLETE',
      completion: { uploadedCount: 0, requiredCount: 1, isComplete: false }
    }
  }
  const file = files[0]
  return {
    hasSubmission: true,
    status: 'PENDING',
    file: {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      modifiedTime: file.modifiedTime,
      webViewLink: file.webViewLink,
      webContentLink: file.webContentLink
    },
    completion: { uploadedCount: 1, requiredCount: 1, isComplete: true }
  }
}

/**
 * Uploads or replaces the Phase 2 file in the team folder.
 * Ensures strictly ONE file exists by deleting any existing files in the team folder first.
 */
async function uploadOrReplacePhase2File(departmentName, teamId, fileBuffer, originalFilename, mimeType) {
  const cleanTeamId = (teamId || '').trim()
  const deptFolder = await getPhase2DepartmentFolder(departmentName)
  const teamFolder = await getOrCreatePhase2TeamFolder(deptFolder.id, cleanTeamId)
  const drive = getDriveClient()

  // 1. Check and clean up any existing files in the team folder (no duplicates)
  const existingFilesRes = await drive.files.list({
    q: `'${teamFolder.id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })
  const existingFiles = existingFilesRes.data.files || []
  for (const ef of existingFiles) {
    try {
      await deleteFile(ef.id)
    } catch (delErr) {
      console.warn(`[GoogleDrive] Failed to delete old Phase 2 file ${ef.id}:`, delErr.message)
    }
  }

  // 2. Canonical upload filename: TEAM-ID_<TEMPLATE BASE NAME>.<uploaded-extension>
  let templateBaseName = 'IPL 2026 – Product + Business Pitch Deck'
  try {
    const template = await getPhase2Template()
    if (template && template.name) {
      templateBaseName = template.name.replace(/\.[^/.]+$/, '')
    }
  } catch (tErr) {
    console.warn('[GoogleDrive] Could not dynamically fetch template name for canonical naming:', tErr.message)
  }
  const ext = path.extname(originalFilename || '') || '.pptx'
  const canonicalName = `${cleanTeamId}_${templateBaseName}${ext}`

  const response = await drive.files.create({
    resource: {
      name: canonicalName,
      parents: [teamFolder.id]
    },
    media: {
      mimeType: mimeType || 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      body: Readable.from(fileBuffer)
    },
    fields: 'id, name, mimeType, size, modifiedTime, webViewLink, webContentLink',
    supportsAllDrives: true
  })

  return response.data
}

/**
 * Removes the Phase 2 submission file for a team
 */
async function removePhase2File(departmentName, teamId, fileId) {
  const cleanTeamId = (teamId || '').trim()
  const deptFolder = await getPhase2DepartmentFolder(departmentName)
  const teamFolder = await findFolderByName(deptFolder.id, cleanTeamId)
  if (!teamFolder) {
    return true
  }
  const drive = getDriveClient()
  if (fileId) {
    try {
      await deleteFile(fileId)
    } catch (err) {
      const status = err.status || err.code
      if (status !== 404 && (!err.message || !err.message.toLowerCase().includes('not found'))) {
        throw err
      }
    }
  } else {
    // Delete all files in team folder
    const filesRes = await drive.files.list({
      q: `'${teamFolder.id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    })
    for (const f of (filesRes.data.files || [])) {
      try {
        await deleteFile(f.id)
      } catch (err) {
        console.warn(`[GoogleDrive] Failed to delete file ${f.id}:`, err.message)
      }
    }
  }
  return true
}

let cachedP2DeptFolders = null
let cachedP2DeptTimestamp = 0
const DEPT_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getPhase2DepartmentFoldersList() {
  const now = Date.now()
  if (cachedP2DeptFolders && (now - cachedP2DeptTimestamp < DEPT_CACHE_TTL)) {
    return cachedP2DeptFolders
  }
  const p2Folder = await getPhase2RootFolder()
  const drive = getDriveClient()
  const res = await drive.files.list({
    q: `'${p2Folder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })
  const folders = (res.data.files || []).filter(f => normalizeName(f.name) !== 'templete' && normalizeName(f.name) !== 'templates')
  cachedP2DeptFolders = folders
  cachedP2DeptTimestamp = now
  return folders
}

/**
 * Retrieves all Phase 2 submissions across all departments and teams in Google Drive
 */
async function getAllPhase2Submissions() {
  const drive = getDriveClient()
  const deptFolders = await getPhase2DepartmentFoldersList()
  if (!deptFolders || deptFolders.length === 0) return {}

  const deptMap = {}
  deptFolders.forEach(d => { deptMap[d.id] = d.name })

  const deptFolderIds = deptFolders.map(d => d.id)
  const parentQuery = deptFolderIds.map(id => `'${id}' in parents`).join(' or ')

  const teamFoldersRes = await drive.files.list({
    q: `(${parentQuery}) and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, parents)',
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })

  const teamFolders = teamFoldersRes.data.files || []
  if (teamFolders.length === 0) return {}

  const teamFolderMap = {}
  teamFolders.forEach(tf => {
    const parentDeptId = tf.parents ? tf.parents[0] : null
    const deptName = parentDeptId ? deptMap[parentDeptId] : null
    teamFolderMap[tf.id] = { teamId: tf.name, department: deptName }
  })

  const tfIds = teamFolders.map(t => t.id)
  const tfQuery = tfIds.map(id => `'${id}' in parents`).join(' or ')

  const filesRes = await drive.files.list({
    q: `(${tfQuery}) and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, webContentLink, parents)',
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })

  const files = filesRes.data.files || []
  const resultMap = {}
  files.forEach(f => {
    const parentTfId = f.parents ? f.parents[0] : null
    const meta = teamFolderMap[parentTfId]
    if (meta && meta.teamId) {
      resultMap[meta.teamId] = {
        department: meta.department,
        file: {
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size,
          modifiedTime: f.modifiedTime,
          webViewLink: f.webViewLink,
          webContentLink: f.webContentLink
        }
      }
    }
  })

  return resultMap
}

/**
 * Phase 3 Shortlist Google Drive Integration Helpers
 */

/**
 * List available candidate Phase 3 shortlist source files from Google Drive
 * Scoped to ROOT_FOLDER_ID and its direct subfolders (e.g. Phase 3, Shortlist).
 * Filters for Excel (.xlsx, .xls) and CSV (.csv) files and Google Sheets.
 * Returns sanitized metadata list with ZERO credential exposure.
 *
 * @param {string} [customFolderId] Optional custom folder ID to search within
 * @returns {Promise<Array<{ file_id: string, name: string, mime_type: string, size: number | null, modified_time: string | null, web_view_link: string | null }>>}
 */
async function listPhase3ShortlistFiles(customFolderId = null) {
  const drive = getDriveClient()
  const rootId = customFolderId || ROOT_FOLDER_ID

  const folderIds = [rootId]
  try {
    const subfoldersRes = await drive.files.list({
      q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    })
    const subfolders = subfoldersRes.data?.files || []
    for (const f of subfolders) {
      const norm = (f.name || '').toLowerCase()
      if (norm.includes('phase 3') || norm.includes('phase3') || norm.includes('shortlist') || norm.includes('admin')) {
        folderIds.push(f.id)
      }
    }
  } catch (err) {
    console.warn('[GoogleDriveService] Note querying subfolders for shortlist files:', err.message)
  }

  const parentQuery = folderIds.length === 1
    ? `'${folderIds[0]}' in parents`
    : `(${folderIds.map(id => `'${id}' in parents`).join(' or ')})`

  const mimeOrNameQuery = `(${[
    "mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'",
    "mimeType = 'application/vnd.ms-excel'",
    "mimeType = 'text/csv'",
    "mimeType = 'application/vnd.google-apps.spreadsheet'",
    "name contains '.xlsx'",
    "name contains '.xls'",
    "name contains '.csv'"
  ].join(' or ')})`

  const response = await drive.files.list({
    q: `${parentQuery} and trashed = false and ${mimeOrNameQuery}`,
    fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  })

  const files = response.data?.files || []

  // Map to safe, sanitized metadata
  const results = files.map(f => ({
    file_id: f.id,
    name: f.name,
    mime_type: f.mimeType,
    size: f.size ? parseInt(f.size, 10) : null,
    modified_time: f.modifiedTime || null,
    web_view_link: f.webViewLink || null
  }))

  results.sort((a, b) => new Date(b.modified_time || 0) - new Date(a.modified_time || 0))

  return results
}

/**
 * Download a candidate shortlist file from Google Drive into a memory Buffer.
 * Supports binary Excel (.xlsx, .xls), CSV, and exports Google Sheets.
 * Strictly verifies fileId safety (no path traversal, no URLs).
 * Enforces file size limits (max 15MB) and supported MIME types.
 *
 * @param {string} fileId
 * @returns {Promise<{ buffer: Buffer, metadata: { file_id: string, name: string, mime_type: string, size: number, modified_time: string | null, web_view_link: string | null } }>}
 */
async function downloadDriveFileToBuffer(fileId) {
  if (!fileId || typeof fileId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(fileId.trim())) {
    const err = new Error('Invalid Google Drive file ID format.')
    err.code = 'INVALID_FILE_ID'
    err.status = 400
    throw err
  }

  const cleanFileId = fileId.trim()
  const drive = getDriveClient()

  // 1. Fetch metadata
  let metadata
  try {
    const metaRes = await drive.files.get({
      fileId: cleanFileId,
      fields: 'id, name, mimeType, size, modifiedTime, webViewLink, trashed, parents',
      supportsAllDrives: true
    })
    metadata = metaRes.data
  } catch (apiErr) {
    const err = new Error(apiErr.message || 'Error accessing Drive file')
    if (apiErr.status === 404 || apiErr.code === 404) {
      err.code = 'DRIVE_FILE_NOT_FOUND'
      err.status = 404
      err.message = 'The requested Google Drive file was not found.'
    } else if (apiErr.status === 403 || apiErr.code === 403) {
      err.code = 'DRIVE_PERMISSION_DENIED'
      err.status = 403
      err.message = 'Permission denied accessing the requested Google Drive file.'
    } else {
      err.code = 'DRIVE_FILE_UNAVAILABLE'
      err.status = 502
    }
    throw err
  }

  if (!metadata || metadata.trashed) {
    const err = new Error('The requested Google Drive file is in trash or unavailable.')
    err.code = 'DRIVE_FILE_NOT_FOUND'
    err.status = 404
    throw err
  }

  // 2. Validate file type and extension
  const fileName = metadata.name || ''
  const ext = path.extname(fileName).toLowerCase()
  const mime = (metadata.mimeType || '').toLowerCase()

  const isGoogleSheet = mime === 'application/vnd.google-apps.spreadsheet'
  const isExcel = ext === '.xlsx' || ext === '.xls' || mime.includes('spreadsheet') || mime.includes('ms-excel')
  const isCsv = ext === '.csv' || mime.includes('csv') || (ext === '.csv' && mime.includes('text/plain'))

  if (!isGoogleSheet && !isExcel && !isCsv) {
    const err = new Error(`Unsupported file type: '${fileName}'. Only .xlsx, .xls, and .csv files or Google Sheets are supported.`)
    err.code = 'DRIVE_UNSUPPORTED_TYPE'
    err.status = 422
    throw err
  }

  // 3. Check declared size if available (max 15MB)
  const MAX_BYTES = 15 * 1024 * 1024
  if (metadata.size && parseInt(metadata.size, 10) > MAX_BYTES) {
    const err = new Error(`Drive file size exceeds maximum limit of 15MB.`)
    err.code = 'DRIVE_FILE_TOO_LARGE'
    err.status = 413
    throw err
  }

  // 4. Download / Export buffer
  let buffer
  try {
    if (isGoogleSheet) {
      const exportRes = await drive.files.export({
        fileId: cleanFileId,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }, { responseType: 'arraybuffer' })
      buffer = Buffer.from(exportRes.data)
    } else {
      const downloadRes = await drive.files.get({
        fileId: cleanFileId,
        alt: 'media',
        supportsAllDrives: true
      }, { responseType: 'arraybuffer' })
      buffer = Buffer.from(downloadRes.data)
    }
  } catch (dlErr) {
    const err = new Error('Failed to download file from Google Drive: ' + dlErr.message)
    err.code = 'DRIVE_DOWNLOAD_FAILED'
    err.status = 502
    throw err
  }

  if (!buffer || buffer.length === 0) {
    const err = new Error('Drive file is empty (0 bytes).')
    err.code = 'DRIVE_EMPTY_FILE'
    err.status = 422
    throw err
  }

  if (buffer.length > MAX_BYTES) {
    const err = new Error(`Exported file size exceeds maximum limit of 15MB.`)
    err.code = 'DRIVE_FILE_TOO_LARGE'
    err.status = 413
    throw err
  }

  return {
    buffer,
    metadata: {
      file_id: metadata.id,
      name: metadata.name,
      mime_type: metadata.mimeType,
      size: buffer.length,
      modified_time: metadata.modifiedTime || null,
      web_view_link: metadata.webViewLink || null
    }
  }
}

module.exports = {
  ROOT_FOLDER_ID,
  TEMPLATES_FOLDER_ID,
  getDriveClient,
  setDriveClientForTesting,
  listFolderChildren,
  findFolderByName,
  findFileByName,
  getPhaseFolder,
  getDepartmentFolder,
  getCategoryFolder,
  getPatentTypeFolder,
  getOrCreateTeamFolder,
  listTemplates,
  validateTemplate,
  listTeamSubmissions,
  uploadFileToFolder,
  updateOrUploadFileToFolder,
  getFileMetadata,
  streamFile,
  deleteFile,
  getOrCreateVotingReportsFolder,
  uploadVotingReportToDrive,
  listVotingReportsFromDrive,
  // Phase 2 exports
  getPhase2RootFolder,
  getPhase2TemplateFolder,
  getPhase2Template,
  getPhase2DepartmentFolder,
  getOrCreatePhase2TeamFolder,
  getPhase2Submission,
  uploadOrReplacePhase2File,
  removePhase2File,
  getAllPhase2Submissions,
  // Phase 3 Shortlist exports
  listPhase3ShortlistFiles,
  downloadDriveFileToBuffer
}

