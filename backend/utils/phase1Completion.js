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
function matchesSlot(doc, tmpl) {
  if (!doc) return false;
  const docTypeNorm = (doc.document_type || '').toUpperCase();
  const fileNorm = (doc.original_filename || '').toLowerCase();
  const tmplTypeNorm = (tmpl.type || '').toUpperCase();
  const tmplBaseName = tmpl.name.replace(/\.[^/.]+$/, '').toLowerCase();
  const tmplNorm = normalizeName(tmplBaseName);
  const fileNormalized = normalizeName(fileNorm);

  // Exact type match
  if (docTypeNorm && docTypeNorm === tmplTypeNorm) {
    return true;
  }

  // Exact or normalized filename match
  if (fileNorm.includes(tmplBaseName) || fileNormalized.includes(tmplNorm)) {
    return true;
  }

  // Specific canonical aliases
  if (tmpl.type === 'FIGURE_OF_ABSTRACT') {
    if (/abstract/i.test(fileNorm)) return true;
  } else if (tmpl.type === 'FORM_5') {
    if (/declaration/i.test(fileNorm) || /form\s*[-_]?\s*5/i.test(fileNorm)) return true;
  } else if (tmpl.type === 'FORM_2') {
    if (/grant/i.test(fileNorm) || /form\s*[-_]?\s*2/i.test(fileNorm)) return true;
  } else if (tmpl.type === 'LIST_OF_DRAWINGS') {
    if (/drawing/i.test(fileNorm)) return true;
  } else if (tmpl.type === 'NOVELTY_FORM') {
    if (/novelty/i.test(fileNorm)) return true;
  } else if (tmpl.type === 'REPRESENTATION_SHEET') {
    if (/representation/i.test(fileNorm)) return true;
  }

  return false;
}

/**
 * Detects whether a submission is Design Patent or Utility Patent.
 */
function detectPatentType(teamDocs = [], hint = null) {
  if (hint && /design/i.test(hint)) return 'Design Patent';
  if (hint && /utility/i.test(hint)) return 'Utility Patent';

  const isDesign = teamDocs.some(d => {
    const fn = (d.original_filename || '').toLowerCase();
    const pt = (d.patent_type || '').toLowerCase();
    const dt = (d.document_type || '').toUpperCase();
    return (
      pt.includes('design') ||
      dt === 'NOVELTY_FORM' ||
      dt === 'REPRESENTATION_SHEET' ||
      /novelty|representation/i.test(fn)
    );
  });

  return isDesign ? 'Design Patent' : 'Utility Patent';
}

/**
 * Calculates completion status for a team's Phase 1 document submissions.
 * @param {Array} teamDocs - List of document rows from phase1_submissions
 * @param {string} [patentTypeHint] - Optional hint for patent type
 * @returns {Object} {
 *   patentType: string,
 *   requiredCount: number,
 *   uploadedCount: number,
 *   isComplete: boolean,
 *   missingSlots: Array,
 *   slotResults: Array
 * }
 */
function calculatePhase1Completion(teamDocs = [], patentTypeHint = null) {
  const detectedPatentType = detectPatentType(teamDocs, patentTypeHint);
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
