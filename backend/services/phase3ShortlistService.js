// backend/services/phase3ShortlistService.js
/**
 * Phase 3 Shortlist Synchronization Service
 * IPL-2026 Platform
 * 
 * Reusable backend service for validating, previewing, and synchronizing
 * the authoritative Phase 3 Shortlist into public.phase3_shortlist.
 * 
 * Strict safety rules enforced:
 * - Registration ID is the primary matching key (normalized to /^IPL26-\d{4}$/).
 * - Multi-product teams require unambiguous legacy_registration_id resolution.
 * - Incremental and Full Replacement modes supported atomically.
 * - Removing a team from shortlist NEVER deletes votes, likes, products, or historical data.
 * - Production queries authoritatively hit Supabase public.phase3_shortlist.
 */

const path = require('path');
const XLSX = require('xlsx');

// Strict Registration ID format: IPL26 followed by hyphen and 4 digits
const REG_ID_STRICT_REGEX = /^IPL26-\d{4}$/;

/**
 * Shared validator that detects whether a row/string is a section note, instruction,
 * category separator, or non-team metadata row (e.g. "10 Teams from SIH").
 * 
 * Used consistently across:
 * - parseExcelBuffer()
 * - validateShortlistEntries()
 * - previewShortlist()
 * - Authoritative finalist resolver
 * 
 * @param {string | any} rawVal 
 * @param {object | Array | null} rowData 
 * @returns {boolean} true if this row should be completely skipped before Reg ID validation
 */
function isSectionNoteOrMetadataRow(rawVal, rowData = null) {
  if (rawVal === null || rawVal === undefined) return true;
  const str = String(rawVal).trim();
  if (!str) return true;

  const lower = str.toLowerCase();

  // 1. Explicit Section Notes / Mentions (e.g. '10 Teams from SIH', 'teams from sih', 'sih teams')
  if (
    lower.includes('teams from') ||
    lower.includes('team from') ||
    lower.includes('from sih') ||
    lower.includes('sih team') ||
    lower.includes('sih') ||
    lower.startsWith('note') ||
    lower.includes('section') ||
    lower.includes('instruction') ||
    lower.includes('placeholder')
  ) {
    return true;
  }

  // 2. Repetition of Header Titles
  if (
    (lower.includes('registration') && lower.includes('id')) ||
    lower === 'reg id' ||
    lower === 'reg_id' ||
    lower === 's.no' ||
    lower === 'sl.no' ||
    lower === 's.no.' ||
    lower === 'team name' ||
    lower === 'tech domain' ||
    lower === 'project title'
  ) {
    return true;
  }

  // 3. Category / Domain / Total separators
  if (
    lower === 'hardware' ||
    lower === 'software' ||
    lower === 'hw & sw prototype' ||
    lower === 'prototype' ||
    lower === 'total' ||
    lower.startsWith('total ')
  ) {
    return true;
  }

  // 4. Non-alphanumeric separators (e.g. '---', '===', '***')
  if (/^[-=*_#~]{3,}$/.test(str)) {
    return true;
  }

  // 5. Array row context: if rowData is provided as an array, check if it's a non-data note row
  if (Array.isArray(rowData)) {
    if (!REG_ID_STRICT_REGEX.test(str.toUpperCase().replace(/\s+/g, ''))) {
      const nonBlankCount = rowData.filter(c => String(c || '').trim().length > 0).length;
      if (nonBlankCount <= 3 && (lower.includes('team') || isNaN(Number(str)) && str.length > 6)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 1. Normalizes and validates incoming Registration ID strings.
 * Accepts harmless formatting variations such as:
 * - "ipl26 - 0097"
 * - "IPL26-0097"
 * - "  IPL26 - 0097  "
 * Normalizes to canonical: "IPL26-0097"
 * 
 * @param {string} rawId 
 * @returns {{ valid: boolean, normalizedId: string | null, error?: string }}
 */
function normalizeRegistrationId(rawId) {
  if (rawId === null || rawId === undefined) {
    return { valid: false, normalizedId: null, error: 'Registration ID is null or undefined' };
  }

  const rawStr = String(rawId).trim();
  if (!rawStr) {
    return { valid: false, normalizedId: null, error: 'Registration ID is empty' };
  }

  // Remove spaces around hyphens and internal excess whitespace, convert to uppercase
  // e.g. "ipl26 - 0097" -> "IPL26-0097"
  const cleaned = rawStr
    .toUpperCase()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '');

  if (!REG_ID_STRICT_REGEX.test(cleaned)) {
    return {
      valid: false,
      normalizedId: null,
      rawId: rawStr,
      error: `Malformed Registration ID '${rawStr}'. Expected format: IPL26-XXXX (4 digits)`
    };
  }

  return { valid: true, normalizedId: cleaned };
}

/**
 * 2. Parses Excel buffer into normalized shortlist entry candidates.
 * Supports multiple sheets (e.g. 'HW FINAL', 'SW FINAL', or future custom sheets).
 * Dynamically locates the Registration ID column and extracts sheet/row information.
 * 
 * @param {Buffer} buffer 
 * @returns {Array<{ rawId: string, sheet: string, rowNumber: number, category: string | null }>}
 */
function parseExcelBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid input: Expected a Buffer containing Excel file data.');
  }

  const wb = XLSX.read(buffer, { type: 'buffer' });
  const extractedEntries = [];
  let physicalRowsDetected = 0;
  const ignoredNoteRows = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    // Convert sheet to array of arrays (header: 1)
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows || rows.length === 0) continue;

    // Determine default category based on sheet name if applicable
    let defaultCategory = null;
    const upperSheet = sheetName.trim().toUpperCase();
    if (upperSheet.includes('HW') || upperSheet.includes('HARDWARE')) {
      defaultCategory = 'HW';
    } else if (upperSheet.includes('SW') || upperSheet.includes('SOFTWARE')) {
      defaultCategory = 'SW';
    }

    // Locate header row and column indexes
    let headerRowIndex = -1;
    let regIdColIndex = -1;
    let categoryColIndex = -1;

    for (let r = 0; r < Math.min(10, rows.length); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      for (let c = 0; c < row.length; c++) {
        const cellVal = String(row[c] || '').trim().toLowerCase();
        if (
          cellVal === 'registration id' ||
          cellVal === 'registrationid' ||
          cellVal === 'registration_id' ||
          cellVal === 'reg id' ||
          cellVal === 'reg_id' ||
          cellVal === 'registration no' ||
          cellVal === 'registration number' ||
          cellVal === 'team code'
        ) {
          headerRowIndex = r;
          regIdColIndex = c;
        } else if (
          cellVal === 'category' ||
          cellVal === 'tech domain' ||
          cellVal === 'domain' ||
          cellVal === 'type of project'
        ) {
          categoryColIndex = c;
        }
      }
      if (regIdColIndex !== -1) break;
    }

    // Fallback: If no explicit header matched, scan for first row where a cell matches IPL26 pattern
    if (regIdColIndex === -1) {
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!Array.isArray(row)) continue;
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || '').trim();
          if (/^IPL26\s*-\s*\d{4}$/i.test(val)) {
            regIdColIndex = c;
            headerRowIndex = r - 1; // data starts here
            break;
          }
        }
        if (regIdColIndex !== -1) break;
      }
    }

    // If still no column detected, this sheet does not contain Registration IDs
    if (regIdColIndex === -1) {
      continue;
    }

    const startRow = Math.max(0, headerRowIndex + 1);
    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      const rawVal = String(row[regIdColIndex] || '').trim();
      if (!rawVal) continue; // Skip blank cells in Registration ID column

      physicalRowsDetected++;

      // Skip row if it is a section note, instruction, or category metadata (e.g. '10 Teams from SIH')
      if (isSectionNoteOrMetadataRow(rawVal, row)) {
        ignoredNoteRows.push({
          rawId: rawVal,
          raw_id: rawVal,
          sheet: sheetName,
          rowNumber: r + 1,
          row_number: r + 1,
          reason: 'section_note_or_metadata'
        });
        continue;
      }

      let rowCategory = defaultCategory;
      if (categoryColIndex !== -1 && row[categoryColIndex]) {
        const catVal = String(row[categoryColIndex]).trim().toUpperCase();
        if (catVal.includes('HARDWARE') || catVal === 'HW') rowCategory = 'HW';
        else if (catVal.includes('SOFTWARE') || catVal === 'SW') rowCategory = 'SW';
        else if (catVal) rowCategory = catVal;
      }

      extractedEntries.push({
        rawId: rawVal,
        sheet: sheetName,
        rowNumber: r + 1, // 1-indexed for human readability
        category: rowCategory
      });
    }
  }

  // Attach metadata properties so array length remains pure valid candidate count
  extractedEntries.physical_rows_detected = physicalRowsDetected;
  extractedEntries.ignored_rows_count = ignoredNoteRows.length;
  extractedEntries.ignored_note_rows = ignoredNoteRows;

  return extractedEntries;
}

/**
 * 3. Validates shortlist candidate entries against authoritative database records.
 * Resolves: Registration ID -> Team -> Product with strict multi-product ambiguity checks.
 * Detects: In-sheet duplicates, cross-sheet duplicates, invalid formats, missing registrations.
 * 
 * @param {Array<any>} entries Raw entries or strings
 * @param {object} options { supabaseClient, testStore }
 * @returns {Promise<object>} Validation report
 */
async function validateShortlistEntries(entries, options = {}) {
  const testStore = options.testStore || null;
  const supabase = options.supabaseClient || (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null);

  // 1. Normalize entries structure and ignore non-data section notes BEFORE validation
  const rawList = [];
  const ignoredNoteRows = [...(entries?.ignored_note_rows || [])];
  let physicalCandidateCount = entries?.physical_rows_detected || 0;

  (entries || []).forEach((e, idx) => {
    let rawId = '';
    let sheet = 'Unknown';
    let rowNumber = idx + 1;
    let category = null;
    let product_id = null;
    let product_number = null;

    if (typeof e === 'string') {
      rawId = e;
      sheet = 'Sheet1';
    } else if (e && typeof e === 'object') {
      rawId = e.rawId || e.registration_id || e.registrationId || '';
      sheet = e.sheet || e.sheetName || 'Unknown';
      rowNumber = e.rowNumber || e.row_number || idx + 1;
      category = e.category || null;
      product_id = e.product_id || e.productId || null;
      product_number = e.product_number || e.productNumber || null;
    }

    const trimmedId = String(rawId || '').trim();

    if (!entries?.physical_rows_detected && trimmedId) {
      physicalCandidateCount++;
    }

    // Ignore section notes, category headers, or non-data metadata BEFORE Registration ID validation
    if (isSectionNoteOrMetadataRow(trimmedId, e)) {
      if (trimmedId && !ignoredNoteRows.some(ign => (ign.raw_id === trimmedId || ign.rawId === trimmedId) && ign.sheet === sheet)) {
        ignoredNoteRows.push({
          raw_id: trimmedId,
          rawId: trimmedId,
          sheet: sheet,
          row_number: rowNumber,
          rowNumber: rowNumber,
          reason: 'section_note_or_metadata'
        });
      }
      return; // Skip completely before ID format validation!
    }

    rawList.push({
      rawId: trimmedId,
      sheet,
      rowNumber,
      category,
      product_id,
      product_number
    });
  });

  const totalRowsDetected = rawList.length;
  const invalidFormatIds = [];
  const duplicates = [];
  const missingRegistrationIds = [];
  const ambiguousProducts = [];
  const mappingErrors = [];
  const validRegistrations = [];

  // Track seen products for duplicate product checking
  // Map: product_id -> { sheet, rowNumber, rawId, registration_id, product_title }
  const seenProducts = new Map();

  // 2. Load authoritative registration, team, and product data
  let registrations = [];
  let teams = [];
  let products = [];
  let currentShortlist = [];

  if (testStore) {
    // Isolated unit test fixture path
    registrations = testStore.registrations || [];
    teams = testStore.teams || [];
    products = testStore.products || [];
    currentShortlist = testStore.shortlist || [];
  } else {
    // Production database path
    const [regRes, teamsRes, prodsRes, shortRes] = await Promise.all([
      supabase.from('registrations').select('id, registration_id, team_name, project_title'),
      supabase.from('teams').select('id, team_name'),
      supabase.from('products').select('id, team_id, product_number, product_title, status, legacy_registration_id'),
      supabase.from('phase3_shortlist').select('registration_id, product_id, team_id, category')
    ]);

    if (regRes.error) throw new Error('Database error querying registrations: ' + regRes.error.message);
    if (teamsRes.error) throw new Error('Database error querying teams: ' + teamsRes.error.message);
    if (prodsRes.error) throw new Error('Database error querying products: ' + prodsRes.error.message);

    registrations = regRes.data || [];
    teams = teamsRes.data || [];
    products = prodsRes.data || [];
    // If phase3_shortlist table does not exist yet (pre-migration), catch gracefully
    currentShortlist = shortRes.error ? [] : (shortRes.data || []);
  }

  // Build fast O(1) indexed lookups
  const regByNormId = new Map();
  registrations.forEach(r => {
    if (r.registration_id) {
      const norm = normalizeRegistrationId(r.registration_id);
      if (norm.valid) regByNormId.set(norm.normalizedId, r);
    }
  });

  const teamsByName = new Map();
  const teamsById = new Map();
  teams.forEach(t => {
    if (t.id) teamsById.set(t.id, t);
    if (t.team_name) teamsByName.set(t.team_name.trim().toLowerCase(), t);
  });

  const productsById = new Map();
  const productsByTeamId = new Map();
  const productsByLegacyId = new Map();
  products.forEach(p => {
    if (p.id) productsById.set(p.id, p);
    if (p.team_id) {
      const list = productsByTeamId.get(p.team_id) || [];
      list.push(p);
      productsByTeamId.set(p.team_id, list);
    }
    if (p.legacy_registration_id) {
      const norm = normalizeRegistrationId(p.legacy_registration_id);
      if (norm.valid) {
        const list = productsByLegacyId.get(norm.normalizedId) || [];
        list.push(p);
        productsByLegacyId.set(norm.normalizedId, list);
      }
    }
  });

  const currentShortlistProductSet = new Set(currentShortlist.map(s => s.product_id).filter(Boolean));

  // 3. Process every entry
  for (const item of rawList) {
    const norm = normalizeRegistrationId(item.rawId);

    // Format validation
    if (!norm.valid) {
      invalidFormatIds.push({
        raw_id: item.rawId,
        rawId: item.rawId,
        sheet: item.sheet,
        row_number: item.rowNumber,
        rowNumber: item.rowNumber,
        error: norm.error
      });
      continue;
    }

    const normId = norm.normalizedId;

    // Verify registration existence in database
    const regRecord = regByNormId.get(normId);
    if (!regRecord) {
      missingRegistrationIds.push({
        registration_id: normId,
        raw_id: item.rawId,
        rawId: item.rawId,
        sheet: item.sheet,
        row_number: item.rowNumber,
        rowNumber: item.rowNumber,
        error: `Registration ID '${normId}' does not exist in registrations table`
      });
      continue;
    }

    // Resolve team
    let teamRecord = null;
    if (regRecord.team_name) {
      teamRecord = teamsByName.get(regRecord.team_name.trim().toLowerCase());
    }
    if (!teamRecord) {
      // Fallback: resolve team through legacy_registration_id on products
      const legacyProds = productsByLegacyId.get(normId);
      if (legacyProds && legacyProds.length > 0) {
        teamRecord = teamsById.get(legacyProds[0].team_id);
      }
    }

    if (!teamRecord) {
      mappingErrors.push({
        registration_id: normId,
        sheet: item.sheet,
        row_number: item.rowNumber,
        rowNumber: item.rowNumber,
        error: `Team record for registration '${normId}' ('${regRecord.team_name}') could not be resolved`
      });
      continue;
    }

    // Resolve product with Multi-Product Safety
    const teamProducts = (productsByTeamId.get(teamRecord.id) || []).filter(
      p => !p.status || p.status === 'active'
    );

    let resolvedProduct = null;

    if (teamProducts.length === 0) {
      mappingErrors.push({
        registration_id: normId,
        team_id: teamRecord.id,
        team_name: teamRecord.team_name,
        sheet: item.sheet,
        row_number: item.rowNumber,
        rowNumber: item.rowNumber,
        error: `No active product found for team '${teamRecord.team_name}' (${normId})`
      });
      continue;
    } else if (item.product_id && productsById.has(item.product_id)) {
      // Explicit product ID match
      const explicitProd = productsById.get(item.product_id);
      if (explicitProd.team_id === teamRecord.id) {
        resolvedProduct = explicitProd;
      }
    }

    if (!resolvedProduct) {
      if (teamProducts.length === 1) {
        // Standard case: 1 team = 1 active product
        resolvedProduct = teamProducts[0];
      } else {
        // Team has multiple active products (Multi-Product Resolution)
        // 1. Match by legacy_registration_id matching registration_id
        const matchingLegacyProds = teamProducts.filter(
          p => p.legacy_registration_id && p.legacy_registration_id.trim().toUpperCase() === normId
        );

        if (matchingLegacyProds.length === 1) {
          resolvedProduct = matchingLegacyProds[0];
        } else if (item.product_number) {
          // 2. Match by product_number if provided
          const numMatch = teamProducts.find(p => p.product_number === item.product_number);
          if (numMatch) resolvedProduct = numMatch;
        }

        if (!resolvedProduct) {
          // Ambiguous mapping: Cannot deterministically identify product without guessing
          ambiguousProducts.push({
            registration_id: normId,
            team_id: teamRecord.id,
            team_name: teamRecord.team_name,
            candidate_products: teamProducts.map(p => ({
              id: p.id,
              product_number: p.product_number,
              product_title: p.product_title,
              legacy_registration_id: p.legacy_registration_id
            })),
            sheet: item.sheet,
            row_number: item.rowNumber,
            rowNumber: item.rowNumber,
            error_code: 'AMBIGUOUS_PRODUCT_MAPPING',
            error: `Ambiguous product mapping for team '${teamRecord.team_name}'. Has ${teamProducts.length} active products with no unique registration mapping.`
          });
          continue;
        }
      }
    }

    // 4. PRODUCT-BASED DUPLICATE DETECTION
    // Uniqueness in Phase 3 Shortlist is strictly product-based (product_id).
    // A team may have multiple products (e.g. HW + SW), but the SAME product cannot be shortlisted twice.
    if (seenProducts.has(resolvedProduct.id)) {
      const prior = seenProducts.get(resolvedProduct.id);
      const isSameSheet = prior.sheet === item.sheet;
      duplicates.push({
        registration_id: normId,
        product_id: resolvedProduct.id,
        product_title: resolvedProduct.product_title,
        team_id: teamRecord.id,
        team_name: teamRecord.team_name,
        category: item.category || null,
        raw_id: item.rawId,
        rawId: item.rawId,
        sheet: item.sheet,
        row_number: item.rowNumber,
        rowNumber: item.rowNumber,
        duplicate_of: {
          sheet: prior.sheet,
          row_number: prior.rowNumber,
          rowNumber: prior.rowNumber
        },
        is_same_sheet: isSameSheet,
        is_cross_sheet: !isSameSheet,
        message: isSameSheet
          ? `Duplicate product '${resolvedProduct.product_title}' (${normId}) within sheet '${item.sheet}' at rows ${prior.rowNumber} and ${item.rowNumber}`
          : `Duplicate product '${resolvedProduct.product_title}' (${normId}) across sheets '${prior.sheet}' (row ${prior.rowNumber}) and '${item.sheet}' (row ${item.rowNumber})`
      });
      continue;
    }

    // Register product occurrence
    seenProducts.set(resolvedProduct.id, {
      sheet: item.sheet,
      rowNumber: item.rowNumber,
      rawId: item.rawId,
      registration_id: normId,
      product_id: resolvedProduct.id,
      category: item.category || null
    });

    // Valid entry ready for shortlist
    validRegistrations.push({
      registration_id: normId,
      product_id: resolvedProduct.id,
      team_id: teamRecord.id,
      team_name: teamRecord.team_name,
      product_title: resolvedProduct.product_title,
      category: item.category || null,
      sheet: item.sheet,
      row_number: item.rowNumber,
      rowNumber: item.rowNumber,
      is_already_shortlisted: currentShortlistProductSet.has(resolvedProduct.id)
    });
  }

  const existingShortlistedTeams = validRegistrations.filter(r => r.is_already_shortlisted);
  const newTeams = validRegistrations.filter(r => !r.is_already_shortlisted);

  // Strict blocking validation: Any invalid format, missing ID, duplicate, or ambiguous product blocks sync
  const isValid =
    invalidFormatIds.length === 0 &&
    duplicates.length === 0 &&
    missingRegistrationIds.length === 0 &&
    ambiguousProducts.length === 0 &&
    mappingErrors.length === 0 &&
    validRegistrations.length > 0;

  return {
    total_rows_detected: totalRowsDetected,
    rows_selected: totalRowsDetected,
    physical_rows_detected: physicalCandidateCount || (totalRowsDetected + ignoredNoteRows.length),
    ignored_rows_count: ignoredNoteRows.length,
    ignored_note_rows: ignoredNoteRows,
    valid_registrations: validRegistrations,
    valid_count: validRegistrations.length,
    new_teams: newTeams,
    new_teams_count: newTeams.length,
    existing_shortlisted_teams: existingShortlistedTeams,
    existing_shortlisted_count: existingShortlistedTeams.length,
    duplicates: duplicates,
    duplicates_count: duplicates.length,
    missing_registration_ids: missingRegistrationIds,
    missing_count: missingRegistrationIds.length,
    ambiguous_products: ambiguousProducts,
    ambiguous_count: ambiguousProducts.length,
    invalid_format_ids: invalidFormatIds,
    invalid_format_count: invalidFormatIds.length,
    mapping_errors: mappingErrors,
    mapping_errors_count: mappingErrors.length,
    current_database_shortlist_count: currentShortlist.length,
    current_shortlist: currentShortlist,
    is_valid: isValid
  };
}

/**
 * 4. Previews the effect of a shortlist synchronization with ZERO database mutations.
 * Calculates additions, updates, and removals (for FULL_REPLACEMENT mode).
 * 
 * @param {Buffer | Array<any>} input Excel buffer or parsed entries
 * @param {object} options { mode: 'INCREMENTAL' | 'FULL_REPLACEMENT', supabaseClient, testStore }
 * @returns {Promise<object>} Preview report
 */
async function previewShortlist(input, options = {}) {
  let entries = [];
  if (Buffer.isBuffer(input)) {
    entries = parseExcelBuffer(input);
  } else if (Array.isArray(input)) {
    entries = input;
  } else if (input && typeof input === 'object' && input.entries) {
    entries = input.entries;
  } else {
    throw new Error('Invalid preview input. Expected an Excel Buffer or an array of entries.');
  }

  const mode = String(options.mode || 'INCREMENTAL').trim().toUpperCase();
  if (mode !== 'INCREMENTAL' && mode !== 'FULL_REPLACEMENT') {
    throw new Error(`Invalid sync mode '${mode}'. Must be 'INCREMENTAL' or 'FULL_REPLACEMENT'.`);
  }

  const validation = await validateShortlistEntries(entries, options);

  // In FULL_REPLACEMENT mode, identify records currently in database that will be removed
  const toRemove = [];
  if (mode === 'FULL_REPLACEMENT') {
    const incomingValidProductIds = new Set(validation.valid_registrations.map(r => r.product_id));
    for (const existing of validation.current_shortlist) {
      if (!incomingValidProductIds.has(existing.product_id)) {
        toRemove.push({
          registration_id: existing.registration_id,
          product_id: existing.product_id,
          team_id: existing.team_id,
          category: existing.category
        });
      }
    }
  }

  return {
    mode: mode,
    is_valid: validation.is_valid,
    can_sync: validation.is_valid,
    physical_rows_detected: validation.physical_rows_detected,
    total_rows_detected: validation.total_rows_detected,
    rows_selected: validation.total_rows_detected,
    ignored_rows_count: validation.ignored_rows_count,
    ignored_note_rows: validation.ignored_note_rows,
    valid_count: validation.valid_count,
    valid_registrations: validation.valid_registrations,
    new_teams_count: validation.new_teams_count,
    new_teams: validation.new_teams_count,
    existing_shortlisted_count: validation.existing_shortlisted_count,
    existing_shortlisted_teams: validation.existing_shortlisted_count,
    to_remove_count: toRemove.length,
    to_remove: toRemove.length,
    to_remove_records: toRemove,
    duplicates_count: validation.duplicates_count,
    duplicates: validation.duplicates,
    missing_count: validation.missing_count,
    missing_registration_ids: validation.missing_registration_ids,
    ambiguous_count: validation.ambiguous_count,
    ambiguous_products: validation.ambiguous_products,
    invalid_format_count: validation.invalid_format_count,
    invalid_format_ids: validation.invalid_format_ids,
    mapping_errors_count: validation.mapping_errors_count,
    mapping_errors: validation.mapping_errors,
    summary: {
      message: validation.is_valid
        ? `Shortlist validation PASSED for mode '${mode}'. ${validation.valid_count} valid entries (${validation.new_teams_count} new, ${toRemove.length} to remove).`
        : `Shortlist validation FAILED. Correct ${validation.duplicates_count} duplicates, ${validation.missing_count} missing, ${validation.invalid_format_count} invalid, and ${validation.ambiguous_count} ambiguous entries before syncing.`,
      physical_rows: validation.physical_rows_detected,
      ignored_notes: validation.ignored_rows_count,
      valid_teams: validation.valid_count,
      new_teams: validation.new_teams_count,
      already_shortlisted: validation.existing_shortlisted_count,
      duplicates: validation.duplicates_count,
      to_remove: toRemove.length
    }
  };
}

/**
 * 5. Executes atomic shortlist synchronization into public.phase3_shortlist.
 * If any validation error exists, aborts with ZERO database changes.
 * Under FULL_REPLACEMENT, removes ONLY absent shortlist rows, preserving all historical data.
 * 
 * @param {Buffer | Array<any>} input Excel buffer or parsed entries
 * @param {object} options { mode: 'INCREMENTAL' | 'FULL_REPLACEMENT', supabaseClient, testStore }
 * @returns {Promise<object>} Sync execution result
 */
async function syncShortlist(input, options = {}) {
  // 1. Run preview/validation first
  const preview = await previewShortlist(input, options);

  // 2. Abort if validation fails
  if (!preview.is_valid) {
    return {
      success: false,
      error_code: 'VALIDATION_FAILED',
      message: 'Shortlist synchronization aborted due to blocking validation errors.',
      preview: preview
    };
  }

  const mode = preview.mode;
  const recordsToSync = preview.valid_registrations.map(r => ({
    registration_id: r.registration_id,
    product_id: r.product_id,
    team_id: r.team_id,
    category: r.category
  }));

  // 3. Isolated test fixture execution path
  if (options.testStore) {
    const store = options.testStore;
    let removedCount = 0;
    let upsertedCount = 0;

    if (mode === 'FULL_REPLACEMENT') {
      const newProductIds = new Set(recordsToSync.map(r => r.product_id));
      const beforeLen = store.shortlist.length;
      store.shortlist = store.shortlist.filter(s => newProductIds.has(s.product_id));
      removedCount = beforeLen - store.shortlist.length;
    }

    for (const rec of recordsToSync) {
      const idx = store.shortlist.findIndex(s => s.product_id === rec.product_id);
      if (idx >= 0) {
        store.shortlist[idx] = { ...store.shortlist[idx], ...rec, updated_at: new Date().toISOString() };
      } else {
        store.shortlist.push({ ...rec, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      }
      upsertedCount++;
    }

    // Invalidate leaderboard in-memory cache if available
    try {
      const ideaRoutes = require('../routes/ideaRoutes');
      if (ideaRoutes && typeof ideaRoutes.invalidateLeaderboardCache === 'function') {
        ideaRoutes.invalidateLeaderboardCache();
      }
    } catch (_) {}

    return {
      success: true,
      mode: mode,
      upserted_count: upsertedCount,
      removed_count: removedCount,
      total_shortlisted: store.shortlist.length,
      message: `Phase 3 shortlist ${mode} completed successfully. ${upsertedCount} records upserted, ${removedCount} removed. Total: ${store.shortlist.length}`
    };
  }

  // 4. Production Database Execution Path via Atomic RPC
  const supabase = options.supabaseClient || require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('sync_phase3_shortlist', {
      p_records: recordsToSync,
      p_mode: mode
    });

    if (rpcErr) {
      return {
        success: false,
        error_code: 'DATABASE_ERROR',
        message: 'Database error executing sync_phase3_shortlist RPC: ' + rpcErr.message,
        preview
      };
    }

    // Invalidate leaderboard in-memory cache if available
    try {
      const ideaRoutes = require('../routes/ideaRoutes');
      if (ideaRoutes && typeof ideaRoutes.invalidateLeaderboardCache === 'function') {
        ideaRoutes.invalidateLeaderboardCache();
      }
    } catch (_) {}

    // Invalidate cached authoritative finalists if any
    cachedAuthoritativeFinalists = null;

    return {
      success: true,
      mode: mode,
      upserted_count: rpcResult.upserted_count,
      removed_count: rpcResult.removed_count,
      total_shortlisted: rpcResult.total_shortlisted,
      message: rpcResult.message || `Phase 3 shortlist ${mode} synchronized successfully.`,
      preview
    };
  } catch (err) {
    return {
      success: false,
      error_code: 'SERVER_ERROR',
      message: 'Unexpected error during shortlist sync: ' + err.message
    };
  }
}

// In-memory cache for parsed authoritative finalists from workbook
let cachedAuthoritativeFinalists = null;
let cachedAuthoritativeFinalistsAt = 0;

/**
 * 6. Retrieves the authoritative Phase 3 finalists list.
 * Strategy:
 * - If testStore is provided, returns testStore.shortlist.
 * - Queries public.phase3_shortlist from Supabase.
 * - If Supabase table contains the complete finalist set (>= 90 rows), returns it.
 * - If Supabase table contains fewer rows (e.g. 68 rows pre-migration), and the authoritative
 *   local workbook (IPL_2026_Finalists_Authoritative.xlsx) is present, loads and validates
 *   the authoritative 90 finalists, caching them in memory.
 * 
 * @param {object} options { supabaseClient, testStore }
 * @returns {Promise<Array<object>>}
 */
async function getAuthoritativeShortlist(options = {}) {
  // Test fixture store path
  if (options.testStore) {
    return options.testStore.shortlist || [];
  }

  const supabase = options.supabaseClient || require('../supabaseClient').supabase;

  // 1. Try querying Supabase phase3_shortlist
  let dbRows = null;
  let dbErr = null;
  try {
    const res = await supabase
      .from('phase3_shortlist')
      .select('registration_id, product_id, team_id, category');
    dbRows = res.data;
    dbErr = res.error;
  } catch (err) {
    dbErr = err;
  }

  // If DB has 90 or more records, it has already been migrated with all authoritative finalists!
  if (dbRows && dbRows.length >= 90) {
    return dbRows;
  }

  // 2. Authoritative workbook resolution if DB is not yet migrated to 90 finalists
  const fs = require('fs');
  const workbookPath = path.join(__dirname, '../data/IPL_2026_Finalists_Authoritative.xlsx');

  if (fs.existsSync(workbookPath)) {
    const now = Date.now();
    // Cache for 60 seconds
    if (cachedAuthoritativeFinalists && (now - cachedAuthoritativeFinalistsAt) < 60000) {
      return cachedAuthoritativeFinalists;
    }

    try {
      const buf = fs.readFileSync(workbookPath);
      const parsed = parseExcelBuffer(buf);
      const val = await validateShortlistEntries(parsed, { supabaseClient: supabase });
      if (val.is_valid && val.valid_registrations && val.valid_registrations.length > 0) {
        cachedAuthoritativeFinalists = val.valid_registrations.map(r => ({
          product_id: r.product_id,
          team_id: r.team_id,
          registration_id: r.registration_id,
          category: r.category
        }));
        cachedAuthoritativeFinalistsAt = now;
        return cachedAuthoritativeFinalists;
      }
    } catch (parseErr) {
      console.warn('[ShortlistService] Note loading authoritative workbook:', parseErr.message);
    }
  }

  // Fallback to whatever DB rows exist
  if (dbRows) {
    return dbRows;
  }

  if (dbErr) {
    throw new Error('Shortlist table unavailable: ' + dbErr.message);
  }

  return [];
}

module.exports = {
  isSectionNoteOrMetadataRow,
  normalizeRegistrationId,
  parseExcelBuffer,
  validateShortlistEntries,
  previewShortlist,
  syncShortlist,
  getAuthoritativeShortlist
};

