-- ==============================================================================
-- MIGRATION: Stage 12 — Both Patent Protection & Safe Classification
-- FILE: stage_12_both_patent_protection.sql
-- 
-- STATUS: GENERATED & VALIDATED (NOT APPLIED TO PRODUCTION)
-- 
-- SEQUENCE REQUIREMENT:
-- Apply Stage 12 FIRST, then apply Stage 13.
-- 
-- PURPOSE:
-- 1. Pre-migration safety assertion: validate live dataset matches expected
--    baseline (396 total, 16 Design, 380 Utility) before any modifications.
-- 2. Safely add `patent_type` column (nullable first).
-- 3. Explicitly classify all 16 verified historical Design submissions to 'Design Patent'
--    and convert their legacy document_type to canonical Design types:
--    - 8 NOVELTY_FORM
--    - 8 REPRESENTATION_SHEET
--    using exact UUIDs.
-- 4. Classify authorized historical Utility document types ('FORM_2', 'FORM_5',
--    'FIGURE_OF_ABSTRACT', 'LIST_OF_DRAWINGS') as 'Utility Patent', explicitly
--    excluding the 16 verified Design UUIDs.
-- 5. Post-classification fail-closed safety assertions:
--    - patent_type IS NULL count = 0
--    - patent_type NOT IN ('Utility Patent', 'Design Patent') count = 0
--    - total classified rows = current total rows (396 total, 16 Design, 380 Utility).
-- 6. Enforce NOT NULL on `patent_type` without setting a DEFAULT value.
-- 7. Update document_type check constraint to permit Design document types.
-- 8. Update UNIQUE constraint from (team_id, document_type) to 
--    (team_id, document_type, patent_type) to support dual-track protection.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- PRE-MIGRATION SAFETY ASSERTION: Validate Live Dataset Baseline
-- Validates that the live database exactly matches expected counts before execution:
-- - Total rows in public.phase1_submissions = 396
-- - Verified Design submissions present = 16
-- - Eligible Utility submissions present = 380
-- If the live count changes before execution, abort immediately to prevent
-- operating on stale assumptions.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_pre_total_count INTEGER;
  v_pre_design_count INTEGER;
  v_pre_utility_count INTEGER;
BEGIN
  -- 1. Check total rows
  SELECT COUNT(*) INTO v_pre_total_count
  FROM public.phase1_submissions;

  IF v_pre_total_count <> 396 THEN
    RAISE EXCEPTION 'PRE-MIGRATION ASSERTION FAILED: Expected exactly 396 phase1_submissions rows, but found %. Aborting migration.', v_pre_total_count;
  END IF;

  -- 2. Check 16 verified Design rows present
  SELECT COUNT(*) INTO v_pre_design_count
  FROM public.phase1_submissions
  WHERE id IN (
    '68040111-650a-414c-8b2e-08dcb84b5ec1',
    '900e867d-dffe-43d4-b569-1fecf9921b7d',
    '5b5a6e5b-41cb-4a5d-b05f-1b367e7097a4',
    '4f3de315-25c1-4b56-b85a-e323bcfdc098',
    '628f948f-d90f-4d59-9b47-9704a6a16516',
    '3b7ce887-abd8-41d6-ad81-65264de93f29',
    'b2aa79dc-764c-4de1-9777-3ce26d3b3624',
    'bc24e890-25f6-4d31-9250-d9ca791c5895',
    'fe50cea4-758f-4535-be3a-e15a47101111',
    '4e9a4bb8-a4b9-41ed-951f-ba97ac64bffe',
    'bca2b405-7432-4c38-a1c0-ee0cf919b28b',
    'cba25599-e24a-4b6d-91bc-ad28924b1ec2',
    '164b3ac0-e3fe-4b7a-94ee-6c7b4ad5d80c',
    '771f22b2-e9e8-4ae8-9f9e-2331c48994e6',
    '73bd2104-ad0d-45ff-b6bd-852bddb3cbbc',
    'e0e33ff6-2d2d-4170-8404-2bae8da066ca'
  );

  IF v_pre_design_count <> 16 THEN
    RAISE EXCEPTION 'PRE-MIGRATION ASSERTION FAILED: Expected exactly 16 verified Design rows, but found %. Aborting migration.', v_pre_design_count;
  END IF;

  -- 3. Check 380 eligible Utility rows
  SELECT COUNT(*) INTO v_pre_utility_count
  FROM public.phase1_submissions
  WHERE document_type IN ('FIGURE_OF_ABSTRACT', 'LIST_OF_DRAWINGS', 'FORM_2', 'FORM_5')
    AND id NOT IN (
      '68040111-650a-414c-8b2e-08dcb84b5ec1',
      '900e867d-dffe-43d4-b569-1fecf9921b7d',
      '5b5a6e5b-41cb-4a5d-b05f-1b367e7097a4',
      '4f3de315-25c1-4b56-b85a-e323bcfdc098',
      '628f948f-d90f-4d59-9b47-9704a6a16516',
      '3b7ce887-abd8-41d6-ad81-65264de93f29',
      'b2aa79dc-764c-4de1-9777-3ce26d3b3624',
      'bc24e890-25f6-4d31-9250-d9ca791c5895',
      'fe50cea4-758f-4535-be3a-e15a47101111',
      '4e9a4bb8-a4b9-41ed-951f-ba97ac64bffe',
      'bca2b405-7432-4c38-a1c0-ee0cf919b28b',
      'cba25599-e24a-4b6d-91bc-ad28924b1ec2',
      '164b3ac0-e3fe-4b7a-94ee-6c7b4ad5d80c',
      '771f22b2-e9e8-4ae8-9f9e-2331c48994e6',
      '73bd2104-ad0d-45ff-b6bd-852bddb3cbbc',
      'e0e33ff6-2d2d-4170-8404-2bae8da066ca'
    );

  IF v_pre_utility_count <> 380 THEN
    RAISE EXCEPTION 'PRE-MIGRATION ASSERTION FAILED: Expected exactly 380 eligible Utility rows, but found %. Aborting migration.', v_pre_utility_count;
  END IF;

  RAISE NOTICE 'PRE-MIGRATION SAFETY ASSERTION PASSED: Total=396, Design=16, Utility=380.';
END $$;


-- ------------------------------------------------------------------------------
-- STEP 1: Add patent_type as NULLABLE (Do NOT default silently on existing rows)
-- ------------------------------------------------------------------------------
ALTER TABLE public.phase1_submissions
  ADD COLUMN IF NOT EXISTS patent_type TEXT;

-- Add check constraint for valid patent types
ALTER TABLE public.phase1_submissions
  DROP CONSTRAINT IF EXISTS chk_phase1_submissions_patent_type;

ALTER TABLE public.phase1_submissions
  ADD CONSTRAINT chk_phase1_submissions_patent_type
  CHECK (patent_type IN ('Utility Patent', 'Design Patent'));

-- Relax document_type constraint if present to permit Design document types during migration
ALTER TABLE public.phase1_submissions
  DROP CONSTRAINT IF EXISTS chk_submission_document_type;


-- ------------------------------------------------------------------------------
-- STEP 2: Explicitly classify all 16 verified Design submissions
-- All 16 rows identified during production audit updated to 'Design Patent'
-- and canonical document_type (8 NOVELTY_FORM, 8 REPRESENTATION_SHEET) by exact UUID.
-- NOTE: Google Drive files, Drive IDs, folder IDs, and timestamps remain untouched.
-- ------------------------------------------------------------------------------

-- 1. IPL26-0394 Novelty Form
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'NOVELTY_FORM'
WHERE id = '68040111-650a-414c-8b2e-08dcb84b5ec1';

-- 2. IPL26-0197 Representation Sheet
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'REPRESENTATION_SHEET'
WHERE id = '900e867d-dffe-43d4-b569-1fecf9921b7d';

-- 3. IPL26-0395 Novelty Form
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'NOVELTY_FORM'
WHERE id = '5b5a6e5b-41cb-4a5d-b05f-1b367e7097a4';

-- 4. IPL26-0050 Representation Sheet
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'REPRESENTATION_SHEET'
WHERE id = '4f3de315-25c1-4b56-b85a-e323bcfdc098';

-- 5. IPL26-0076 Representation Sheet
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'REPRESENTATION_SHEET'
WHERE id = '628f948f-d90f-4d59-9b47-9704a6a16516';

-- 6. IPL26-0139 Representation Sheet
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'REPRESENTATION_SHEET'
WHERE id = '3b7ce887-abd8-41d6-ad81-65264de93f29';

-- 7. IPL26-0181 Novelty Form
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'NOVELTY_FORM'
WHERE id = 'b2aa79dc-764c-4de1-9777-3ce26d3b3624';

-- 8. IPL26-0253 Novelty Form
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'NOVELTY_FORM'
WHERE id = 'bc24e890-25f6-4d31-9250-d9ca791c5895';

-- 9. IPL26-0176 Representation Sheet
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'REPRESENTATION_SHEET'
WHERE id = 'fe50cea4-758f-4535-be3a-e15a47101111';

-- 10. IPL26-0063 Representation Sheet
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'REPRESENTATION_SHEET'
WHERE id = '4e9a4bb8-a4b9-41ed-951f-ba97ac64bffe';

-- 11. IPL26-0173 Novelty Form
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'NOVELTY_FORM'
WHERE id = 'bca2b405-7432-4c38-a1c0-ee0cf919b28b';

-- 12. IPL26-0079 Representation Sheet
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'REPRESENTATION_SHEET'
WHERE id = 'cba25599-e24a-4b6d-91bc-ad28924b1ec2';

-- 13. IPL26-0293 Novelty Form
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'NOVELTY_FORM'
WHERE id = '164b3ac0-e3fe-4b7a-94ee-6c7b4ad5d80c';

-- 14. IPL26-0361 Novelty Form
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'NOVELTY_FORM'
WHERE id = '771f22b2-e9e8-4ae8-9f9e-2331c48994e6';

-- 15. IPL26-0431 Novelty Form
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'NOVELTY_FORM'
WHERE id = '73bd2104-ad0d-45ff-b6bd-852bddb3cbbc';

-- 16. IPL26-0083 Representation Sheet
UPDATE public.phase1_submissions
SET patent_type = 'Design Patent',
    document_type = 'REPRESENTATION_SHEET'
WHERE id = 'e0e33ff6-2d2d-4170-8404-2bae8da066ca';


-- ------------------------------------------------------------------------------
-- STEP 3: Classify remaining authorized historical rows as 'Utility Patent'
-- Authorized historical classification rules:
--   - FORM_2 (Grant Form) -> Utility Patent
--   - FORM_5 (Declaration Form) -> Utility Patent
--   - FIGURE_OF_ABSTRACT -> Utility Patent
--   - LIST_OF_DRAWINGS -> Utility Patent
-- STRICT EXCLUSION: The 16 verified Design UUIDs MUST be explicitly excluded
-- from Utility classification even though their legacy document_type was FORM_2 or FORM_5.
-- No filename heuristics or global WHERE patent_type IS NULL are used.
-- ------------------------------------------------------------------------------
UPDATE public.phase1_submissions
SET patent_type = 'Utility Patent'
WHERE document_type IN ('FORM_2', 'FORM_5', 'FIGURE_OF_ABSTRACT', 'LIST_OF_DRAWINGS')
  AND id NOT IN (
    '68040111-650a-414c-8b2e-08dcb84b5ec1',
    '900e867d-dffe-43d4-b569-1fecf9921b7d',
    '5b5a6e5b-41cb-4a5d-b05f-1b367e7097a4',
    '4f3de315-25c1-4b56-b85a-e323bcfdc098',
    '628f948f-d90f-4d59-9b47-9704a6a16516',
    '3b7ce887-abd8-41d6-ad81-65264de93f29',
    'b2aa79dc-764c-4de1-9777-3ce26d3b3624',
    'bc24e890-25f6-4d31-9250-d9ca791c5895',
    'fe50cea4-758f-4535-be3a-e15a47101111',
    '4e9a4bb8-a4b9-41ed-951f-ba97ac64bffe',
    'bca2b405-7432-4c38-a1c0-ee0cf919b28b',
    'cba25599-e24a-4b6d-91bc-ad28924b1ec2',
    '164b3ac0-e3fe-4b7a-94ee-6c7b4ad5d80c',
    '771f22b2-e9e8-4ae8-9f9e-2331c48994e6',
    '73bd2104-ad0d-45ff-b6bd-852bddb3cbbc',
    'e0e33ff6-2d2d-4170-8404-2bae8da066ca'
  );


-- ------------------------------------------------------------------------------
-- STEP 4: POST-CLASSIFICATION FAIL-CLOSED SAFETY ASSERTIONS
-- Validates:
-- 1. patent_type IS NULL count = 0 (no unclassified rows remain)
-- 2. patent_type NOT IN ('Utility Patent', 'Design Patent') count = 0 (no invalid values)
-- 3. total classified rows = current total rows
-- 4. exact counts match expected post-classification distribution:
--    - Design Patent count = 16
--    - Utility Patent count = 380
--    - Total count = 396
-- If any condition is violated, abort the transaction immediately.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_post_total_count INTEGER;
  v_post_null_count INTEGER;
  v_post_invalid_count INTEGER;
  v_post_design_count INTEGER;
  v_post_utility_count INTEGER;
BEGIN
  -- 1. Check total rows
  SELECT COUNT(*) INTO v_post_total_count
  FROM public.phase1_submissions;

  -- 2. Check NULL patent_type count
  SELECT COUNT(*) INTO v_post_null_count
  FROM public.phase1_submissions
  WHERE patent_type IS NULL;

  IF v_post_null_count > 0 THEN
    RAISE EXCEPTION 'POST-CLASSIFICATION ASSERTION FAILED: Found % rows with NULL patent_type. Aborting migration.', v_post_null_count;
  END IF;

  -- 3. Check invalid patent_type count
  SELECT COUNT(*) INTO v_post_invalid_count
  FROM public.phase1_submissions
  WHERE patent_type NOT IN ('Utility Patent', 'Design Patent');

  IF v_post_invalid_count > 0 THEN
    RAISE EXCEPTION 'POST-CLASSIFICATION ASSERTION FAILED: Found % rows with invalid patent_type. Aborting migration.', v_post_invalid_count;
  END IF;

  -- 4. Check Design Patent count
  SELECT COUNT(*) INTO v_post_design_count
  FROM public.phase1_submissions
  WHERE patent_type = 'Design Patent';

  IF v_post_design_count <> 16 THEN
    RAISE EXCEPTION 'POST-CLASSIFICATION ASSERTION FAILED: Expected exactly 16 Design Patent rows, but found %. Aborting migration.', v_post_design_count;
  END IF;

  -- 5. Check Utility Patent count
  SELECT COUNT(*) INTO v_post_utility_count
  FROM public.phase1_submissions
  WHERE patent_type = 'Utility Patent';

  IF v_post_utility_count <> 380 THEN
    RAISE EXCEPTION 'POST-CLASSIFICATION ASSERTION FAILED: Expected exactly 380 Utility Patent rows, but found %. Aborting migration.', v_post_utility_count;
  END IF;

  -- 6. Check total classified rows = current total rows
  IF (v_post_design_count + v_post_utility_count) <> v_post_total_count THEN
    RAISE EXCEPTION 'POST-CLASSIFICATION ASSERTION FAILED: Classified sum (% + % = %) does not equal total rows (%). Aborting migration.',
      v_post_design_count, v_post_utility_count, (v_post_design_count + v_post_utility_count), v_post_total_count;
  END IF;

  IF v_post_total_count <> 396 THEN
    RAISE EXCEPTION 'POST-CLASSIFICATION ASSERTION FAILED: Expected 396 total rows, but found %. Aborting migration.', v_post_total_count;
  END IF;

  RAISE NOTICE 'POST-CLASSIFICATION ASSERTION PASSED: Total=%, Design=%, Utility=%, NULL=%, Invalid=0.',
    v_post_total_count, v_post_design_count, v_post_utility_count, v_post_null_count;
END $$;


-- ------------------------------------------------------------------------------
-- STEP 5: Set NOT NULL on patent_type (NO DEFAULT per Rule 3/7)
-- Every new submission must explicitly provide 'Utility Patent' or 'Design Patent'
-- ------------------------------------------------------------------------------
ALTER TABLE public.phase1_submissions
  ALTER COLUMN patent_type SET NOT NULL;


-- ------------------------------------------------------------------------------
-- STEP 6: Update document_type check constraint to permit Design document types
-- ------------------------------------------------------------------------------
ALTER TABLE public.phase1_submissions
  DROP CONSTRAINT IF EXISTS chk_submission_document_type;

ALTER TABLE public.phase1_submissions
  ADD CONSTRAINT chk_submission_document_type
  CHECK (document_type IN (
    'FIGURE_OF_ABSTRACT',
    'FORM_5',
    'FORM_2',
    'LIST_OF_DRAWINGS',
    'NOVELTY_FORM',
    'REPRESENTATION_SHEET'
  ));


-- ------------------------------------------------------------------------------
-- STEP 7: Update UNIQUE constraint from (team_id, document_type) to
-- (team_id, document_type, patent_type) to support dual-track protection
-- ------------------------------------------------------------------------------
ALTER TABLE public.phase1_submissions
  DROP CONSTRAINT IF EXISTS unique_team_document_submission;

ALTER TABLE public.phase1_submissions
  DROP CONSTRAINT IF EXISTS unique_team_document_patent_submission;

ALTER TABLE public.phase1_submissions
  ADD CONSTRAINT unique_team_document_patent_submission
  UNIQUE (team_id, document_type, patent_type);

COMMIT;
