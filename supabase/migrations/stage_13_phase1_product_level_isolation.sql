-- ==============================================================================
-- MIGRATION: Stage 13 — Phase 1 Product-Level Document Isolation
-- FILE: stage_13_phase1_product_level_isolation.sql
-- 
-- STATUS: GENERATED & VALIDATED (NOT APPLIED TO PRODUCTION)
-- 
-- SEQUENCE REQUIREMENT:
-- Apply Stage 12 FIRST, then apply Stage 13.
-- 
-- PURPOSE:
-- 1. Safely add product_id column referencing public.products(id) ON DELETE RESTRICT (nullable).
-- 2. Create index on (product_id, document_type) and (team_id, product_id).
-- 3. Deterministically backfill product_id for single-product teams (where COUNT(products) = 1).
-- 4. Preserve multi-product teams (e.g. ChameleX) with product_id = NULL (NO GUESSING).
-- 5. Safely update unique constraint to isolate documents by product:
--    UNIQUE (team_id, product_id, document_type, patent_type)
-- ==============================================================================

BEGIN;

-- STEP 1: Add product_id as NULLABLE with Foreign Key to public.products (ON DELETE RESTRICT)
ALTER TABLE public.phase1_submissions
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT;

-- STEP 2: Indexes for Fast Product-Level Lookup
CREATE INDEX IF NOT EXISTS idx_phase1_submissions_product_doc
  ON public.phase1_submissions(product_id, document_type);

CREATE INDEX IF NOT EXISTS idx_phase1_submissions_team_product
  ON public.phase1_submissions(team_id, product_id);

-- STEP 3: Deterministic Backfill for Single-Product Teams ONLY
UPDATE public.phase1_submissions s
SET product_id = p.id
FROM public.products p
WHERE s.team_id = p.team_id
  AND p.team_id IN (
    SELECT team_id 
    FROM public.products 
    GROUP BY team_id 
    HAVING COUNT(*) = 1
  );

-- STEP 4: Safety Assertion on Multi-Product Teams
DO $$
DECLARE
  multi_assigned_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO multi_assigned_count
  FROM public.phase1_submissions s
  WHERE s.product_id IS NOT NULL
    AND s.team_id IN (
      SELECT team_id 
      FROM public.products 
      GROUP BY team_id 
      HAVING COUNT(*) > 1
    );

  IF multi_assigned_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: Found % multi-product rows assigned without explicit confirmation!', multi_assigned_count;
  END IF;
END $$;

-- STEP 5: Update Unique Constraints
ALTER TABLE public.phase1_submissions
  DROP CONSTRAINT IF EXISTS unique_team_document_submission;

ALTER TABLE public.phase1_submissions
  DROP CONSTRAINT IF EXISTS unique_team_document_patent_submission;

ALTER TABLE public.phase1_submissions
  DROP CONSTRAINT IF EXISTS unique_team_product_document_submission;

ALTER TABLE public.phase1_submissions
  ADD CONSTRAINT unique_team_product_document_submission
  UNIQUE (team_id, product_id, document_type, patent_type);

COMMIT;
