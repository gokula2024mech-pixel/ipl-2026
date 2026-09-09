/**
 * Authoritative Phase 1 Document Completion Module
 * 
 * Defines canonical document templates and calculates Phase 1 completion
 * dynamically based on required document slots.
 * 
 * Rules:
 * - Utility Patent requires 4 canonical documents:
 *   1. Abstract_for_Product.docx (FIGURE_OF_ABSTRACT)
 *   2. Declaration_Form.docx (FORM_5)
 *   3. Grant_Form.docx (FORM_2)
 *   4. List_of_Drawing.docx (LIST_OF_DRAWINGS)
 * 
 * - Design Patent requires 2 canonical documents:
 *   1. Novelty_Form.docx (NOVELTY_FORM)
 *   2. Representation_Sheet.docx (REPRESENTATION_SHEET)
 */

const UTILITY_TEMPLATES = [
  { name: 'Abstract_for_Product.docx', type: 'FIGURE_OF_ABSTRACT', label: 'Abstract for Product / Figure of Abstract' },
  { name: 'Declaration_Form.docx', type: 'FORM_5', label: 'Declaration Form (Form 5)' },
  { name: 'Grant_Form.docx', type: 'FORM_2', label: 'Grant Form (Form 2)' },
  { name: 'List_of_Drawing.docx', type: 'LIST_OF_DRAWINGS', label: 'List of Drawings' }
];

const DESIGN_TEMPLATES = [
  { name: 'Novelty_Form.docx', type: 'NOVELTY_FORM', label: 'Novelty Form' },
  { name: 'Representation_Sheet.docx', type: 'REPRESENTATION_SHEET', label: 'Representation Sheet' }
];

/**
 * Normalizes string for fuzzy/robust matching against template names
 */
function normalizeName(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Checks if a document record matches a required template slot.
 * Matches by document_type or by canonical template filename patterns.
 */
/**
 * Checks if a document record matches a required template slot.
 * Matches by document_type or by canonical template filename patterns,
 * strictly respecting authoritative patent_type when available.
 */
function matchesSlot(doc, tmpl) {
  if (!doc) return false;

  const docTypeNorm = (doc.document_type || '').toUpperCase();
  const fileNorm = (doc.original_filename || doc.file_name || '').toLowerCase();
  const tmplTypeNorm = (tmpl.type || '').toUpperCase();
  const tmplBaseName = tmpl.name.replace(/\.[^/.]+$/, '').toLowerCase();
  const tmplNorm = normalizeName(tmplBaseName);
  const fileNormalized = normalizeName(fileNorm);

  const docPatentType = doc.patent_type || doc.patentType;
  const isDesignTmpl = tmplTypeNorm === 'NOVELTY_FORM' || tmplTypeNorm === 'REPRESENTATION_SHEET';
  const isUtilityTmpl = !isDesignTmpl;

  // 1. Authoritative patent_type guard (no cross-contamination)
  if (docPatentType) {
    if (docPatentType === 'Design Patent' && isUtilityTmpl) return false;
    if (docPatentType === 'Utility Patent' && isDesignTmpl) return false;
  }

  // 2. Strict Design filename guard for unmigrated rows
  // If document filename is clearly Design, do NOT match Utility slots
  const hasDesignFilename = /novelty|representation/i.test(fileNorm);
  if (hasDesignFilename && isUtilityTmpl) return false;

  // If document is purely Utility, do NOT match Design slots
  const hasUtilityFilename = /abstract|declaration|grant|drawing/i.test(fileNorm);
  if (hasUtilityFilename && !hasDesignFilename && isDesignTmpl) return false;

  // 3. Exact type match (NEVER infer FORM_2 or FORM_5 as Design unless verified Design)
  if (docTypeNorm && docTypeNorm === tmplTypeNorm) {
    return true;
  }

  // 4. Specific canonical aliases & filename patterns
  if (tmpl.type === 'FIGURE_OF_ABSTRACT') {
    if (/abstract/i.test(fileNorm) || docTypeNorm === 'FIGURE_OF_ABSTRACT') return true;
  } else if (tmpl.type === 'FORM_5') {
    if ((/declaration/i.test(fileNorm) || /form\s*[-_]?\s*5/i.test(fileNorm)) && !hasDesignFilename) return true;
  } else if (tmpl.type === 'FORM_2') {
    if ((/grant/i.test(fileNorm) || /form\s*[-_]?\s*2/i.test(fileNorm)) && !hasDesignFilename) return true;
  } else if (tmpl.type === 'LIST_OF_DRAWINGS') {
    if (/drawing/i.test(fileNorm) || docTypeNorm === 'LIST_OF_DRAWINGS') return true;
  } else if (tmpl.type === 'NOVELTY_FORM') {
    if (/novelty/i.test(fileNorm) || docTypeNorm === 'NOVELTY_FORM') return true;
  } else if (tmpl.type === 'REPRESENTATION_SHEET') {
    if (/representation/i.test(fileNorm) || docTypeNorm === 'REPRESENTATION_SHEET') return true;
  }

  // 5. Fallback normalized filename match
  if (fileNorm.includes(tmplBaseName) || fileNormalized.includes(tmplNorm)) {
    return true;
  }

  return false;
}

/**
 * Detects whether a submission is Design Patent, Utility Patent, or Both.
 */
function detectPatentType(teamDocs = [], hint = null) {
  const cleanHint = typeof hint === 'string' ? hint : (hint && typeof hint === 'object' ? (hint.patentType || hint.patent_type || '') : '');
  if (cleanHint) {
    const hintLower = cleanHint.toLowerCase();
    if (hintLower.includes('both')) return 'Both';
    if (hintLower.includes('design')) return 'Design Patent';
    if (hintLower.includes('utility')) return 'Utility Patent';
  }

  let hasDesign = false;
  let hasUtility = false;

  (teamDocs || []).forEach(d => {
    const fn = (d.original_filename || d.file_name || '').toLowerCase();
    const pt = (d.patent_type || d.patentType || '').toLowerCase();
    const dt = (d.document_type || '').toUpperCase();

    if (
      pt.includes('design') ||
      dt === 'NOVELTY_FORM' ||
      dt === 'REPRESENTATION_SHEET' ||
      /novelty|representation/i.test(fn)
    ) {
      hasDesign = true;
    } else {
      hasUtility = true;
    }
  });

  if (hasDesign && hasUtility) return 'Both';
  if (hasDesign) return 'Design Patent';
  return 'Utility Patent';
}

/**
 * Calculates completion status for a team's Phase 1 document submissions.
 * Supports Utility Patent (4 docs), Design Patent (2 docs), and Both (4 Utility + 2 Design docs).
 * 
 * @param {Array} teamDocs - List of document rows from phase1_submissions
 * @param {string} [patentTypeHint] - Optional hint for patent type ('Utility Patent', 'Design Patent', 'Both')
 * @returns {Object} Completion object
 */
function calculatePhase1Completion(teamDocs = [], patentTypeHint = null) {
  const detectedPatentType = detectPatentType(teamDocs, patentTypeHint);

  if (detectedPatentType === 'Both') {
    // Separate documents by track for precise evaluation
    const utilitySlotResults = UTILITY_TEMPLATES.map((tmpl, index) => {
      const matchingDoc = (teamDocs || []).find(d => {
        const pt = d.patent_type || d.patentType;
        if (pt && pt !== 'Utility Patent') return false;
        return matchesSlot(d, tmpl);
      });
      return {
        slotNumber: String(index + 1).padStart(2, '0'),
        name: tmpl.name,
        label: tmpl.label,
        documentType: tmpl.type,
        patentType: 'Utility Patent',
        isUploaded: !!matchingDoc,
        document: matchingDoc || null
      };
    });

    const designSlotResults = DESIGN_TEMPLATES.map((tmpl, index) => {
      const matchingDoc = (teamDocs || []).find(d => {
        const pt = d.patent_type || d.patentType;
        if (pt && pt !== 'Design Patent') return false;
        return matchesSlot(d, tmpl);
      });
      return {
        slotNumber: String(index + 1).padStart(2, '0'),
        name: tmpl.name,
        label: tmpl.label,
        documentType: tmpl.type,
        patentType: 'Design Patent',
        isUploaded: !!matchingDoc,
        document: matchingDoc || null
      };
    });

    const utilityUploadedCount = utilitySlotResults.filter(s => s.isUploaded).length;
    const utilityMissingSlots = utilitySlotResults.filter(s => !s.isUploaded);
    const utilityIsComplete = utilityUploadedCount === UTILITY_TEMPLATES.length;

    const designUploadedCount = designSlotResults.filter(s => s.isUploaded).length;
    const designMissingSlots = designSlotResults.filter(s => !s.isUploaded);
    const designIsComplete = designUploadedCount === DESIGN_TEMPLATES.length;

    const combinedSlotResults = [...utilitySlotResults, ...designSlotResults];
    const combinedMissingSlots = [...utilityMissingSlots, ...designMissingSlots];
    const totalUploadedCount = utilityUploadedCount + designUploadedCount;
    const totalRequiredCount = UTILITY_TEMPLATES.length + DESIGN_TEMPLATES.length;
    const isComplete = utilityIsComplete && designIsComplete;

    return {
      patentType: 'Both',
      mode: 'Both',
      requiredCount: totalRequiredCount,
      uploadedCount: totalUploadedCount,
      isComplete,
      missingSlots: combinedMissingSlots,
      slotResults: combinedSlotResults,
      utility: {
        patentType: 'Utility Patent',
        requiredCount: UTILITY_TEMPLATES.length,
        uploadedCount: utilityUploadedCount,
        isComplete: utilityIsComplete,
        missingSlots: utilityMissingSlots,
        slotResults: utilitySlotResults
      },
      design: {
        patentType: 'Design Patent',
        requiredCount: DESIGN_TEMPLATES.length,
        uploadedCount: designUploadedCount,
        isComplete: designIsComplete,
        missingSlots: designMissingSlots,
        slotResults: designSlotResults
      }
    };
  }

  // Single track evaluation (Utility Patent or Design Patent)
  const isDesign = detectedPatentType === 'Design Patent';
  const expectedTemplates = isDesign ? DESIGN_TEMPLATES : UTILITY_TEMPLATES;
  const requiredCount = expectedTemplates.length;

  const slotResults = expectedTemplates.map((tmpl, index) => {
    const matchingDoc = (teamDocs || []).find(d => matchesSlot(d, tmpl));
    return {
      slotNumber: String(index + 1).padStart(2, '0'),
      name: tmpl.name,
      label: tmpl.label,
      documentType: tmpl.type,
      patentType: isDesign ? 'Design Patent' : 'Utility Patent',
      isUploaded: !!matchingDoc,
      document: matchingDoc || null
    };
  });

  const uploadedCount = slotResults.filter(s => s.isUploaded).length;
  const missingSlots = slotResults.filter(s => !s.isUploaded);
  const isComplete = uploadedCount === requiredCount;

  return {
    patentType: detectedPatentType,
    requiredCount,
    uploadedCount,
    isComplete,
    missingSlots,
    slotResults
  };
}

module.exports = {
  UTILITY_TEMPLATES,
  DESIGN_TEMPLATES,
  normalizeName,
  matchesSlot,
  detectPatentType,
  calculatePhase1Completion
};
