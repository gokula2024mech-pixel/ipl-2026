/**
 * backend/services/phase3LinkedInDriveService.js
 * 
 * Google Drive Phase 3 LinkedIn Submissions Spreadsheet Storage Service.
 * Manages the authoritative spreadsheet in Google Drive at:
 *   IPL2026/
 *   └── Phase3/
 *       └── ExcelSheet/
 *           └── Phase3_LinkedIn_Submissions
 * 
 * Features:
 * - Automatically discovers or creates the folder hierarchy under Root Google Drive.
 * - Manages one row per registered team using `registration_id` as the primary key.
 * - Columns use `*_linkedin_post_link` to clearly indicate LinkedIn post links.
 * - Professional header formatting: Navy background (#0B1B3A), Bold White text (#FFFFFF),
 *   centered horizontal and vertical alignment, text wrapping, frozen header row, and sensible column widths.
 * - Targeted column updates for leader, member1, and member2 slots.
 * - Concurrency mutex lock to prevent concurrent overwrites.
 * - Supports all registered teams (both shortlisted and non-shortlisted).
 * - Zero exposure of Google credentials to clients.
 * - Supports exporting as .xlsx.
 */

const { google } = require('googleapis');
const XLSX = require('xlsx');
const { Readable } = require('stream');
const path = require('path');
const {
  getDriveClient,
  ROOT_FOLDER_ID,
  findFolderByName,
  findFileByName,
  setDriveClientForTesting
} = require('./googleDriveService');

// Canonical Column Structure (Task 1: *_linkedin_post_link)
const HEADERS = [
  'registration_id',
  'team_id',
  'team_name',
  'leader_name',
  'leader_email',
  'leader_linkedin_post_link',
  'member1_name',
  'member1_email',
  'member1_linkedin_post_link',
  'member2_name',
  'member2_email',
  'member2_linkedin_post_link',
  'last_updated',
  'created_at'
];

const SPREADSHEET_NAME = 'Phase3_LinkedIn_Submissions';
const EXCEL_FOLDER_NAME = 'ExcelSheet';
const PHASE3_FOLDER_NAME = 'Phase3';

// In-memory cache for discovered Drive IDs
let cachedPhase3FolderId = null;
let cachedExcelFolderId = null;
let cachedSpreadsheetFileId = null;
let cachedSpreadsheetMimeType = null;

// Mock store for isolated testing
let mockStore = null;

/**
 * Set or clear mock store for testing
 * @param {Array<Object>|null} store 
 */
function setMockStoreForTesting(store) {
  mockStore = store;
}

/**
 * Reset cached folder and file IDs
 */
function resetCacheForTesting() {
  cachedPhase3FolderId = null;
  cachedExcelFolderId = null;
  cachedSpreadsheetFileId = null;
  cachedSpreadsheetMimeType = null;
  mockStore = null;
}

// Sequential write lock to protect against race conditions
let writeLock = Promise.resolve();
function withWriteLock(fn) {
  const next = writeLock.then(fn, fn);
  writeLock = next.catch(() => {});
  return next;
}

/**
 * Helper to normalize string for matching
 */
function norm(str) {
  return (str || '').toString().toLowerCase().trim().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Apply professional formatting to worksheet header row
 * - Sensible column widths
 * - Header row height 32pt
 * - Freeze header row 1
 * - Bold text, centered horizontal & vertical, white text (#FFFFFF), Navy background (#0B1B3A)
 * @param {Object} ws - SheetJS worksheet
 */
function applyHeaderFormatting(ws) {
  // Sensible column widths ensuring names, emails, and URLs are readable
  ws['!cols'] = [
    { wch: 18 }, // registration_id
    { wch: 38 }, // team_id
    { wch: 28 }, // team_name
    { wch: 24 }, // leader_name
    { wch: 30 }, // leader_email
    { wch: 45 }, // leader_linkedin_post_link
    { wch: 24 }, // member1_name
    { wch: 30 }, // member1_email
    { wch: 45 }, // member1_linkedin_post_link
    { wch: 24 }, // member2_name
    { wch: 30 }, // member2_email
    { wch: 45 }, // member2_linkedin_post_link
    { wch: 28 }, // last_updated
    { wch: 28 }  // created_at
  ];

  // Header row height: 32pt so wrapped text remains clean
  ws['!rows'] = [{ hpt: 32, hpx: 32 }];

  // Freeze top row
  ws['!freeze'] = { xSplit: "A", ySplit: "2", topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
  ws['!views'] = [{ state: 'frozen', ySplit: 1 }];

  // Header cell styles matching IPL 2026 primary identity (Deep Navy #0B1B3A)
  // With visual distinction for the 3 LinkedIn post link columns (Accent Navy #1E3A8A)
  const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];
  colLetters.forEach((col, idx) => {
    const addr = `${col}1`;
    if (!ws[addr]) {
      ws[addr] = { t: 's', v: HEADERS[idx] };
    }
    const isLinkedInCol = [5, 8, 11].includes(idx); // F (leader), I (member1), L (member2)
    const bgColor = isLinkedInCol ? "1E3A8A" : "0B1B3A";

    ws[addr].s = {
      font: { bold: true, color: { rgb: "FFFFFF" }, name: "Calibri", sz: 11 },
      fill: { fgColor: { rgb: bgColor }, patternType: "solid" },
      alignment: { horizontal: "center", vertical: "center", wrapText: true }
    };
    if (isLinkedInCol) {
      ws[addr].isLinkedInHeader = true;
    }
  });
}

/**
 * Resolve the Google Drive folder hierarchy:
 * Root -> Phase3 -> ExcelSheet
 * Returns { phase3FolderId, excelFolderId }
 */
async function resolveFolders() {
  if (cachedExcelFolderId && cachedPhase3FolderId) {
    return {
      phase3FolderId: cachedPhase3FolderId,
      excelFolderId: cachedExcelFolderId
    };
  }

  const drive = getDriveClient();
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || ROOT_FOLDER_ID;

  // 1. Locate Phase3 folder under Root
  let phase3Folder = null;
  try {
    const children = await drive.files.list({
      q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    });
    const folders = children.data?.files || [];
    phase3Folder = folders.find(f => {
      const n = norm(f.name);
      return n === 'phase3' || n === 'phase 3' || n === 'phase_3';
    });
  } catch (err) {
    console.warn('[Phase3LinkedInDrive] Error listing root folder:', err.message);
  }

  if (!phase3Folder) {
    // Create Phase3 folder if not found
    console.log('[Phase3LinkedInDrive] Creating Phase3 folder in root...');
    const createRes = await drive.files.create({
      resource: {
        name: PHASE3_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootId]
      },
      fields: 'id, name',
      supportsAllDrives: true
    });
    phase3Folder = createRes.data;
  }
  cachedPhase3FolderId = phase3Folder.id;

  // 2. Locate or create ExcelSheet folder inside Phase3
  let excelFolder = null;
  try {
    const p3Children = await drive.files.list({
      q: `'${cachedPhase3FolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    });
    const p3Folders = p3Children.data?.files || [];
    excelFolder = p3Folders.find(f => norm(f.name) === 'excelsheet' || norm(f.name) === 'excel sheet');
  } catch (err) {
    console.warn('[Phase3LinkedInDrive] Error searching ExcelSheet folder:', err.message);
  }

  if (!excelFolder) {
    console.log('[Phase3LinkedInDrive] Creating ExcelSheet folder in Phase3...');
    const createExcelRes = await drive.files.create({
      resource: {
        name: EXCEL_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [cachedPhase3FolderId]
      },
      fields: 'id, name',
      supportsAllDrives: true
    });
    excelFolder = createExcelRes.data;
  }
  cachedExcelFolderId = excelFolder.id;

  return {
    phase3FolderId: cachedPhase3FolderId,
    excelFolderId: cachedExcelFolderId
  };
}

/**
 * Locate or create the authoritative Phase3_LinkedIn_Submissions spreadsheet
 * inside IPL2026/Phase3/ExcelSheet/
 */
async function resolveSpreadsheetFile() {
  if (cachedSpreadsheetFileId) {
    return {
      fileId: cachedSpreadsheetFileId,
      mimeType: cachedSpreadsheetMimeType
    };
  }

  const { excelFolderId } = await resolveFolders();
  const drive = getDriveClient();

  // Search for Phase3_LinkedIn_Submissions in ExcelSheet folder
  const searchRes = await drive.files.list({
    q: `'${excelFolderId}' in parents and trashed = false and (name = '${SPREADSHEET_NAME}' or name = '${SPREADSHEET_NAME}.xlsx')`,
    fields: 'files(id, name, mimeType)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });

  const files = searchRes.data?.files || [];
  if (files.length > 0) {
    cachedSpreadsheetFileId = files[0].id;
    cachedSpreadsheetMimeType = files[0].mimeType;
    return {
      fileId: cachedSpreadsheetFileId,
      mimeType: cachedSpreadsheetMimeType
    };
  }

  // File does not exist yet: create empty workbook with formatted headers
  console.log('[Phase3LinkedInDrive] Creating new authoritative Phase3_LinkedIn_Submissions spreadsheet in Drive...');
  const emptyWs = XLSX.utils.json_to_sheet([], { header: HEADERS });
  applyHeaderFormatting(emptyWs);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, emptyWs, 'Submissions');
  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });

  const stream = new Readable();
  stream.push(xlsxBuffer);
  stream.push(null);

  // Create as native Google Sheet by setting mimeType to spreadsheet and passing xlsx stream
  const createRes = await drive.files.create({
    resource: {
      name: SPREADSHEET_NAME,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [excelFolderId]
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: stream
    },
    fields: 'id, name, mimeType',
    supportsAllDrives: true
  });

  cachedSpreadsheetFileId = createRes.data.id;
  cachedSpreadsheetMimeType = createRes.data.mimeType;

  return {
    fileId: cachedSpreadsheetFileId,
    mimeType: cachedSpreadsheetMimeType
  };
}

/**
 * Read all rows from the authoritative Drive spreadsheet
 * Migrates legacy column names to *_linkedin_post_link while maintaining backward compatibility.
 * @returns {Promise<Array<Object>>} Array of row objects
 */
async function readSubmissionsFromDrive() {
  if (mockStore) {
    const cloned = JSON.parse(JSON.stringify(mockStore));
    cloned.forEach(r => {
      // Migrate legacy names only when canonical post_link is not present
      if (r.leader_linkedin_url && r.leader_linkedin_post_link === undefined) r.leader_linkedin_post_link = r.leader_linkedin_url;
      if (r.member1_linkedin_url && r.member1_linkedin_post_link === undefined) r.member1_linkedin_post_link = r.member1_linkedin_url;
      if (r.member2_linkedin_url && r.member2_linkedin_post_link === undefined) r.member2_linkedin_post_link = r.member2_linkedin_url;

      // Provide backward compatibility aliases
      r.leader_linkedin_url = r.leader_linkedin_post_link || '';
      r.member1_linkedin_url = r.member1_linkedin_post_link || '';
      r.member2_linkedin_url = r.member2_linkedin_post_link || '';
    });
    return cloned;
  }

  const { fileId, mimeType } = await resolveSpreadsheetFile();
  const drive = getDriveClient();

  let buffer;
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    const exportRes = await drive.files.export({
      fileId: fileId,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }, { responseType: 'arraybuffer' });
    buffer = Buffer.from(exportRes.data);
  } else {
    const downloadRes = await drive.files.get({
      fileId: fileId,
      alt: 'media',
      supportsAllDrives: true
    }, { responseType: 'arraybuffer' });
    buffer = Buffer.from(downloadRes.data);
  }

  if (!buffer || buffer.length === 0) {
    return [];
  }

  const wb = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = wb.SheetNames[0] || 'Submissions';
  const ws = wb.Sheets[firstSheetName];
  if (!ws) return [];

  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  // Migrate legacy column names to canonical *_linkedin_post_link only when not defined
  rawRows.forEach(r => {
    if (r.leader_linkedin_url && r.leader_linkedin_post_link === undefined) {
      r.leader_linkedin_post_link = r.leader_linkedin_url;
    }
    if (r.member1_linkedin_url && r.member1_linkedin_post_link === undefined) {
      r.member1_linkedin_post_link = r.member1_linkedin_url;
    }
    if (r.member2_linkedin_url && r.member2_linkedin_post_link === undefined) {
      r.member2_linkedin_post_link = r.member2_linkedin_url;
    }

    // Maintain backward-compatible aliases on row objects
    r.leader_linkedin_url = r.leader_linkedin_post_link || '';
    r.member1_linkedin_url = r.member1_linkedin_post_link || '';
    r.member2_linkedin_url = r.member2_linkedin_post_link || '';
  });

  return rawRows;
}

/**
 * Write rows array back to the authoritative Drive spreadsheet
 * Applies canonical column headers and professional formatting.
 * @param {Array<Object>} rows 
 */
async function writeSubmissionsToDrive(rows) {
  if (mockStore) {
    mockStore = JSON.parse(JSON.stringify(rows));
    return;
  }

  const { fileId } = await resolveSpreadsheetFile();
  const drive = getDriveClient();

  // Normalize row objects to only output the 14 canonical columns
  const cleanRows = rows.map(r => {
    const clean = {};
    HEADERS.forEach(h => {
      clean[h] = r[h] !== undefined && r[h] !== null ? r[h] : '';
    });
    return clean;
  });

  const ws = XLSX.utils.json_to_sheet(cleanRows, { header: HEADERS });
  applyHeaderFormatting(ws);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Submissions');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });

  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  await drive.files.update({
    fileId: fileId,
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: stream
    },
    supportsAllDrives: true
  });
}

/**
 * Save or update a team member's LinkedIn URL in the Google Drive spreadsheet.
 * Safely updates only the specified role's URL column, preserving all others.
 * 
 * @param {Object} params
 * @param {string} params.registrationId - Registration ID (e.g. 'IPL26-101')
 * @param {string} params.teamId - Team UUID
 * @param {string} params.teamName - Team Name
 * @param {string} params.leaderName - Team Leader Name
 * @param {string} params.leaderEmail - Team Leader Email
 * @param {string} params.member1Name - Member 1 Name
 * @param {string} params.member1Email - Member 1 Email
 * @param {string} params.member2Name - Member 2 Name
 * @param {string} params.member2Email - Member 2 Email
 * @param {('leader'|'member1'|'member2')} params.role - The slot being submitted
 * @param {string} params.linkedinUrl - Validated LinkedIn Post URL
 * @returns {Promise<Object>} The updated team row
 */
async function saveSubmissionToDrive(params) {
  const {
    registrationId,
    teamId,
    teamName,
    leaderName,
    leaderEmail,
    member1Name,
    member1Email,
    member2Name,
    member2Email,
    role,
    linkedinUrl
  } = params;

  if (!registrationId) {
    throw new Error('registrationId is required for spreadsheet storage.');
  }

  const cleanRegId = registrationId.toString().trim().toUpperCase();
  const normRole = (role || '').toLowerCase().trim();
  const trimmedUrl = (linkedinUrl || '').trim();
  const nowIso = new Date().toISOString();

  return withWriteLock(async () => {
    const rows = await readSubmissionsFromDrive();
    let existingIndex = rows.findIndex(
      r => (r.registration_id || '').toString().trim().toUpperCase() === cleanRegId
    );

    let row;
    if (existingIndex >= 0) {
      // Update existing team row
      row = rows[existingIndex];

      // Update authoritative info if missing
      if (!row.team_id && teamId) row.team_id = teamId;
      if (!row.team_name && teamName) row.team_name = teamName;
      if (leaderName && !row.leader_name) row.leader_name = leaderName;
      if (leaderEmail && !row.leader_email) row.leader_email = leaderEmail;
      if (member1Name && !row.member1_name) row.member1_name = member1Name;
      if (member1Email && !row.member1_email) row.member1_email = member1Email;
      if (member2Name && !row.member2_name) row.member2_name = member2Name;
      if (member2Email && !row.member2_email) row.member2_email = member2Email;

      // Update ONLY the selected person's post link column
      if (normRole === 'leader') {
        row.leader_linkedin_post_link = trimmedUrl;
        row.leader_linkedin_url = trimmedUrl; // alias
      } else if (normRole === 'member1') {
        row.member1_linkedin_post_link = trimmedUrl;
        row.member1_linkedin_url = trimmedUrl; // alias
      } else if (normRole === 'member2') {
        row.member2_linkedin_post_link = trimmedUrl;
        row.member2_linkedin_url = trimmedUrl; // alias
      }

      row.last_updated = nowIso;
      rows[existingIndex] = row;
    } else {
      // First submission for this team: create one authoritative row
      row = {
        registration_id: cleanRegId,
        team_id: teamId || '',
        team_name: teamName || '',
        leader_name: leaderName || '',
        leader_email: leaderEmail || '',
        leader_linkedin_post_link: normRole === 'leader' ? trimmedUrl : '',
        member1_name: member1Name || '',
        member1_email: member1Email || '',
        member1_linkedin_post_link: normRole === 'member1' ? trimmedUrl : '',
        member2_name: member2Name || '',
        member2_email: member2Email || '',
        member2_linkedin_post_link: normRole === 'member2' ? trimmedUrl : '',
        last_updated: nowIso,
        created_at: nowIso,
        // Backward-compatible aliases
        leader_linkedin_url: normRole === 'leader' ? trimmedUrl : '',
        member1_linkedin_url: normRole === 'member1' ? trimmedUrl : '',
        member2_linkedin_url: normRole === 'member2' ? trimmedUrl : ''
      };
      rows.push(row);
    }

    await writeSubmissionsToDrive(rows);
    return row;
  });
}

/**
 * Remove a LinkedIn URL slot for a team in the Google Drive spreadsheet.
 * Clears ONLY that person's URL cell, preserving all other slots.
 * 
 * @param {Object} params
 * @param {string} params.registrationId - Registration ID
 * @param {('leader'|'member1'|'member2')} params.role - Slot to clear
 * @returns {Promise<Object|null>} The updated row or null
 */
async function removeSubmissionFromDrive(params) {
  const { registrationId, teamId, role } = params;
  if (!registrationId && !teamId) {
    throw new Error('registrationId or teamId is required for removal.');
  }

  const cleanRegId = (registrationId || '').toString().trim().toUpperCase();
  const cleanTeamId = (teamId || '').toString().trim();
  const normRole = (role || '').toLowerCase().trim();
  const nowIso = new Date().toISOString();

  return withWriteLock(async () => {
    const rows = await readSubmissionsFromDrive();
    const idx = rows.findIndex(
      r => (cleanRegId && (r.registration_id || '').toString().trim().toUpperCase() === cleanRegId) ||
           (cleanTeamId && (r.team_id || '').toString().trim() === cleanTeamId)
    );

    if (idx < 0) {
      return null;
    }

    const row = rows[idx];
    if (normRole === 'leader') {
      row.leader_linkedin_post_link = '';
      row.leader_linkedin_url = '';
    } else if (normRole === 'member1') {
      row.member1_linkedin_post_link = '';
      row.member1_linkedin_url = '';
    } else if (normRole === 'member2') {
      row.member2_linkedin_post_link = '';
      row.member2_linkedin_url = '';
    }

    row.last_updated = nowIso;
    rows[idx] = row;

    await writeSubmissionsToDrive(rows);
    return row;
  });
}

/**
 * Export the authoritative Drive spreadsheet as a binary Excel Buffer (.xlsx)
 * @returns {Promise<{ buffer: Buffer, fileName: string }>}
 */
async function exportSubmissionsXlsx() {
  if (mockStore) {
    const cleanRows = (mockStore || []).map(r => {
      const clean = {};
      HEADERS.forEach(h => {
        clean[h] = r[h] !== undefined && r[h] !== null ? r[h] : '';
      });
      return clean;
    });
    const ws = XLSX.utils.json_to_sheet(cleanRows, { header: HEADERS });
    applyHeaderFormatting(ws);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Submissions');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });
    return {
      buffer,
      fileName: 'Phase3_LinkedIn_Submissions.xlsx'
    };
  }

  const { fileId, mimeType } = await resolveSpreadsheetFile();
  const drive = getDriveClient();

  let buffer;
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    const exportRes = await drive.files.export({
      fileId: fileId,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }, { responseType: 'arraybuffer' });
    buffer = Buffer.from(exportRes.data);
  } else {
    const downloadRes = await drive.files.get({
      fileId: fileId,
      alt: 'media',
      supportsAllDrives: true
    }, { responseType: 'arraybuffer' });
    buffer = Buffer.from(downloadRes.data);
  }

  return {
    buffer,
    fileName: 'Phase3_LinkedIn_Submissions.xlsx'
  };
}

module.exports = {
  HEADERS,
  SPREADSHEET_NAME,
  EXCEL_FOLDER_NAME,
  PHASE3_FOLDER_NAME,
  applyHeaderFormatting,
  resolveFolders,
  resolveSpreadsheetFile,
  readSubmissionsFromDrive,
  writeSubmissionsToDrive,
  saveSubmissionToDrive,
  removeSubmissionFromDrive,
  exportSubmissionsXlsx,
  setDriveClientForTesting,
  setMockStoreForTesting,
  resetCacheForTesting
};
