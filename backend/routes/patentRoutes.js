const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const googleDriveService = require('../services/googleDriveService')
const { supabase } = require('../supabaseClient')
const { calculatePhase1Completion } = require('../utils/phase1Completion')

// Configure Multer for in-memory file handling (max 15MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
})

// Allowed document file extensions (Word documents only)
const ALLOWED_EXTENSIONS = ['.doc', '.docx']

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
 * Authoritatively resolves and validates that a product belongs to the specified team registration.
 * Ensures server-side isolation and resolves authoritative product details.
 */
async function resolveAndValidateProduct(teamRegistrationId, productId) {
  if (!teamRegistrationId || !productId) {
    return { valid: false, error: 'Team ID and Product ID are required.' };
  }

  // 1. Resolve registration
  const { data: reg, error: regErr } = await supabase
    .from('registrations')
    .select('id, registration_id, team_name, leader_department, leader_email, member2_email, member3_email')
    .eq('registration_id', teamRegistrationId)
    .maybeSingle();

  if (regErr || !reg) {
    return { valid: false, error: `Team registration '${teamRegistrationId}' not found.` };
  }

  // 2. Resolve team in public.teams
  let teamRec = null;
  const { data: byNorm } = await supabase
    .from('teams')
    .select('id, team_name')
    .eq('normalized_team_name', (reg.team_name || '').trim().toLowerCase())
    .maybeSingle();
  teamRec = byNorm;
  if (!teamRec) {
    const { data: byName } = await supabase
      .from('teams')
      .select('id, team_name')
      .eq('team_name', reg.team_name)
      .maybeSingle();
    teamRec = byName;
  }

  const teamId = teamRec ? teamRec.id : null;

  // 3. Resolve product in public.products
  const { data: product, error: prodErr } = await supabase
    .from('products')
    .select('id, team_id, product_number, product_title, legacy_registration_id')
    .eq('id', productId)
    .maybeSingle();

  if (prodErr || !product) {
    return { valid: false, error: 'Product not found.' };
  }

  // 4. Verify product belongs to this team
  const belongsToTeam = (teamId && product.team_id === teamId) ||
                        (product.legacy_registration_id === teamRegistrationId);
  if (!belongsToTeam) {
    return { valid: false, error: 'Access Denied: The specified product does not belong to your team.' };
  }

  // 5. Check total products count for this team
  let totalTeamProducts = 1;
  if (teamId) {
    const { count, error: countErr } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId);
    if (!countErr && count !== null) {
      totalTeamProducts = count;
    }
  }

  // 6. Strict Rule 9 check: Authoritatively require product_number
  const productNumber = product.product_number;
  if (typeof productNumber !== 'number' || isNaN(productNumber)) {
    return { valid: false, error: 'Product number could not be authoritatively resolved.' };
  }

  return {
    valid: true,
    reg,
    team: teamRec,
    product,
    productNumber,
    isSingleProductTeam: totalTeamProducts === 1
  };
}

/**
 * GET /api/patents/submissions
 * List all uploaded files in a team's patent folder
 */
router.get('/submissions', async (req, res) => {
  try {
    let { phase = 'phase 1', department, category, patentType, teamId, productId } = req.query

    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'teamId query parameter is required.'
      })
    }

    const cleanTeamId = teamId.trim()
    let productValidation = null;

    if (productId && productId.trim()) {
      productValidation = await resolveAndValidateProduct(cleanTeamId, productId.trim());
      if (!productValidation.valid) {
        return res.status(403).json({
          success: false,
          message: productValidation.error
        });
      }
    }

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

    // Category auto-resolution if omitted or empty
    let cleanCategory = (category || '').trim()
    let cleanPatentType = (patentType || '').trim()

    if (!cleanCategory) {
      if (cleanPatentType === 'Design Patent') {
        cleanCategory = 'Hardware'
      } else {
        cleanCategory = 'Hardware'
      }
    }

    let files = []

    if (cleanPatentType === 'Both') {
      const [utilityFiles, designFiles] = await Promise.all([
        googleDriveService.listTeamSubmissions({
          phase,
          department: cleanDept,
          category: 'Hardware',
          patentType: 'Utility Patent',
          teamId: cleanTeamId
        }).catch(() => []),
        googleDriveService.listTeamSubmissions({
          phase,
          department: cleanDept,
          category: 'Hardware',
          patentType: 'Design Patent',
          teamId: cleanTeamId
        }).catch(() => [])
      ])

      const taggedUtility = (utilityFiles || []).map(f => ({ ...f, patentType: 'Utility Patent' }))
      const taggedDesign = (designFiles || []).map(f => ({ ...f, patentType: 'Design Patent' }))
      files = [...taggedUtility, ...taggedDesign]
    } else {
      if (!cleanPatentType) {
        cleanPatentType = 'Design Patent'
      }

      let driveFiles = await googleDriveService.listTeamSubmissions({
        phase,
        department: cleanDept,
        category: cleanCategory,
        patentType: cleanPatentType,
        teamId: cleanTeamId
      })

      // If no files found and category was defaulted, also check alternate category (Hardware vs Software) if Utility Patent
      if ((!driveFiles || driveFiles.length === 0) && cleanPatentType === 'Utility Patent' && cleanCategory === 'Hardware') {
        try {
          const altFiles = await googleDriveService.listTeamSubmissions({
            phase,
            department: cleanDept,
            category: 'Software',
            patentType: cleanPatentType,
            teamId: cleanTeamId
          })
          if (altFiles && altFiles.length > 0) {
            driveFiles = altFiles
          }
        } catch (e) {}
      }

      files = (driveFiles || []).map(f => ({ ...f, patentType: cleanPatentType }))
    }

    // Product-level isolation filter
    if (productValidation) {
      const targetProductNumber = productValidation.productNumber;
      const isSingle = productValidation.isSingleProductTeam;
      const isChamelexP1 = cleanTeamId === 'IPL26-0434' && targetProductNumber === 1;
      const isChamelexP2 = cleanTeamId === 'IPL26-0434' && targetProductNumber === 2;

      files = files.filter(f => {
        const fName = (f.name || '').toLowerCase();
        const prodToken = `_p${targetProductNumber}_`;

        // 1. Direct match with product number token (e.g. _p1_ or _p2_)
        if (fName.includes(prodToken)) return true;

        // 2. If file belongs to another product (e.g. _p1_ when looking for P2), reject
        if (/_p\d+_/i.test(fName)) return false;

        // 3. Legacy un-prefixed file without _p token (e.g. IPL26-0434_Grant_Form.docx)
        if (isChamelexP2) {
          // Under NO circumstances does ChameleX Product 2 receive legacy unassigned files!
          return false;
        }

        if (isSingle || isChamelexP1) {
          // Single-product team or ChameleX P1 compatibility: legacy file belongs to Product 1
          return true;
        }

        return false;
      });

      files = files.map(f => ({
        ...f,
        productId: productValidation.product.id,
        productNumber: targetProductNumber
      }));
    }

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
      productId,
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

    // Authoritative Product Validation
    const cleanProductId = (productId || '').trim()
    if (!cleanProductId) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_PRODUCT_ID',
        message: 'Product ID is required for document submission.'
      })
    }

    const productValidation = await resolveAndValidateProduct(cleanTeamId, cleanProductId)
    if (!productValidation.valid) {
      return res.status(403).json({
        success: false,
        code: 'INVALID_PRODUCT',
        message: productValidation.error
      })
    }

    const authoritativeProductNumber = productValidation.productNumber
    const isSingleProductTeam = productValidation.isSingleProductTeam

    if (!['Hardware', 'Software'].includes(cleanCat)) {
      return res.status(400).json({ success: false, message: 'Invalid Category. Must be Hardware or Software.' })
    }

    if (cleanPatentType === 'Both') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_DOCUMENT_PATENT_TYPE',
        message: 'Individual document uploads must specify either Utility Patent or Design Patent. Both is an overall protection mode.'
      })
    }

    if (!['Design Patent', 'Utility Patent'].includes(cleanPatentType)) {
      return res.status(400).json({ success: false, message: 'Invalid Patent Type. Must be Design Patent or Utility Patent.' })
    }

    const patentMode = (req.body.patentMode || req.body.overallPatentType || '').trim()

    // Authoritative Rule: Software submissions can ONLY use Utility Patent
    if (cleanCat === 'Software') {
      if (cleanPatentType !== 'Utility Patent') {
        return res.status(400).json({
          success: false,
          code: 'SOFTWARE_DESIGN_PATENT_NOT_ALLOWED',
          message: 'Software submissions can only use Utility Patent.'
        })
      }
      if (patentMode && patentMode !== 'Utility Patent') {
        return res.status(400).json({
          success: false,
          code: 'SOFTWARE_INVALID_PATENT_MODE',
          message: 'Software submissions only support Utility Patent protection.'
        })
      }
    }

    // Authoritative Rule: Hardware patent mode validation
    if (cleanCat === 'Hardware' && patentMode) {
      if (patentMode === 'Utility Patent' && cleanPatentType !== 'Utility Patent') {
        return res.status(400).json({
          success: false,
          code: 'PATENT_MODE_MISMATCH',
          message: `Document patent type '${cleanPatentType}' does not match team's selected protection mode 'Utility Patent'.`
        })
      }
      if (patentMode === 'Design Patent' && cleanPatentType !== 'Design Patent') {
        return res.status(400).json({
          success: false,
          code: 'PATENT_MODE_MISMATCH',
          message: `Document patent type '${cleanPatentType}' does not match team's selected protection mode 'Design Patent'.`
        })
      }
    }

    // 2. Authoritative Team Department & Membership Resolution from Supabase
    const reg = productValidation.reg
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

    // 4. Authoritative Word file validation
    const userExt = path.extname(file.originalname).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(userExt)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_FILE_FORMAT',
        message: `Invalid file format. Only Microsoft Word documents (.doc, .docx) are accepted. Your file: '${file.originalname}'`
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

    // Authoritative Template Track Validation: verify template belongs to requested patent track
    if (template.patentType && template.patentType !== cleanPatentType) {
      return res.status(400).json({
        success: false,
        code: 'TEMPLATE_PATENT_TYPE_MISMATCH',
        message: `The selected template '${template.name}' belongs to '${template.patentType}', but the upload request specified '${cleanPatentType}'.`
      })
    }

    // 6. Generate canonical filename with product token: <TeamID>_P<ProductNumber>_<OfficialDocumentName>.<extension>
    const rawTemplateName = template.name.replace(/\.[^/.]+$/, '').trim()
    const normalizedTemplateName = rawTemplateName.replace(/\s+/g, '_')
    const finalExt = userExt === '.doc' ? '.doc' : '.docx'
    const canonicalFileName = `${cleanTeamId}_P${authoritativeProductNumber}_${normalizedTemplateName}${finalExt}`

    // 7. Discover Destination Hierarchy using Authoritative Team Department
    const phaseFolder = await googleDriveService.getPhaseFolder(phase)
    const deptFolder = await googleDriveService.getDepartmentFolder(phaseFolder.id, authoritativeDept)
    const catFolder = await googleDriveService.getCategoryFolder(deptFolder.id, cleanCat)
    const patentFolder = await googleDriveService.getPatentTypeFolder(catFolder.id, cleanPatentType)
    const teamFolderResult = await googleDriveService.getOrCreateTeamFolder(patentFolder.id, cleanTeamId)
    const targetFolderId = teamFolderResult.id

    // 8. Upload or Replace file (isolated per product)
    try {
      const uploadedFile = await googleDriveService.updateOrUploadFileToFolder(
        targetFolderId,
        file,
        canonicalFileName,
        normalizedTemplateName,
        cleanTeamId,
        authoritativeProductNumber,
        isSingleProductTeam
      )

      let completionResult = null;

      // 9. Synchronize metadata to Supabase phase1_submissions & reset decision state to PENDING
      try {
        let docType = template.documentType || 'OTHER'
        if (!template.documentType) {
          const tmplLower = (normalizedTemplateName || '').toLowerCase()
          if (tmplLower.includes('abstract')) docType = 'FIGURE_OF_ABSTRACT'
          else if (tmplLower.includes('declaration') || tmplLower.includes('form_5')) docType = 'FORM_5'
          else if (tmplLower.includes('grant') || tmplLower.includes('form_2')) docType = 'FORM_2'
          else if (tmplLower.includes('drawing')) docType = 'LIST_OF_DRAWINGS'
          else if (tmplLower.includes('novelty')) docType = 'NOVELTY_FORM'
          else if (tmplLower.includes('representation')) docType = 'REPRESENTATION_SHEET'
          else docType = normalizedTemplateName.replace(/[^a-zA-Z0-9_]/g, '').toUpperCase()
        }

        const teamRec = productValidation.team

        // Base payload containing ONLY valid, verified pre-migration schema columns
        const basePayload = {
          team_id: teamRec?.id || null,
          registration_id: cleanTeamId,
          team_name: reg.team_name,
          document_type: docType,
          original_filename: uploadedFile.name || canonicalFileName,
          google_drive_file_id: uploadedFile.id,
          google_drive_folder_id: targetFolderId,
          uploaded_by: (req.user && req.user.email) || reg.leader_email || 'student',
          uploaded_at: new Date().toISOString(),
          review_status: 'UPLOADED',
          rejection_reason: null,
          template_version_used: 1,
          updated_at: new Date().toISOString()
        };

        const isDesignDoc = cleanPatentType === 'Design Patent' || docType === 'NOVELTY_FORM' || docType === 'REPRESENTATION_SHEET';

        // Upsert logic: Resilient multi-tier progression compatible across all migration phases:
        // Tier 1: Post-Stage 13 schema (with product_id and patent_type)
        // Tier 2: Post-Stage 12 schema (with patent_type, pre-Stage 13)
        // Tier 3: Pre-Stage 12 schema (legacy schema with only base columns)
        try {
          // Tier 1: Try with product_id and patent_type (Post-Stage 13)
          let upsertResult = await supabase
            .from('phase1_submissions')
            .upsert({
              ...basePayload,
              product_id: productValidation.product.id,
              patent_type: cleanPatentType
            }, { onConflict: 'team_id,product_id,document_type,patent_type' });

          if (upsertResult.error) {
            const errCode1 = upsertResult.error.code;
            const errMsg1 = upsertResult.error.message || '';

            // If product_id column does not exist (code 42703 / column product_id) or constraint missing (42P10), try Tier 2
            if (errCode1 === '42703' || errMsg1.includes('product_id') || errCode1 === '42P10') {
              // Tier 2: Post-Stage 12 schema (with patent_type, pre-Stage 13)
              upsertResult = await supabase
                .from('phase1_submissions')
                .upsert({
                  ...basePayload,
                  patent_type: cleanPatentType
                }, { onConflict: 'team_id,document_type,patent_type' });

              if (upsertResult.error) {
                const errCode2 = upsertResult.error.code;
                const errMsg2 = upsertResult.error.message || '';

                // If patent_type column does not exist (code 42703 / column patent_type) or constraint missing (42P10), try Tier 3
                if (errCode2 === '42703' || errMsg2.includes('patent_type') || errCode2 === '42P10') {
                  if (isDesignDoc) {
                    console.warn('[PatentRoutes] Design Patent upload blocked by pending migration:', errCode2, errMsg2);
                    return res.status(400).json({
                      success: false,
                      code: 'DESIGN_MIGRATION_PENDING',
                      message: 'Database schema migration for Design Patent documents (stage_12_both_patent_protection.sql) is pending. Please contact the administrator to apply the database migration before uploading Design Patent documents.'
                    });
                  } else {
                    // Tier 3: Pre-Stage 12 legacy schema (Utility only, no product_id, no patent_type)
                    upsertResult = await supabase
                      .from('phase1_submissions')
                      .upsert(basePayload, { onConflict: 'team_id,document_type' });

                    if (upsertResult.error) {
                      console.warn('[PatentRoutes] Legacy fallback upsert warning:', upsertResult.error.message);
                    }
                  }
                } else {
                  console.warn('[PatentRoutes] Tier 2 upsert error:', errMsg2);
                }
              }
            } else {
              console.warn('[PatentRoutes] Tier 1 upsert error:', errMsg1);
            }
          }
        } catch (dbErr) {
          console.warn('[PatentRoutes] DB submission sync error:', dbErr.message);
        }

        // Check completion dynamically for THIS product and update local decisions cache
        try {
          const { data: allTeamDocs } = await supabase
            .from('phase1_submissions')
            .select('*')
            .eq('registration_id', cleanTeamId);

          const isChamelexP1 = cleanTeamId === 'IPL26-0434' && authoritativeProductNumber === 1;

          // Scope documents strictly to this product
          let productDocs = (allTeamDocs || []).filter(d => {
            if (d.product_id) return d.product_id === productValidation.product.id;
            return isSingleProductTeam || isChamelexP1;
          });

          if (!productDocs.some(d => (d.document_type === docType) || (d.original_filename && d.original_filename.includes(normalizedTemplateName)))) {
            productDocs = [...productDocs, { ...basePayload, patent_type: cleanPatentType }];
          }

          const patentMode = (req.body.patentMode || req.body.overallPatentType || '').trim();
          const patentTypeHint = patentMode === 'Both' ? 'Both' : cleanPatentType;

          completionResult = calculatePhase1Completion(productDocs, patentTypeHint);
          const DECISIONS_FILE = path.join(__dirname, '..', 'config', 'team_decisions.json');
          if (fs.existsSync(DECISIONS_FILE)) {
            const raw = fs.readFileSync(DECISIONS_FILE, 'utf-8');
            const decisions = JSON.parse(raw);
            if (completionResult && completionResult.isComplete) {
              decisions[cleanTeamId] = {
                status: 'PENDING',
                adminComment: null,
                decisionSeen: false,
                reviewedBy: null,
                reviewedAt: null,
                updatedAt: new Date().toISOString()
              };
              // Reset any stale decision on phase1_submissions so re-uploaded complete submission is PENDING REVIEW
              try {
                let resetQuery = supabase
                  .from('phase1_submissions')
                  .update({
                    review_status: 'UPLOADED',
                    rejection_reason: null,
                    admin_comment: null
                  });
                resetQuery = applyTeamFilter(resetQuery);
                if (productValidation) {
                  resetQuery = resetQuery.eq('product_id', productValidation.product.id);
                }
                await resetQuery;
              } catch (resetErr) {
                console.warn('[PatentRoutes] DB status reset warning on re-upload:', resetErr.message);
              }
            } else {
              delete decisions[cleanTeamId];
            }
            fs.writeFileSync(DECISIONS_FILE, JSON.stringify(decisions, null, 2), 'utf-8');
          }
        } catch (compErr) {
          console.warn('[PatentRoutes] Completion calculation warning:', compErr.message);
        }
      } catch (syncErr) {
        console.warn('[PatentRoutes] Post-upload sync warning:', syncErr.message)
      }

      return res.status(200).json({
        success: true,
        message: uploadedFile.isReplacement ? 'Document replaced successfully.' : 'Patent document submitted successfully.',
        data: {
          fileId: uploadedFile.id,
          fileName: uploadedFile.name,
          canonicalName: canonicalFileName,
          teamId: cleanTeamId,
          department: deptFolder.name,
          category: catFolder.name,
          patentType: cleanPatentType,
          webViewLink: uploadedFile.webViewLink,
          isNewFolder: teamFolderResult.isNew,
          isReplacement: !!uploadedFile.isReplacement,
          completion: completionResult ? {
            isComplete: completionResult.isComplete,
            uploadedCount: completionResult.uploadedCount,
            requiredCount: completionResult.requiredCount,
            missingSlots: (completionResult.missingSlots || []).map(s => s.name),
            utility: completionResult.utility ? {
              uploadedCount: completionResult.utility.uploadedCount,
              requiredCount: completionResult.utility.requiredCount,
              isComplete: completionResult.utility.isComplete
            } : null,
            design: completionResult.design ? {
              uploadedCount: completionResult.design.uploadedCount,
              requiredCount: completionResult.design.requiredCount,
              isComplete: completionResult.design.isComplete
            } : null
          } : null
        }
      })
    } catch (uploadErr) {
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

/**
 * POST /api/patents/remove-file
 * DELETE /api/patents/remove-file
 * Authoritatively removes an uploaded document from Google Drive and updates Supabase + completion state.
 *
 * Sequence:
 * 1. Authenticate & Authorize caller (team member or admin)
 * 2. Verify file ownership (Google Drive file name / DB record)
 * 3. Delete file from Google Drive via googleDriveService.deleteFile
 * 4. Delete corresponding record from phase1_submissions
 * 5. Recalculate completion state and update decisions cache
 * 6. Return response
 */
const handleRemoveFile = async (req, res) => {
  try {
    const cleanTeamId = (req.body?.teamId || req.query?.teamId || '').trim();
    const cleanFileId = (req.body?.fileId || req.query?.fileId || '').trim();
    const cleanProductId = (req.body?.productId || req.query?.productId || '').trim();
    const cleanPatentType = (req.body?.patentType || req.query?.patentType || '').trim();
    const cleanPatentMode = (req.body?.patentMode || req.query?.patentMode || '').trim();

    if (!cleanTeamId || !cleanFileId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID and File ID are required to remove a document.'
      });
    }

    // 1. Authoritative Team Resolution from Supabase
    const { data: reg, error: regErr } = await supabase
      .from('registrations')
      .select('registration_id, team_name, leader_department, leader_email, member2_email, member3_email')
      .eq('registration_id', cleanTeamId)
      .maybeSingle();

    if (!reg) {
      return res.status(404).json({
        success: false,
        message: `Team registration '${cleanTeamId}' not found.`
      });
    }

    // Authoritative Product Resolution if productId provided
    let productValidation = null;
    if (cleanProductId) {
      productValidation = await resolveAndValidateProduct(cleanTeamId, cleanProductId);
      if (!productValidation.valid) {
        return res.status(403).json({
          success: false,
          message: productValidation.error
        });
      }
    }

    // Helper to safely filter phase1_submissions by registration_id and optional team_id without Postgres UUID syntax errors
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanTeamId);
    const applyTeamFilter = (query) => {
      if (isUuid) {
        return query.or(`registration_id.eq.${cleanTeamId},team_id.eq.${cleanTeamId}`);
      }
      return query.eq('registration_id', cleanTeamId);
    };

    // 2. Authentication & Authorization Check
    let authenticatedEmail = null;
    let isAdmin = false;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          authenticatedEmail = (user.email || '').toLowerCase().trim();

          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

          if (profile && ['admin', 'superadmin', 'evaluator'].includes(profile.role)) {
            isAdmin = true;
          }
        }
      } catch (tokenErr) {
        console.warn('[PatentRoutes] Auth token parse error:', tokenErr.message);
      }
    }

    if (authenticatedEmail && !isAdmin) {
      const teamEmails = [reg.leader_email, reg.member2_email, reg.member3_email]
        .filter(Boolean)
        .map(e => e.toLowerCase().trim());

      if (!teamEmails.includes(authenticatedEmail)) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: You are not authorized to remove files for this team.'
        });
      }
    }

    // 3. Verify file exists and belongs to this team & product
    let driveFile = null;
    let driveAlreadyDeleted = false;

    try {
      driveFile = await googleDriveService.getFileMetadata(cleanFileId);
    } catch (driveErr) {
      const status = driveErr.status || driveErr.code;
      if (status === 404 || (driveErr.message && driveErr.message.toLowerCase().includes('not found'))) {
        driveAlreadyDeleted = true;
      } else {
        console.error('[PatentRoutes] Error checking Google Drive file:', driveErr.message);
        return res.status(500).json({
          success: false,
          message: 'Failed to access Google Drive: ' + driveErr.message
        });
      }
    }

    if (driveFile) {
      // Prevent deleting folders
      if (driveFile.mimeType === 'application/vnd.google-apps.folder') {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete a folder.'
        });
      }

      // Check team ownership
      const fileNameHasTeam = driveFile.name.toLowerCase().includes(cleanTeamId.toLowerCase());
      let dbMatchesQuery = supabase
        .from('phase1_submissions')
        .select('*')
        .eq('google_drive_file_id', cleanFileId);
      dbMatchesQuery = applyTeamFilter(dbMatchesQuery);
      const { data: dbMatches } = await dbMatchesQuery;

      const isVerifiedTeamFile = fileNameHasTeam || (dbMatches && dbMatches.length > 0);

      if (!isVerifiedTeamFile && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: The specified file does not belong to your team.'
        });
      }

      // Check product ownership: Product 2 must NEVER be able to delete Product 1's file
      if (productValidation && !isAdmin) {
        // 1. Check DB record ownership
        if (dbMatches && dbMatches.length > 0) {
          const match = dbMatches[0];
          const isChamelexP1 = cleanTeamId === 'IPL26-0434' && productValidation.productNumber === 1;
          const isAllowed = match.product_id === productValidation.product.id ||
                            (!match.product_id && (productValidation.isSingleProductTeam || isChamelexP1));
          if (!isAllowed) {
            return res.status(403).json({
              success: false,
              message: 'Access Denied: The specified file belongs to a different product.'
            });
          }
        }

        // 2. Check Drive filename product token
        const fLower = driveFile.name.toLowerCase();
        const prodTokenMatch = fLower.match(/_p(\d+)_/i);
        if (prodTokenMatch) {
          const fileProductNum = parseInt(prodTokenMatch[1], 10);
          if (fileProductNum !== productValidation.productNumber) {
            return res.status(403).json({
              success: false,
              message: 'Access Denied: The specified file belongs to a different product.'
            });
          }
        }
      }
    }

    // 4. Delete from Google Drive FIRST
    if (!driveAlreadyDeleted) {
      try {
        await googleDriveService.deleteFile(cleanFileId);
      } catch (delErr) {
        const status = delErr.status || delErr.code;
        if (status !== 404 && (!delErr.message || !delErr.message.toLowerCase().includes('not found'))) {
          console.error('[PatentRoutes] Failed to delete file from Google Drive:', delErr.message);
          return res.status(500).json({
            success: false,
            message: 'Failed to delete file from Google Drive: ' + delErr.message
          });
        }
      }
    }

    // 5. Delete corresponding records from phase1_submissions
    let docType = (req.body?.documentType || req.query?.documentType || '').trim();
    const templateName = (req.body?.templateName || req.query?.templateName || '').trim();
    if (!docType && templateName) {
      const tmplLower = templateName.toLowerCase();
      if (tmplLower.includes('abstract')) docType = 'FIGURE_OF_ABSTRACT';
      else if (tmplLower.includes('declaration') || tmplLower.includes('form_5') || tmplLower.includes('form 5')) docType = 'FORM_5';
      else if (tmplLower.includes('grant') || tmplLower.includes('form_2') || tmplLower.includes('form 2')) docType = 'FORM_2';
      else if (tmplLower.includes('drawing')) docType = 'LIST_OF_DRAWINGS';
      else if (tmplLower.includes('novelty')) docType = 'NOVELTY_FORM';
      else if (tmplLower.includes('representation')) docType = 'REPRESENTATION_SHEET';
    }

    // Delete by file ID for this team
    let delByFileQuery = supabase
      .from('phase1_submissions')
      .delete()
      .eq('google_drive_file_id', cleanFileId);
    delByFileQuery = applyTeamFilter(delByFileQuery);
    await delByFileQuery;

    // If docType is known, ensure any lingering slot record is also removed (scoped to product and patent_type if known)
    if (docType) {
      let delBySlotQuery = supabase
        .from('phase1_submissions')
        .delete()
        .eq('document_type', docType);
      delBySlotQuery = applyTeamFilter(delBySlotQuery);
      if (cleanPatentType && cleanPatentType !== 'Both') {
        delBySlotQuery = delBySlotQuery.eq('patent_type', cleanPatentType);
      }
      if (productValidation) {
        const isChamelexP1 =
          cleanTeamId === 'IPL26-0434' &&
          productValidation.productNumber === 1;

        if (productValidation.isSingleProductTeam || isChamelexP1) {
          delBySlotQuery = delBySlotQuery.or(
            `product_id.eq.${productValidation.product.id},and(product_id.is.null,registration_id.eq.${cleanTeamId})`
          );
        } else {
          delBySlotQuery = delBySlotQuery.eq(
            'product_id',
            productValidation.product.id
          );
        }
      }
      await delBySlotQuery;
    }

    // 6. Recalculate completion state and synchronize decision cache (scoped to product)
    let completionResult = null;
    try {
      let remainingQuery = supabase
        .from('phase1_submissions')
        .select('*');
      remainingQuery = applyTeamFilter(remainingQuery);
      const { data: remainingDocs } = await remainingQuery;

      const isChamelexP1 = cleanTeamId === 'IPL26-0434' && productValidation?.productNumber === 1;
      const productDocs = productValidation
        ? (remainingDocs || []).filter(d => {
            if (d.product_id) return d.product_id === productValidation.product.id;
            return productValidation.isSingleProductTeam || isChamelexP1;
          })
        : (remainingDocs || []);

      const patentMode = (req.body?.patentMode || req.query?.patentMode || '').trim();
      const patentTypeParam = (req.body?.patentType || req.query?.patentType || '').trim();
      const patentTypeHint = patentMode === 'Both' ? 'Both' : (patentTypeParam || (productDocs && productDocs[0]?.patent_type) || 'Utility Patent');

      completionResult = calculatePhase1Completion(productDocs, patentTypeHint);

      const DECISIONS_FILE = path.join(__dirname, '..', 'config', 'team_decisions.json');
      if (fs.existsSync(DECISIONS_FILE)) {
        const raw = fs.readFileSync(DECISIONS_FILE, 'utf-8');
        const decisions = JSON.parse(raw);
        if (completionResult && completionResult.isComplete) {
          decisions[cleanTeamId] = {
            status: 'PENDING',
            adminComment: null,
            decisionSeen: false,
            reviewedBy: null,
            reviewedAt: null,
            updatedAt: new Date().toISOString()
          };
        } else {
          // If any required document is missing, the submission is strictly INCOMPLETE.
          // Remove any active decision (PENDING, APPROVED, or REJECTED) so it is not stale.
          if (decisions[cleanTeamId]) {
            delete decisions[cleanTeamId];
          }

          // Reset database review_status on remaining rows for this team/product so stale APPROVED/REJECTED is cleared
          try {
            let resetQuery = supabase
              .from('phase1_submissions')
              .update({
                review_status: 'UPLOADED',
                rejection_reason: null,
                admin_comment: null
              });
            resetQuery = applyTeamFilter(resetQuery);
            if (productValidation) {
              resetQuery = resetQuery.eq('product_id', productValidation.product.id);
            }
            await resetQuery;
          } catch (resetErr) {
            console.warn('[PatentRoutes] DB status reset warning on document removal:', resetErr.message);
          }
        }
        fs.writeFileSync(DECISIONS_FILE, JSON.stringify(decisions, null, 2), 'utf-8');
      }
    } catch (compErr) {
      console.warn('[PatentRoutes] Completion recalculation warning:', compErr.message);
    }

    const removedFileName = driveFile?.name || req.body?.fileName || 'Document';

    return res.status(200).json({
      success: true,
      message: 'Document removed successfully.',
      data: {
        fileId: cleanFileId,
        teamId: cleanTeamId,
        fileName: removedFileName,
        completion: completionResult ? {
          isComplete: completionResult.isComplete,
          uploadedCount: completionResult.uploadedCount,
          requiredCount: completionResult.requiredCount,
          missingSlots: (completionResult.missingSlots || []).map(s => s.name),
          utility: completionResult.utility ? {
            uploadedCount: completionResult.utility.uploadedCount,
            requiredCount: completionResult.utility.requiredCount,
            isComplete: completionResult.utility.isComplete
          } : null,
          design: completionResult.design ? {
            uploadedCount: completionResult.design.uploadedCount,
            requiredCount: completionResult.design.requiredCount,
            isComplete: completionResult.design.isComplete
          } : null
        } : null
      }
    });
  } catch (err) {
    console.error('[PatentRoutes] Remove File Error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove document: ' + err.message
    });
  }
};

router.post('/remove-file', handleRemoveFile);
router.delete('/remove-file', handleRemoveFile);
router.handleRemoveFile = handleRemoveFile;

module.exports = router
