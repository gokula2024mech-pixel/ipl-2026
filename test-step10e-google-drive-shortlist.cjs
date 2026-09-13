// test-step10e-google-drive-shortlist.cjs
/**
 * STEP 10E Verification Test Suite: Phase 3 Shortlist Google Drive Integration
 * 
 * Verifies all 26 required test cases:
 * 1. Existing Drive service is reused.
 * 2. Admin can list shortlist files.
 * 3. Non-admin cannot list shortlist files.
 * 4. Admin can preview selected Drive file.
 * 5. Preview performs zero shortlist mutations.
 * 6. Non-admin cannot preview.
 * 7. Admin can sync selected Drive file.
 * 8. Non-admin cannot sync.
 * 9. Drive file content uses existing parseExcelBuffer().
 * 10. Manual upload and Drive upload produce equivalent validation.
 * 11. Invalid Drive file is rejected safely.
 * 12. Unsupported file type is rejected.
 * 13. Missing Drive file returns controlled error.
 * 14. Drive permission failure returns controlled error.
 * 15. Duplicate registrations are rejected.
 * 16. Missing registrations are rejected.
 * 17. Ambiguous multi-product mapping is rejected.
 * 18. Broken FULL_REPLACEMENT performs zero changes.
 * 19. Successful INCREMENTAL preserves existing shortlist.
 * 20. Successful FULL_REPLACEMENT removes only missing shortlist rows.
 * 21. Historical votes remain intact.
 * 22. Historical likes remain intact.
 * 23. Cache invalidation runs after successful sync.
 * 24. No credentials/tokens appear in API responses.
 * 25. Manual upload endpoint still works.
 * 26. No automatic background sync was introduced.
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const path = require('path');
const http = require('http');
const fs = require('fs');

const backendDir = path.resolve(__dirname, 'backend');
const backendRequire = (id) => require(require.resolve(id, { paths: [backendDir] }));

const XLSX = backendRequire('xlsx');
const express = backendRequire('express');

const googleDriveService = require('./backend/services/googleDriveService');
const shortlistService = require('./backend/services/phase3ShortlistService');
const ideaRoutes = require('./backend/routes/ideaRoutes');

let passedCount = 0;
let failedCount = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ ${desc}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ ${desc}`);
    console.error(`     Error: ${err.message}`);
    failedCount++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ ${desc}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ ${desc}`);
    console.error(`     Error: ${err.message}`);
    failedCount++;
  }
}

// Helpers to create Excel buffers
function createWorkbookBuffer(sheetsData) {
  const wb = XLSX.utils.book_new();
  for (const sheetName of Object.keys(sheetsData)) {
    const ws = XLSX.utils.aoa_to_sheet(sheetsData[sheetName]);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Mock Test Fixture Store
function createMockStore() {
  return {
    registrations: [
      { id: 'reg-0001', registration_id: 'IPL26-0001', team_name: 'Alpha Team', project_title: 'Alpha Project' },
      { id: 'reg-0002', registration_id: 'IPL26-0002', team_name: 'Beta Robotics', project_title: 'Beta Rover' },
      { id: 'reg-0003', registration_id: 'IPL26-0003', team_name: 'Gamma Tech', project_title: 'Gamma Sensor' },
      { id: 'reg-0004', registration_id: 'IPL26-0004', team_name: 'Delta Dynamics', project_title: 'Delta Drone' },
      { id: 'reg-0434', registration_id: 'IPL26-0434', team_name: 'ChameleX', project_title: 'Bio Camouflage' },
      { id: 'reg-0999', registration_id: 'IPL26-0999', team_name: 'Ambiguous Team', project_title: 'Ambiguous Project' }
    ],
    teams: [
      { id: 'team-0001', team_name: 'Alpha Team' },
      { id: 'team-0002', team_name: 'Beta Robotics' },
      { id: 'team-0003', team_name: 'Gamma Tech' },
      { id: 'team-0004', team_name: 'Delta Dynamics' },
      { id: 'team-0434', team_name: 'ChameleX' },
      { id: 'team-0999', team_name: 'Ambiguous Team' }
    ],
    products: [
      { id: 'prod-0001', team_id: 'team-0001', product_number: 1, product_title: 'Alpha Project', status: 'active', legacy_registration_id: 'IPL26-0001' },
      { id: 'prod-0002', team_id: 'team-0002', product_number: 1, product_title: 'Beta Rover', status: 'active', legacy_registration_id: 'IPL26-0002' },
      { id: 'prod-0003', team_id: 'team-0003', product_number: 1, product_title: 'Gamma Sensor', status: 'active', legacy_registration_id: 'IPL26-0003' },
      { id: 'prod-0004', team_id: 'team-0004', product_number: 1, product_title: 'Delta Drone', status: 'active', legacy_registration_id: 'IPL26-0004' },
      { id: 'prod-0434-1', team_id: 'team-0434', product_number: 1, product_title: 'Bio Camouflage', status: 'active', legacy_registration_id: 'IPL26-0434' },
      { id: 'prod-0434-2', team_id: 'team-0434', product_number: 2, product_title: 'Smart collector', status: 'active', legacy_registration_id: null },
      { id: 'prod-0999-1', team_id: 'team-0999', product_number: 1, product_title: 'Ambiguous 1', status: 'active', legacy_registration_id: null },
      { id: 'prod-0999-2', team_id: 'team-0999', product_number: 2, product_title: 'Ambiguous 2', status: 'active', legacy_registration_id: null }
    ],
    shortlist: [
      { registration_id: 'IPL26-0001', product_id: 'prod-0001', team_id: 'team-0001', category: 'HW', created_at: '2026-09-01T00:00:00Z' },
      { registration_id: 'IPL26-0002', product_id: 'prod-0002', team_id: 'team-0002', category: 'SW', created_at: '2026-09-01T00:00:00Z' }
    ],
    historical_votes: [
      { id: 'vote-1', product_id: 'prod-0001', voter_user_id: 'user-1', created_at: '2026-09-02T10:00:00Z' },
      { id: 'vote-2', product_id: 'prod-0002', voter_user_id: 'user-2', created_at: '2026-09-02T10:05:00Z' }
    ],
    historical_likes: [
      { id: 'like-1', product_id: 'prod-0001', count: 12 },
      { id: 'like-2', product_id: 'prod-0002', count: 8 }
    ]
  };
}

// Sample file buffers
const validXlsxBuffer = createWorkbookBuffer({
  'HW Shortlist': [
    ['S.No', 'Registration ID', 'Team Name', 'Project Title'],
    [1, 'IPL26-0001', 'Alpha Team', 'Alpha Project'],
    [2, 'IPL26-0003', 'Gamma Tech', 'Gamma Sensor']
  ],
  'SW Shortlist': [
    ['S.No', 'Registration ID', 'Team Name', 'Project Title'],
    [1, 'IPL26-0002', 'Beta Robotics', 'Beta Rover'],
    [2, 'IPL26-0004', 'Delta Dynamics', 'Delta Drone']
  ]
});

const duplicateXlsxBuffer = createWorkbookBuffer({
  'Sheet1': [
    ['Registration ID', 'Team Name'],
    ['IPL26-0001', 'Alpha Team'],
    ['IPL26-0001', 'Alpha Duplicate']
  ]
});

const missingXlsxBuffer = createWorkbookBuffer({
  'Sheet1': [
    ['Registration ID', 'Team Name'],
    ['IPL26-8888', 'Nonexistent Team']
  ]
});

const ambiguousXlsxBuffer = createWorkbookBuffer({
  'Sheet1': [
    ['Registration ID', 'Team Name'],
    ['IPL26-0999', 'Ambiguous Team']
  ]
});

// Mock Drive Files Directory
const mockDriveFilesStore = {
  'drive-valid-xlsx': {
    metadata: {
      id: 'drive-valid-xlsx',
      name: 'IPL2026_Phase3_Shortlist_Official.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: validXlsxBuffer.length,
      modifiedTime: '2026-09-13T10:00:00.000Z',
      webViewLink: 'https://drive.google.com/file/d/drive-valid-xlsx/view',
      trashed: false
    },
    buffer: validXlsxBuffer
  },
  'drive-gsheet': {
    metadata: {
      id: 'drive-gsheet',
      name: 'Organizer Shortlist Live Google Sheet',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      size: null,
      modifiedTime: '2026-09-13T11:00:00.000Z',
      webViewLink: 'https://docs.google.com/spreadsheets/d/drive-gsheet/view',
      trashed: false
    },
    buffer: validXlsxBuffer // exports as XLSX buffer
  },
  'drive-unsupported-pdf': {
    metadata: {
      id: 'drive-unsupported-pdf',
      name: 'shortlist_rules.pdf',
      mimeType: 'application/pdf',
      size: 5000,
      modifiedTime: '2026-09-13T09:00:00.000Z',
      trashed: false
    },
    buffer: Buffer.from('%PDF-1.4 Fake PDF Content')
  },
  'drive-empty-file': {
    metadata: {
      id: 'drive-empty-file',
      name: 'empty_shortlist.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 0,
      modifiedTime: '2026-09-13T09:30:00.000Z',
      trashed: false
    },
    buffer: Buffer.alloc(0)
  },
  'drive-corrupt-file': {
    metadata: {
      id: 'drive-corrupt-file',
      name: 'corrupt_shortlist.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 100,
      modifiedTime: '2026-09-13T09:45:00.000Z',
      trashed: false
    },
    buffer: Buffer.from('Corrupt non-excel header bytes 1234567890')
  },
  'drive-duplicate-xlsx': {
    metadata: {
      id: 'drive-duplicate-xlsx',
      name: 'duplicates.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: duplicateXlsxBuffer.length,
      modifiedTime: '2026-09-13T09:50:00.000Z',
      trashed: false
    },
    buffer: duplicateXlsxBuffer
  },
  'drive-missing-xlsx': {
    metadata: {
      id: 'drive-missing-xlsx',
      name: 'missing_ids.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: missingXlsxBuffer.length,
      modifiedTime: '2026-09-13T09:55:00.000Z',
      trashed: false
    },
    buffer: missingXlsxBuffer
  },
  'drive-ambiguous-xlsx': {
    metadata: {
      id: 'drive-ambiguous-xlsx',
      name: 'ambiguous_products.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: ambiguousXlsxBuffer.length,
      modifiedTime: '2026-09-13T09:58:00.000Z',
      trashed: false
    },
    buffer: ambiguousXlsxBuffer
  }
};

// Create Mock Google Drive Client
const mockDriveClient = {
  files: {
    list: async (params) => {
      // Return non-trashed files
      const files = Object.values(mockDriveFilesStore).map(item => ({ ...item.metadata }));
      return { data: { files } };
    },
    get: async (params, options) => {
      const fileId = params.fileId;
      if (fileId === 'drive-notfound') {
        const err = new Error('File not found');
        err.status = 404;
        err.code = 404;
        throw err;
      }
      if (fileId === 'drive-forbidden') {
        const err = new Error('Permission denied');
        err.status = 403;
        err.code = 403;
        throw err;
      }

      const item = mockDriveFilesStore[fileId];
      if (!item) {
        const err = new Error('File not found');
        err.status = 404;
        err.code = 404;
        throw err;
      }

      if (params.alt === 'media') {
        return { data: item.buffer };
      }
      return { data: { ...item.metadata } };
    },
    export: async (params, options) => {
      const fileId = params.fileId;
      const item = mockDriveFilesStore[fileId];
      if (!item) {
        const err = new Error('File not found');
        err.status = 404;
        err.code = 404;
        throw err;
      }
      return { data: item.buffer };
    }
  }
};

// Inject mock drive client into service
googleDriveService.setDriveClientForTesting(mockDriveClient);

// Build express test app
const app = express();
app.use(express.json());

let currentMockStore = createMockStore();
app.use((req, res, next) => {
  req.testStore = currentMockStore;
  next();
});

const shortlistRouter = require('./backend/routes/shortlistRoutes');
app.use('/api/admin/shortlist', shortlistRouter);

// HTTP client helper
function httpRequest(server, options, body = null, isMultipart = false) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port: port,
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(rawData);
        } catch (_) {
          json = rawData;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
          raw: rawData
        });
      });
    });

    req.on('error', reject);

    if (body) {
      if (isMultipart) {
        req.write(body);
      } else if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

// Multipart helper for manual upload testing
function createMultipartFormData(boundary, fieldName, filename, fileBuffer, otherFields = {}) {
  let postData = '';
  for (const [key, val] of Object.entries(otherFields)) {
    postData += `--${boundary}\r\n`;
    postData += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    postData += `${val}\r\n`;
  }
  postData += `--${boundary}\r\n`;
  postData += `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`;
  postData += `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;

  const preBuffer = Buffer.from(postData, 'utf8');
  const postBuffer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return Buffer.concat([preBuffer, fileBuffer, postBuffer]);
}

async function runAllTests() {
  console.log('\n====================================================');
  console.log('STEP 10E: Phase 3 Shortlist Google Drive Integration');
  console.log('====================================================\n');

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  const ADMIN_TOKEN = 'Bearer TEST_TOKEN_admin-01:admin@sece.ac.in:admin';
  const STUDENT_TOKEN = 'Bearer TEST_TOKEN_stud-01:student@sece.ac.in:student';

  try {
    // 1. Existing Drive service is reused
    it('1. Existing Drive service is reused', () => {
      assert(typeof googleDriveService.getDriveClient === 'function');
      assert(typeof googleDriveService.listPhase3ShortlistFiles === 'function');
      assert(typeof googleDriveService.downloadDriveFileToBuffer === 'function');
      assert(googleDriveService.ROOT_FOLDER_ID === '1dWIKn-jEu8-BCZrpw8YAUTeKvoJy2R5H');
    });

    // 2. Admin can list shortlist files
    await itAsync('2. Admin can list shortlist files', async () => {
      const res = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/files',
        method: 'GET',
        headers: { Authorization: ADMIN_TOKEN }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.source, 'google_drive');
      assert(Array.isArray(res.data.files));
      assert(res.data.files.length >= 2);
      // Verify safe metadata structure
      const validFile = res.data.files.find(f => f.file_id === 'drive-valid-xlsx');
      assert(validFile);
      assert.strictEqual(validFile.name, 'IPL2026_Phase3_Shortlist_Official.xlsx');
      assert.strictEqual(validFile.mime_type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });

    // 3. Non-admin cannot list shortlist files
    await itAsync('3. Non-admin cannot list shortlist files', async () => {
      // Student
      const resStud = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/files',
        method: 'GET',
        headers: { Authorization: STUDENT_TOKEN }
      });
      assert.strictEqual(resStud.statusCode, 403);
      assert.strictEqual(resStud.data.error_code, 'ADMIN_REQUIRED');

      // Anonymous
      const resAnon = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/files',
        method: 'GET'
      });
      assert.strictEqual(resAnon.statusCode, 401);
    });

    // 4. Admin can preview selected Drive file
    await itAsync('4. Admin can preview selected Drive file', async () => {
      const res = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/preview',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-valid-xlsx', mode: 'INCREMENTAL' });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.source, 'google_drive');
      assert.strictEqual(res.data.file_id, 'drive-valid-xlsx');
      assert(res.data.preview);
      assert.strictEqual(res.data.preview.is_valid, true);
      assert.strictEqual(res.data.preview.valid_registrations.length, 4);
    });

    // 5. Preview performs zero shortlist mutations
    await itAsync('5. Preview performs zero shortlist mutations', async () => {
      const beforeLen = currentMockStore.shortlist.length;
      const beforeIds = currentMockStore.shortlist.map(s => s.registration_id).sort();

      await httpRequest(server, {
        path: '/api/admin/shortlist/drive/preview',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-valid-xlsx', mode: 'FULL_REPLACEMENT' });

      const afterLen = currentMockStore.shortlist.length;
      const afterIds = currentMockStore.shortlist.map(s => s.registration_id).sort();

      assert.strictEqual(beforeLen, afterLen);
      assert.deepStrictEqual(beforeIds, afterIds);
    });

    // 6. Non-admin cannot preview
    await itAsync('6. Non-admin cannot preview', async () => {
      const res = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/preview',
        method: 'POST',
        headers: { Authorization: STUDENT_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-valid-xlsx' });
      assert.strictEqual(res.statusCode, 403);
    });

    // 7. Admin can sync selected Drive file
    await itAsync('7. Admin can sync selected Drive file', async () => {
      const res = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/sync',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-valid-xlsx', mode: 'INCREMENTAL' });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.source, 'google_drive');
      assert.strictEqual(res.data.total_shortlisted, 4);
      assert(currentMockStore.shortlist.some(s => s.registration_id === 'IPL26-0003'));
      assert(currentMockStore.shortlist.some(s => s.registration_id === 'IPL26-0004'));
    });

    // 8. Non-admin cannot sync
    await itAsync('8. Non-admin cannot sync', async () => {
      const res = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/sync',
        method: 'POST',
        headers: { Authorization: STUDENT_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-valid-xlsx' });
      assert.strictEqual(res.statusCode, 403);
    });

    // 9. Drive file content uses existing parseExcelBuffer()
    await itAsync('9. Drive file content uses existing parseExcelBuffer()', async () => {
      const { buffer } = await googleDriveService.downloadDriveFileToBuffer('drive-valid-xlsx');
      const parsed = shortlistService.parseExcelBuffer(buffer);
      assert(Array.isArray(parsed));
      assert.strictEqual(parsed.length, 4);
      assert.strictEqual(parsed[0].rawId, 'IPL26-0001');
      assert.strictEqual(parsed[0].sheet, 'HW Shortlist');
    });

    // 10. Manual upload and Drive upload produce equivalent validation
    await itAsync('10. Manual upload and Drive upload produce equivalent validation', async () => {
      // 1. Preview from Drive
      const driveRes = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/preview',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-valid-xlsx', mode: 'INCREMENTAL' });

      // 2. Preview from manual upload of same buffer
      const boundary = '----WebKitFormBoundaryTest12345';
      const multipartBody = createMultipartFormData(boundary, 'file', 'shortlist.xlsx', validXlsxBuffer);
      const manualRes = await httpRequest(server, {
        path: '/api/admin/shortlist/preview?mode=INCREMENTAL',
        method: 'POST',
        headers: {
          Authorization: ADMIN_TOKEN,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        }
      }, multipartBody, true);

      assert.strictEqual(driveRes.statusCode, 200);
      assert.strictEqual(manualRes.statusCode, 200);
      assert.strictEqual(driveRes.data.preview.total_rows_detected, manualRes.data.preview.total_rows_detected);
      assert.strictEqual(driveRes.data.preview.valid_registrations.length, manualRes.data.preview.valid_registrations.length);
      assert.strictEqual(driveRes.data.preview.is_valid, manualRes.data.preview.is_valid);
    });

    // 11. Invalid Drive file is rejected safely
    await itAsync('11. Invalid Drive file is rejected safely', async () => {
      // Empty file rejected with 422 DRIVE_EMPTY_FILE
      const emptyRes = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/preview',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-empty-file' });

      assert.strictEqual(emptyRes.statusCode, 422);
      assert.strictEqual(emptyRes.data.success, false);
      assert.strictEqual(emptyRes.data.error_code, 'DRIVE_EMPTY_FILE');

      // Corrupt / non-shortlist file marked invalid in preview and rejected on sync
      const corruptPreview = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/preview',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-corrupt-file' });

      assert.strictEqual(corruptPreview.statusCode, 200);
      assert.strictEqual(corruptPreview.data.preview.is_valid, false);

      const corruptSync = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/sync',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-corrupt-file' });

      assert.strictEqual(corruptSync.statusCode, 422);
      assert.strictEqual(corruptSync.data.success, false);
      assert.strictEqual(corruptSync.data.error_code, 'VALIDATION_FAILED');
    });

    // 12. Unsupported file type is rejected
    await itAsync('12. Unsupported file type is rejected', async () => {
      const res = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/preview',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-unsupported-pdf' });

      assert.strictEqual(res.statusCode, 422);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.error_code, 'DRIVE_UNSUPPORTED_TYPE');
    });

    // 13. Missing Drive file returns controlled error
    await itAsync('13. Missing Drive file returns controlled error', async () => {
      const res = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/preview',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-notfound' });

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.error_code, 'DRIVE_FILE_NOT_FOUND');
    });

    // 14. Drive permission failure returns controlled error
    await itAsync('14. Drive permission failure returns controlled error', async () => {
      const res = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/preview',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-forbidden' });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.error_code, 'DRIVE_PERMISSION_DENIED');
    });

    // 15. Duplicate registrations are rejected
    await itAsync('15. Duplicate registrations are rejected', async () => {
      const res = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/preview',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-duplicate-xlsx' });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.preview.is_valid, false);
      assert(res.data.preview.duplicates.length > 0);
      assert.strictEqual(res.data.preview.duplicates[0].registration_id, 'IPL26-0001');
    });

    // 16. Missing registrations are rejected
    await itAsync('16. Missing registrations are rejected', async () => {
      const res = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/preview',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-missing-xlsx' });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.preview.is_valid, false);
      assert(res.data.preview.missing_registration_ids.length > 0);
      assert.strictEqual(res.data.preview.missing_registration_ids[0].registration_id, 'IPL26-8888');
    });

    // 17. Ambiguous multi-product mapping is rejected
    await itAsync('17. Ambiguous multi-product mapping is rejected', async () => {
      const res = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/preview',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-ambiguous-xlsx' });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.preview.is_valid, false);
      assert(res.data.preview.ambiguous_products.length > 0);
      assert.strictEqual(res.data.preview.ambiguous_products[0].registration_id, 'IPL26-0999');
    });

    // 18. Broken FULL_REPLACEMENT performs zero changes
    await itAsync('18. Broken FULL_REPLACEMENT performs zero changes', async () => {
      currentMockStore = createMockStore();
      const initialShortlist = JSON.parse(JSON.stringify(currentMockStore.shortlist));

      const res = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/sync',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-duplicate-xlsx', mode: 'FULL_REPLACEMENT' });

      assert.strictEqual(res.statusCode, 422);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.error_code, 'VALIDATION_FAILED');
      // Verify shortlist is 100% unchanged
      assert.deepStrictEqual(currentMockStore.shortlist, initialShortlist);
    });

    // 19. Successful INCREMENTAL preserves existing shortlist
    await itAsync('19. Successful INCREMENTAL preserves existing shortlist', async () => {
      currentMockStore = createMockStore();
      // Initially has 0001, 0002
      const res = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/sync',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-valid-xlsx', mode: 'INCREMENTAL' });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(currentMockStore.shortlist.length, 4);
      assert(currentMockStore.shortlist.find(s => s.registration_id === 'IPL26-0001'));
      assert(currentMockStore.shortlist.find(s => s.registration_id === 'IPL26-0002'));
      assert(currentMockStore.shortlist.find(s => s.registration_id === 'IPL26-0003'));
      assert(currentMockStore.shortlist.find(s => s.registration_id === 'IPL26-0004'));
    });

    // 20. Successful FULL_REPLACEMENT removes only missing shortlist rows
    await itAsync('20. Successful FULL_REPLACEMENT removes only missing shortlist rows', async () => {
      currentMockStore = createMockStore();
      // Create a Drive file with only 0003 and 0004
      const replacementBuffer = createWorkbookBuffer({
        'Shortlist': [
          ['Registration ID'],
          ['IPL26-0003'],
          ['IPL26-0004']
        ]
      });
      mockDriveFilesStore['drive-replacement'] = {
        metadata: {
          id: 'drive-replacement',
          name: 'replacement.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: replacementBuffer.length,
          modifiedTime: '2026-09-13T12:00:00Z',
          trashed: false
        },
        buffer: replacementBuffer
      };

      const res = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/sync',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-replacement', mode: 'FULL_REPLACEMENT' });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.removed_count, 2); // 0001 and 0002 removed
      assert.strictEqual(currentMockStore.shortlist.length, 2);
      assert(!currentMockStore.shortlist.find(s => s.registration_id === 'IPL26-0001'));
      assert(!currentMockStore.shortlist.find(s => s.registration_id === 'IPL26-0002'));
      assert(currentMockStore.shortlist.find(s => s.registration_id === 'IPL26-0003'));
      assert(currentMockStore.shortlist.find(s => s.registration_id === 'IPL26-0004'));
    });

    // 21. Historical votes remain intact
    it('21. Historical votes remain intact', () => {
      assert.strictEqual(currentMockStore.historical_votes.length, 2);
      assert.strictEqual(currentMockStore.historical_votes[0].product_id, 'prod-0001');
      assert.strictEqual(currentMockStore.historical_votes[1].product_id, 'prod-0002');
    });

    // 22. Historical likes remain intact
    it('22. Historical likes remain intact', () => {
      assert.strictEqual(currentMockStore.historical_likes.length, 2);
      assert.strictEqual(currentMockStore.historical_likes[0].count, 12);
      assert.strictEqual(currentMockStore.historical_likes[1].count, 8);
    });

    // 23. Cache invalidation runs after successful sync
    await itAsync('23. Cache invalidation runs after successful sync', async () => {
      let cacheInvalidated = false;
      const originalInvalidate = ideaRoutes.invalidateLeaderboardCache;
      ideaRoutes.invalidateLeaderboardCache = () => { cacheInvalidated = true; };

      try {
        await httpRequest(server, {
          path: '/api/admin/shortlist/drive/sync',
          method: 'POST',
          headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
        }, { file_id: 'drive-valid-xlsx', mode: 'INCREMENTAL' });

        // syncShortlist calls invalidateLeaderboardCache
        assert.strictEqual(cacheInvalidated, true);
      } finally {
        ideaRoutes.invalidateLeaderboardCache = originalInvalidate;
      }
    });

    // 24. No credentials/tokens appear in API responses
    await itAsync('24. No credentials/tokens appear in API responses', async () => {
      const filesRes = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/files',
        method: 'GET',
        headers: { Authorization: ADMIN_TOKEN }
      });
      const previewRes = await httpRequest(server, {
        path: '/api/admin/shortlist/drive/preview',
        method: 'POST',
        headers: { Authorization: ADMIN_TOKEN, 'Content-Type': 'application/json' }
      }, { file_id: 'drive-valid-xlsx' });

      const bodies = [filesRes.raw, previewRes.raw];
      for (const b of bodies) {
        assert(!b.includes('access_token'), 'Leaked access_token');
        assert(!b.includes('refresh_token'), 'Leaked refresh_token');
        assert(!b.includes('client_secret'), 'Leaked client_secret');
        assert(!b.includes('private_key'), 'Leaked private_key');
        assert(!b.includes('serviceAccount'), 'Leaked service account details');
      }
    });

    // 25. Manual upload endpoint still works
    await itAsync('25. Manual upload endpoint still works', async () => {
      const boundary = '----WebKitFormBoundaryManualSyncTest';
      const multipartBody = createMultipartFormData(boundary, 'file', 'manual.xlsx', validXlsxBuffer);

      const res = await httpRequest(server, {
        path: '/api/admin/shortlist/sync?mode=INCREMENTAL',
        method: 'POST',
        headers: {
          Authorization: ADMIN_TOKEN,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        }
      }, multipartBody, true);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.mode, 'INCREMENTAL');
    });

    // 26. No automatic background sync was introduced
    it('26. No automatic background sync was introduced', () => {
      const driveRoutesCode = fs.readFileSync(path.join(__dirname, 'backend/routes/shortlistRoutes.js'), 'utf8');
      const driveServiceCode = fs.readFileSync(path.join(__dirname, 'backend/services/googleDriveService.js'), 'utf8');

      // Check that there are no cron, watcher, or automatic intervals for shortlist
      assert(!driveRoutesCode.includes('cron.schedule'));
      assert(!driveRoutesCode.includes('setInterval'));
      assert(!driveRoutesCode.includes('chokidar'));
      assert(!driveServiceCode.includes('cron.schedule'));
    });

  } finally {
    server.close();
  }

  console.log('\n----------------------------------------------------');
  console.log(`Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('----------------------------------------------------\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
