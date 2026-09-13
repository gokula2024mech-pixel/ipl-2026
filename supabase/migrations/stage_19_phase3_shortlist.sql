-- ==============================================================================
-- STAGE 19: Phase 3 Shortlist Database Registry & Atomic Synchronization RPC
-- IPL-2026 Platform
-- DO NOT EXECUTE AUTOMATICALLY. Manual deployment script for Supabase SQL Editor.
-- ==============================================================================

BEGIN;

-- 1. Create public.phase3_shortlist table
-- Authoritative runtime registry of products eligible for Phase 3 leaderboard & voting.
-- Removing a row from this table alters ONLY Phase 3 eligibility and NEVER cascades
-- or deletes products, teams, registrations, votes, likes, QR codes, or analytics.
CREATE TABLE IF NOT EXISTS public.phase3_shortlist (
  product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE RESTRICT,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  registration_id TEXT NOT NULL,
  category TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_phase3_shortlist_team_id 
ON public.phase3_shortlist(team_id);

CREATE INDEX IF NOT EXISTS idx_phase3_shortlist_registration_id 
ON public.phase3_shortlist(registration_id);

-- 3. Automatic updated_at timestamp trigger
CREATE OR REPLACE FUNCTION public.set_phase3_shortlist_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_phase3_shortlist_updated_at ON public.phase3_shortlist;
CREATE TRIGGER trg_phase3_shortlist_updated_at
BEFORE UPDATE ON public.phase3_shortlist
FOR EACH ROW
EXECUTE FUNCTION public.set_phase3_shortlist_updated_at();

-- 4. Row Level Security (RLS)
ALTER TABLE public.phase3_shortlist ENABLE ROW LEVEL SECURITY;

-- Public read access: Shortlist membership is public and needed for Leaderboard & Idea page displays
DROP POLICY IF EXISTS "Allow public read access to phase3_shortlist" ON public.phase3_shortlist;
CREATE POLICY "Allow public read access to phase3_shortlist" 
ON public.phase3_shortlist 
FOR SELECT 
USING (true);

-- Privileged write access: Restrict inserts, updates, and deletes to service_role / administrators only
DROP POLICY IF EXISTS "Allow service role full access to phase3_shortlist" ON public.phase3_shortlist;
CREATE POLICY "Allow service role full access to phase3_shortlist" 
ON public.phase3_shortlist 
FOR ALL 
USING (
  auth.jwt() ->> 'role' = 'service_role' 
  OR auth.role() = 'service_role'
  OR (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
);

-- 5. Atomic Shortlist Synchronization RPC
-- Executes atomic INCREMENTAL or FULL_REPLACEMENT synchronization inside a single database transaction.
-- Product-based uniqueness: A team may have multiple products (e.g. HW + SW), each independently shortlisted.
-- If any row fails foreign key validation, the entire transaction is rolled back.
-- Removing rows under FULL_REPLACEMENT deletes ONLY from phase3_shortlist (vote/like history remains 100% intact).
CREATE OR REPLACE FUNCTION public.sync_phase3_shortlist(
  p_records JSONB,
  p_mode TEXT DEFAULT 'INCREMENTAL'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode TEXT;
  v_removed_count INTEGER := 0;
  v_upserted_count INTEGER := 0;
  v_total_shortlisted INTEGER := 0;
  v_product_ids UUID[];
BEGIN
  v_mode := UPPER(TRIM(COALESCE(p_mode, 'INCREMENTAL')));
  IF v_mode NOT IN ('INCREMENTAL', 'FULL_REPLACEMENT') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_SYNC_MODE',
      'message', 'Mode must be INCREMENTAL or FULL_REPLACEMENT'
    );
  END IF;

  IF p_records IS NULL OR jsonb_typeof(p_records) <> 'array' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_PAYLOAD',
      'message', 'Records payload must be a JSON array'
    );
  END IF;

  -- 1. Extract product IDs from incoming array
  SELECT array_agg((elem->>'product_id')::UUID)
  INTO v_product_ids
  FROM jsonb_array_elements(p_records) AS elem
  WHERE elem->>'product_id' IS NOT NULL;

  -- 2. FULL_REPLACEMENT: Delete existing shortlist records absent from the new official list
  -- Note: This ONLY removes Phase 3 shortlist eligibility. It NEVER deletes teams, products, registrations, votes, or likes!
  IF v_mode = 'FULL_REPLACEMENT' THEN
    IF v_product_ids IS NOT NULL AND array_length(v_product_ids, 1) > 0 THEN
      DELETE FROM public.phase3_shortlist
      WHERE product_id <> ALL(v_product_ids);
      GET DIAGNOSTICS v_removed_count = ROW_COUNT;
    ELSE
      -- If incoming list is empty in full replacement, all entries would be removed
      DELETE FROM public.phase3_shortlist;
      GET DIAGNOSTICS v_removed_count = ROW_COUNT;
    END IF;
  END IF;

  -- 3. Upsert incoming records atomically by product_id
  IF v_product_ids IS NOT NULL AND array_length(v_product_ids, 1) > 0 THEN
    INSERT INTO public.phase3_shortlist (
      product_id,
      team_id,
      registration_id,
      category,
      updated_at
    )
    SELECT
      (elem->>'product_id')::UUID,
      (elem->>'team_id')::UUID,
      elem->>'registration_id',
      elem->>'category',
      NOW()
    FROM jsonb_array_elements(p_records) AS elem
    ON CONFLICT (product_id) DO UPDATE
    SET
      team_id = EXCLUDED.team_id,
      registration_id = EXCLUDED.registration_id,
      category = EXCLUDED.category,
      updated_at = NOW();

    GET DIAGNOSTICS v_upserted_count = ROW_COUNT;
  END IF;

  -- 4. Count final total in shortlist
  SELECT COUNT(*) INTO v_total_shortlisted FROM public.phase3_shortlist;

  RETURN jsonb_build_object(
    'success', true,
    'mode', v_mode,
    'upserted_count', v_upserted_count,
    'removed_count', v_removed_count,
    'total_shortlisted', v_total_shortlisted,
    'message', format('Phase 3 shortlist %s completed successfully. %s records upserted, %s removed. Total: %s', 
                      v_mode, v_upserted_count, v_removed_count, v_total_shortlisted)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TRANSACTION_FAILED',
      'message', SQLERRM
    );
END;
$$;

COMMIT;
