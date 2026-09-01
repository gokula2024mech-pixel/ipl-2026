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

  if (patentType && patentType.trim()) {
    const cleanType = patentType.trim().toLowerCase()
    let matchedFolder = null
    if (cleanType.includes('utility')) {
      matchedFolder = subfolders.find(f => f.name.toLowerCase().includes('utility'))
    } else if (cleanType.includes('design')) {
      matchedFolder = subfolders.find(f => f.name.toLowerCase().includes('design'))
    }

    if (matchedFolder) {
      targetFolderIds = [matchedFolder.id]
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
      allFiles.push(...response.data.files)
    }
  }

  // Deduplicate files by id
  const uniqueFilesMap = new Map()
  for (const f of allFiles) {
    if (!uniqueFilesMap.has(f.id)) {
      uniqueFilesMap.set(f.id, {
        id: f.id,
        name: f.name,
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

module.exports = {
  ROOT_FOLDER_ID,
  TEMPLATES_FOLDER_ID,
  getDriveClient,
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
  getFileMetadata,
  streamFile
}
