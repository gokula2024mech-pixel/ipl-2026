-- ==============================================================================
-- STAGE 17 MIGRATION: ADMIN WEBSITE VISITOR ANALYTICS & AUTHENTICATED VISITS
-- IPL-2026 Platform
-- DO NOT DEPLOY AUTOMATICALLY. Manual deployment script for SQL Editor.
-- ==============================================================================

BEGIN;

-- 1. Modify public.site_visits: Add nullable user_id to track authenticated visitors
-- Anonymous visits preserve user_id = NULL
ALTER TABLE public.site_visits 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Indexes for fast aggregation and admin visitor queries
CREATE INDEX IF NOT EXISTS idx_site_visits_user_id ON public.site_visits (user_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_user_time ON public.site_visits (user_id, visited_at DESC);

-- 3. Update record_site_visit RPC to accept optional p_user_id
DROP FUNCTION IF EXISTS public.record_site_visit(TEXT);
DROP FUNCTION IF EXISTS public.record_site_visit(TEXT, UUID);

CREATE OR REPLACE FUNCTION public.record_site_visit(
  p_session_hash TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_effective_user_id UUID;
BEGIN
  IF p_session_hash IS NULL OR TRIM(p_session_hash) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_SESSION');
  END IF;

  -- DEFENSE-IN-DEPTH:
  -- 1. If called by trusted service_role (backend server), trust server-verified p_user_id.
  -- 2. If called by authenticated client, strictly force auth.uid() (never allow forging arbitrary UUIDs).
  -- 3. If called anonymously, user_id MUST be NULL.
  IF auth.role() = 'service_role' THEN
    v_effective_user_id := p_user_id;
  ELSIF auth.role() = 'authenticated' THEN
    v_effective_user_id := auth.uid();
  ELSE
    v_effective_user_id := NULL;
  END IF;

  INSERT INTO public.site_visits (
    session_hash,
    user_id,
    visited_at
  ) VALUES (
    TRIM(p_session_hash),
    v_effective_user_id,
    NOW()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Restrict execute permissions:
-- Revoke from public, anon, and authenticated so clients CANNOT call it directly.
-- ONLY trusted service_role (backend server) may invoke this procedure.
REVOKE EXECUTE ON FUNCTION public.record_site_visit(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_site_visit(TEXT, UUID) TO service_role;

COMMIT;
