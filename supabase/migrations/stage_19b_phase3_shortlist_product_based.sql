-- ==============================================================================
-- STAGE 19B: Product-Based Phase 3 Shortlist Schema Migration & RPC Upgrade
-- IPL-2026 Platform
-- DO NOT EXECUTE AUTOMATICALLY. Manual deployment script for Supabase SQL Editor.
-- ==============================================================================
-- Purpose:
-- Allows a single team to have multiple shortlisted products (e.g. Hardware and
-- Software entries simultaneously). Transitions the authoritative uniqueness key
-- from registration_id to product_id, while preserving registration_id as metadata.
--
-- Safety Guarantees:
-- - Zero cascade or deletion of historical votes, product_votes, idea_likes,
--   teams, products, registrations, QR tokens, or analytics.
-- - Fully backward-compatible with existing Phase 3 voting and leaderboard queries.
-- ==============================================================================

BEGIN;

-- 1. Create table if it does not already exist
CREATE TABLE IF NOT EXISTS public.phase3_shortlist (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  registration_id TEXT NOT NULL,
  category TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Adjust Primary Key to product_id if previously set to registration_id
DO $$
DECLARE
  v_pk_col TEXT;
BEGIN
  -- Determine current primary key column of phase3_shortlist
  SELECT kcu.column_name INTO v_pk_col
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'phase3_shortlist'
    AND tc.constraint_type = 'PRIMARY KEY'
  LIMIT 1;

  -- If PK is currently on registration_id (or anything other than product_id), migrate constraint
  IF v_pk_col IS NOT NULL AND v_pk_col <> 'product_id' THEN
    -- Drop old PK
    EXECUTE 'ALTER TABLE public.phase3_shortlist DROP CONSTRAINT ' || 
      quote_ident((
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_schema = 'public' 
          AND table_name = 'phase3_shortlist' 
          AND constraint_type = 'PRIMARY KEY' 
        LIMIT 1
      ));
    
    -- Ensure product_id has no duplicates before adding PK
    -- In rare case of duplicates on product_id, keep the newest row
    DELETE FROM public.phase3_shortlist a
    USING public.phase3_shortlist b
    WHERE a.product_id = b.product_id
      AND a.created_at < b.created_at;

    -- Add product_id as Primary Key
    ALTER TABLE public.phase3_shortlist ADD CONSTRAINT phase3_shortlist_pkey PRIMARY KEY (product_id);
  ELSIF v_pk_col IS NULL THEN
    -- No PK exists yet, add product_id as PK
    ALTER TABLE public.phase3_shortlist ADD CONSTRAINT phase3_shortlist_pkey PRIMARY KEY (product_id);
  END IF;

  -- Ensure registration_id is NOT NULL
  ALTER TABLE public.phase3_shortlist ALTER COLUMN registration_id SET NOT NULL;
END;
$$;

-- 3. Indexes for fast join and lookup performance
DROP INDEX IF EXISTS public.idx_phase3_shortlist_product_id; -- Redundant when product_id is PK
CREATE INDEX IF NOT EXISTS idx_phase3_shortlist_team_id ON public.phase3_shortlist(team_id);
CREATE INDEX IF NOT EXISTS idx_phase3_shortlist_registration_id ON public.phase3_shortlist(registration_id);

-- 4. Automatic updated_at trigger
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

-- 5. Row Level Security (RLS)
ALTER TABLE public.phase3_shortlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to phase3_shortlist" ON public.phase3_shortlist;
CREATE POLICY "Allow public read access to phase3_shortlist" 
ON public.phase3_shortlist 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Allow service role full access to phase3_shortlist" ON public.phase3_shortlist;
CREATE POLICY "Allow service role full access to phase3_shortlist" 
ON public.phase3_shortlist 
FOR ALL 
USING (
  auth.jwt() ->> 'role' = 'service_role' 
  OR auth.role() = 'service_role'
  OR (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
);

-- 6. Product-Based Shortlist Synchronization RPC
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
