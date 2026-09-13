// backend/routes/shortlistRoutes.js
/**
 * Admin Phase 3 Shortlist Routes
 * IPL-2026 Platform
 * 
 * Endpoints:
 * - POST /api/admin/shortlist/preview : Dry-run validation of candidate shortlist (Excel or JSON)
 * - POST /api/admin/shortlist/sync    : Atomic synchronization (INCREMENTAL or FULL_REPLACEMENT)
 * - GET  /api/admin/shortlist         : Current shortlist records and summary statistics
 * 
 * Strict Admin Authentication & Authorization Enforced.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { supabase } = require('../supabaseClient');
const shortlistService = require('../services/phase3ShortlistService');
const googleDriveService = require('../services/googleDriveService');

// Memory storage for Excel upload (max 15MB)
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      return cb(null, true);
    }
    return cb(new Error('Invalid file type. Only .xlsx, .xls, and .csv files are supported.'), false);
  }
});

// Middleware wrapper to catch multer fileFilter errors gracefully
const handleExcelUpload = (req, res, next) => {
  excelUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_FILE_UPLOAD',
        message: err.message
      });
    }
    next();
  });
};

/**
 * Admin Authentication Middleware
 */
async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error_code: 'UNAUTHENTICATED',
        message: 'Authentication required. Bearer token missing.'
      });
    }

    const token = authHeader.split(' ')[1];

    // Test environment token bypass
    if (process.env.NODE_ENV === 'test' && token.startsWith('TEST_TOKEN_')) {
      const parts = token.split(':');
      req.user = {
        id: parts[0].replace('TEST_TOKEN_', ''),
        email: parts[1] || 'test@sece.ac.in',
        user_metadata: { role: parts[2] || 'student' }
      };
      return next();
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({
        success: false,
        error_code: 'INVALID_TOKEN',
        message: 'Invalid or expired authentication session.'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      error_code: 'AUTH_FAILED',
      message: 'Authentication verification failed: ' + err.message
    });
  }
}

/**
 * Admin Authorization Middleware
 */
async function checkAdmin(req, res, next) {
  try {
    // 1. Check user_metadata role
    if (req.user?.user_metadata?.role === 'admin') {
      return next();
    }

    // 2. Check public.profiles role
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error || !profile || profile.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error_code: 'ADMIN_REQUIRED',
        message: 'Access denied. Administrator privileges required.'
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      error_code: 'AUTHORIZATION_ERROR',
      message: 'Authorization error: ' + err.message
    });
  }
}

/**
 * POST /api/admin/shortlist/preview
 * Dry-run validation of shortlist candidate list (from Excel upload or JSON payload).
 * ZERO database mutations performed.
 */
router.post('/preview', authenticateUser, checkAdmin, handleExcelUpload, async (req, res) => {
  try {
    const rawMode = req.query.mode || req.body.mode || 'INCREMENTAL';
    const mode = String(rawMode).trim().toLowerCase() === 'full_replacement' ? 'FULL_REPLACEMENT' : 'INCREMENTAL';

    let input = null;
    if (req.file && req.file.buffer) {
      input = req.file.buffer;
    } else if (req.body.entries) {
      input = req.body.entries;
    } else if (Array.isArray(req.body)) {
      input = req.body;
    }

    if (!input) {
      return res.status(400).json({
        success: false,
        error_code: 'MISSING_INPUT',
        message: 'No shortlist file or entries provided. Upload an Excel file or provide an entries array.'
      });
    }

    const preview = await shortlistService.previewShortlist(input, {
      mode: mode,
      supabaseClient: supabase,
      testStore: req.testStore || null
    });

    return res.status(200).json({
      success: true,
      mode: mode,
      preview: preview
    });
  } catch (err) {
    console.error('[Shortlist Admin API] Preview error:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'PREVIEW_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/admin/shortlist/sync
 * Transactional synchronization of Phase 3 shortlist into public.phase3_shortlist.
 * If validation fails, performs ZERO database changes.
 */
router.post('/sync', authenticateUser, checkAdmin, handleExcelUpload, async (req, res) => {
  try {
    const rawMode = req.query.mode || req.body.mode || 'INCREMENTAL';
    const mode = String(rawMode).trim().toLowerCase() === 'full_replacement' ? 'FULL_REPLACEMENT' : 'INCREMENTAL';

    let input = null;
    if (req.file && req.file.buffer) {
      input = req.file.buffer;
    } else if (req.body.entries) {
      input = req.body.entries;
    } else if (Array.isArray(req.body)) {
      input = req.body;
    }

    if (!input) {
      return res.status(400).json({
        success: false,
        error_code: 'MISSING_INPUT',
        message: 'No shortlist file or entries provided. Upload an Excel file or provide an entries array.'
      });
    }

    const result = await shortlistService.syncShortlist(input, {
      mode: mode,
      supabaseClient: supabase,
      testStore: req.testStore || null
    });

    if (!result.success) {
      const statusCode = result.error_code === 'VALIDATION_FAILED' ? 422 : 500;
      return res.status(statusCode).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('[Shortlist Admin API] Sync error:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'SYNC_ERROR',
      message: err.message
    });
  }
});

/**
 * ============================================================================
 * GOOGLE DRIVE SHORTLIST ADAPTER ENDPOINTS (STEP 10E)
 * ============================================================================
 * Thin adapter layer connecting Google Drive organizer files to the core
 * phase3ShortlistService validation and synchronization engine.
 * 
 * Strict safety rules:
 * - Requires admin authentication and authorization.
 * - Accepts only alphanumeric Drive file_id (no arbitrary URLs or paths).
 * - ZERO database mutations on preview.
 * - Same validation guarantees for Drive files as manual Excel uploads.
 * - No credentials or tokens exposed in responses.
 */

/**
 * GET /api/admin/shortlist/drive/files
 * Lists candidate shortlist spreadsheets and CSV files from configured Google Drive.
 */
router.get('/drive/files', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const driveService = req.googleDriveService || googleDriveService;
    const files = await driveService.listPhase3ShortlistFiles();

    return res.status(200).json({
      success: true,
      source: 'google_drive',
      files: files
    });
  } catch (err) {
    console.error('[Shortlist Drive API] List error:', err.message);
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error_code: err.code || 'DRIVE_FILES_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/admin/shortlist/drive/preview
 * Downloads selected Drive file into memory and runs dry-run shortlist preview.
 * ZERO database mutations performed.
 */
router.post('/drive/preview', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const { file_id } = req.body || {};
    const rawMode = req.query.mode || req.body?.mode || 'INCREMENTAL';
    const mode = String(rawMode).trim().toLowerCase() === 'full_replacement' ? 'FULL_REPLACEMENT' : 'INCREMENTAL';

    if (!file_id || typeof file_id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(file_id.trim())) {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_FILE_ID',
        message: 'A valid Google Drive file_id is required (alphanumeric, no URLs or path traversal).'
      });
    }

    const driveService = req.googleDriveService || googleDriveService;
    let downloaded;
    try {
      downloaded = await driveService.downloadDriveFileToBuffer(file_id.trim());
    } catch (dlErr) {
      const status = dlErr.status || (dlErr.code === 'DRIVE_FILE_NOT_FOUND' ? 404 : (dlErr.code === 'DRIVE_PERMISSION_DENIED' ? 403 : 422));
      return res.status(status).json({
        success: false,
        error_code: dlErr.code || 'DRIVE_FILE_UNAVAILABLE',
        message: dlErr.message
      });
    }

    const { buffer, metadata } = downloaded;

    const preview = await shortlistService.previewShortlist(buffer, {
      mode: mode,
      supabaseClient: supabase,
      testStore: req.testStore || null
    });

    return res.status(200).json({
      success: true,
      source: 'google_drive',
      file_id: metadata.file_id,
      file_name: metadata.name,
      mode: mode,
      preview: preview
    });
  } catch (err) {
    console.error('[Shortlist Drive API] Preview error:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'PREVIEW_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/admin/shortlist/drive/sync
 * Downloads selected Drive file into memory, runs dry-run preview, and executes
 * atomic synchronization into public.phase3_shortlist if validation passes.
 */
router.post('/drive/sync', authenticateUser, checkAdmin, async (req, res) => {
  try {
    const { file_id } = req.body || {};
    const rawMode = req.query.mode || req.body?.mode || 'INCREMENTAL';
    const mode = String(rawMode).trim().toLowerCase() === 'full_replacement' ? 'FULL_REPLACEMENT' : 'INCREMENTAL';

    if (!file_id || typeof file_id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(file_id.trim())) {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_FILE_ID',
        message: 'A valid Google Drive file_id is required (alphanumeric, no URLs or path traversal).'
      });
    }

    const driveService = req.googleDriveService || googleDriveService;
    let downloaded;
    try {
      downloaded = await driveService.downloadDriveFileToBuffer(file_id.trim());
    } catch (dlErr) {
      const status = dlErr.status || (dlErr.code === 'DRIVE_FILE_NOT_FOUND' ? 404 : (dlErr.code === 'DRIVE_PERMISSION_DENIED' ? 403 : 422));
      return res.status(status).json({
        success: false,
        error_code: dlErr.code || 'DRIVE_FILE_UNAVAILABLE',
        message: dlErr.message
      });
    }

    const { buffer, metadata } = downloaded;

    const result = await shortlistService.syncShortlist(buffer, {
      mode: mode,
      supabaseClient: supabase,
      testStore: req.testStore || null
    });

    if (!result.success) {
      const statusCode = result.error_code === 'VALIDATION_FAILED' ? 422 : 500;
      return res.status(statusCode).json({
        ...result,
        source: 'google_drive',
        file_id: metadata.file_id,
        file_name: metadata.name
      });
    }

    return res.status(200).json({
      success: true,
      source: 'google_drive',
      file_id: metadata.file_id,
      file_name: metadata.name,
      modified_time: metadata.modified_time,
      mode: mode,
      upserted_count: result.upserted_count,
      removed_count: result.removed_count,
      total_shortlisted: result.total_shortlisted,
      message: result.message,
      preview: result.preview
    });
  } catch (err) {
    console.error('[Shortlist Drive API] Sync error:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'SYNC_ERROR',
      message: err.message
    });
  }
});

/**
 * GET /api/admin/shortlist
 * Returns current authoritative shortlist records and statistics.
 */
router.get('/', authenticateUser, checkAdmin, async (req, res) => {
  try {
    if (req.testStore) {
      const list = req.testStore.shortlist || [];
      let hwCount = 0;
      let swCount = 0;
      list.forEach(r => {
        const c = (r.category || '').toUpperCase();
        if (c === 'HW' || c.includes('HARDWARE')) hwCount++;
        else if (c === 'SW' || c.includes('SOFTWARE')) swCount++;
      });
      return res.status(200).json({
        success: true,
        total_shortlisted: list.length,
        category_breakdown: {
          hardware: hwCount,
          software: swCount,
          other: list.length - (hwCount + swCount)
        },
        records: list
      });
    }

    const { data, error } = await supabase
      .from('phase3_shortlist')
      .select('registration_id, product_id, team_id, category, created_at, updated_at')
      .order('registration_id', { ascending: true });

    if (error) {
      // Table pre-migration handling
      return res.status(200).json({
        success: true,
        total_shortlisted: 0,
        records: [],
        notice: 'Shortlist table public.phase3_shortlist not yet migrated or empty.'
      });
    }

    const records = data || [];
    let hwCount = 0;
    let swCount = 0;
    records.forEach(r => {
      const c = (r.category || '').toUpperCase();
      if (c === 'HW' || c.includes('HARDWARE')) hwCount++;
      else if (c === 'SW' || c.includes('SOFTWARE')) swCount++;
    });

    return res.status(200).json({
      success: true,
      total_shortlisted: records.length,
      category_breakdown: {
        hardware: hwCount,
        software: swCount,
        other: records.length - (hwCount + swCount)
      },
      records: records
    });
  } catch (err) {
    console.error('[Shortlist Admin API] GET error:', err.message);
    return res.status(500).json({
      success: false,
      error_code: 'SERVER_ERROR',
      message: err.message
    });
  }
});

module.exports = router;
