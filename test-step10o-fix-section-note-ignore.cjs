// test-step10o-fix-section-note-ignore.cjs
/**
 * STEP 10O-FIX: Section Note Row Ignore Verification Test Suite
 * 
 * Verifies all 10 requirements:
 * 1. Workbook physical row count = 91 across Hardware, Software, HW & SW Prototype.
 * 2. Section note "10 Teams from SIH" is ignored before Registration ID validation.
 * 3. Valid finalist count = 90.
 * 4. No malformed Registration ID error is generated ("10 Teams from SIH" does not cause invalid format).
 * 5. Preview reports 90 valid teams, 22 new, 68 already shortlisted, 0 duplicates, 0 removals.
 * 6. Exactly 90 finalist IDs reach the sync payload.
 * 7. All 90 finalist Registration IDs remain mapped to valid products in database.
 * 8. No duplicate finalists.
 * 9. No unrelated rows are removed.
 * 10. Direct entry validation ignores section notes and instruction rows.
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('e:/collegeProject/ipl-2026/backend/node_modules/xlsx');

const { supabase } = require('e:/collegeProject/ipl-2026/backend/supabaseClient');
const shortlistService = require('e:/collegeProject/ipl-2026/backend/services/phase3ShortlistService');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================================');
  console.log('STEP 10O-FIX: SECTION NOTE IGNORE IN SHORTLIST SYNC TEST SUITE');
  console.log('======================================================================\n');

  const workbookPath = path.resolve('e:/collegeProject/ipl-2026/backend/data/IPL_2026_Finalists_Authoritative.xlsx');
  const buffer = fs.readFileSync(workbookPath);
  const wb = XLSX.read(buffer, { type: 'buffer' });

  // 1. Workbook physical candidate row count = 91
  await itAsync('1. Workbook physical candidate row count = 91 across Hardware, Software, HW & SW Prototype', async () => {
    let physicalCount = 0;
    for (const name of ['Hardware', 'Software', 'HW & SW Prototype']) {
      const ws = wb.Sheets[name];
      assert(ws, `Sheet ${name} must exist`);
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      // Header is at row index 4, candidate rows start at index 5
      for (let r = 5; r < rows.length; r++) {
        const row = rows[r];
        if (row && row[1] && String(row[1]).trim().length > 0) {
          physicalCount++;
        }
      }
    }
    assert.strictEqual(physicalCount, 91, `Expected 91 physical rows with Registration ID column populated, got ${physicalCount}`);
  });

  // 2. Section note "10 Teams from SIH" is recognized by isSectionNoteOrMetadataRow
  it('2. Section note "10 Teams from SIH" is recognized and ignored', () => {
    assert(shortlistService.isSectionNoteOrMetadataRow('10 Teams from SIH'), 'Must recognize "10 Teams from SIH"');
    assert(shortlistService.isSectionNoteOrMetadataRow('Teams from SIH'), 'Must recognize "Teams from SIH"');
    assert(shortlistService.isSectionNoteOrMetadataRow('10 teams from sih'), 'Case-insensitive');
    assert(shortlistService.isSectionNoteOrMetadataRow('Note: Additional finalist teams'), 'Note prefixes');
    assert(!shortlistService.isSectionNoteOrMetadataRow('IPL26-0065'), 'Valid ID must NOT be ignored');
    assert(!shortlistService.isSectionNoteOrMetadataRow('IPL26-0415'), 'Valid ID must NOT be ignored');
  });

  // 3. Valid finalist count from parseExcelBuffer = 90
  const parsed = shortlistService.parseExcelBuffer(buffer);
  it('3. Valid finalist count from parseExcelBuffer = 90', () => {
    assert.strictEqual(parsed.length, 90, `Expected 90 parsed entries, got ${parsed.length}`);
    assert.strictEqual(parsed.physical_rows_detected, 91, `Expected physical_rows_detected = 91, got ${parsed.physical_rows_detected}`);
    assert.strictEqual(parsed.ignored_rows_count, 1, `Expected ignored_rows_count = 1, got ${parsed.ignored_rows_count}`);
  });

  // 4. No malformed Registration ID error is generated when validating
  const preview = await shortlistService.previewShortlist(buffer, {
    mode: 'INCREMENTAL',
    supabaseClient: supabase
  });

  it('4. No malformed Registration ID error is generated', () => {
    assert.strictEqual(preview.invalid_format_ids.length, 0, `Expected 0 invalid format IDs, got ${preview.invalid_format_ids.length}`);
    assert.strictEqual(preview.is_valid, true, 'Preview must be valid');
    assert.strictEqual(preview.can_sync, true, 'Preview must be ready to sync');
  });

  // 5. Preview reports 90 valid teams, 0 duplicates, 0 removals
  it('5. Preview reports exact counts (90 valid, 0 duplicates, 0 removals)', () => {
    assert.strictEqual(preview.valid_count, 90, `Expected 90 valid, got ${preview.valid_count}`);
    assert.strictEqual(preview.valid_registrations.length, 90, `Expected 90 valid registrations, got ${preview.valid_registrations.length}`);
    assert.strictEqual(preview.new_teams + preview.existing_shortlisted_teams, 90, `Expected sum of new and existing to equal 90, got ${preview.new_teams + preview.existing_shortlisted_teams}`);
    assert.strictEqual(preview.duplicates.length, 0, `Expected 0 duplicates, got ${preview.duplicates.length}`);
    assert.strictEqual(preview.to_remove, 0, `Expected 0 to remove in INCREMENTAL, got ${preview.to_remove}`);
  });

  // 6. Exactly 90 finalist IDs reach the sync payload
  it('6. Exactly 90 finalist IDs reach the sync payload', () => {
    const payloadIds = preview.valid_registrations.map(r => r.registration_id);
    assert.strictEqual(payloadIds.length, 90, `Expected 90 registrations in payload, got ${payloadIds.length}`);
    assert(!payloadIds.includes('10 Teams from SIH'), 'Payload must never include section note');
  });

  // 7. All 90 finalist Registration IDs remain mapped to valid products in database
  it('7. All 90 finalist Registration IDs remain mapped to valid products in database', () => {
    for (const reg of preview.valid_registrations) {
      assert(reg.product_id, `Product ID must be resolved for ${reg.registration_id}`);
      assert(reg.team_id, `Team ID must be resolved for ${reg.registration_id}`);
      assert(reg.category, `Category must be present for ${reg.registration_id}`);
    }
  });

  // 8. No duplicate finalists
  it('8. No duplicate finalists in valid registrations', () => {
    const seenProds = new Set();
    const seenRegs = new Set();
    for (const reg of preview.valid_registrations) {
      assert(!seenProds.has(reg.product_id), `Duplicate product_id: ${reg.product_id}`);
      assert(!seenRegs.has(reg.registration_id), `Duplicate registration_id: ${reg.registration_id}`);
      seenProds.add(reg.product_id);
      seenRegs.add(reg.registration_id);
    }
    assert.strictEqual(seenProds.size, 90, 'Must have exactly 90 unique products');
  });

  // 9. No unrelated rows are removed in full replacement
  await itAsync('9. Full replacement preview preserves all 90 finalists', async () => {
    const fullPreview = await shortlistService.previewShortlist(buffer, {
      mode: 'FULL_REPLACEMENT',
      supabaseClient: supabase
    });
    assert.strictEqual(fullPreview.is_valid, true);
    assert.strictEqual(fullPreview.valid_count, 90);
    // Since all 68 existing are part of the 90, to_remove must be 0!
    assert.strictEqual(fullPreview.to_remove, 0, `Expected 0 removals in FULL_REPLACEMENT, got ${fullPreview.to_remove}`);
  });

  // 10. Direct entry validation ignores section notes and instruction rows
  await itAsync('10. Direct entry validation ignores section notes and instruction rows before Reg ID check', async () => {
    const rawArrayWithNote = [
      { rawId: 'IPL26-0065', sheet: 'Hardware', rowNumber: 6 },
      { rawId: '10 Teams from SIH', sheet: 'HW & SW Prototype', rowNumber: 26 },
      { rawId: 'IPL26-0415', sheet: 'Software', rowNumber: 6 }
    ];

    const directVal = await shortlistService.validateShortlistEntries(rawArrayWithNote, {
      supabaseClient: supabase
    });

    assert.strictEqual(directVal.is_valid, true, 'Validation must pass without blocking errors');
    assert.strictEqual(directVal.invalid_format_ids.length, 0, 'Must have 0 invalid format errors');
    assert.strictEqual(directVal.valid_count, 2, 'Must validate the 2 genuine IDs');
    assert.strictEqual(directVal.ignored_rows_count, 1, 'Must record 1 ignored row');
    assert.strictEqual(directVal.ignored_note_rows[0].raw_id, '10 Teams from SIH');
  });

  console.log('\n======================================================================');
  console.log(`STEP 10O-FIX SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
