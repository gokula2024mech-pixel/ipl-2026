-- ==============================================================================
-- STAGE 15 MIGRATION: PUBLIC ENGAGEMENT & VISIT ANALYTICS FOUNDATION
-- ==============================================================================
-- Purpose:
--   Provide aggregate-focused, privacy-conscious event analytics for the overall
--   public website and individual idea pages.
--
-- Privacy & Safety Guarantees:
--   - ZERO user_id or user_agent stored in site_visits.
--   - ZERO ip_hash stored in site_visits (IPs used in-memory for rate limiting only).
--   - Server stores SHA-256 hashed session identifiers for approximate unique sessions.
--   - Raw tokens, IP addresses, and PII are NEVER exposed in public or admin payloads.
--   - Analytics NEVER affects voting score: Score = Likes + (Votes * 2).
--   - Does NOT delete or modify existing tables or rows.
--   - Does NOT break or overload the existing record_idea_visit signature.
-- ==============================================================================

-- 1. TABLE: public.site_visits (OVERALL WEBSITE VISIT ANALYTICS)
CREATE TABLE IF NOT EXISTS public.site_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_hash TEXT NOT NULL,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.site_visits IS 'Aggregate ledger for public website/homepage visits. Visits do not affect scoring.';

-- Indexes for fast aggregate querying and trend calculation
CREATE INDEX IF NOT EXISTS idx_site_visits_session_hash ON public.site_visits (session_hash);
CREATE INDEX IF NOT EXISTS idx_site_visits_visited_at ON public.site_visits (visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_visits_session_time ON public.site_visits (session_hash, visited_at DESC);

-- 2. ROW LEVEL SECURITY ON public.site_visits
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view site_visits" ON public.site_visits;
CREATE POLICY "Admins can view site_visits"
ON public.site_visits FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- 3. FUNCTION: record_site_visit (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.record_site_visit(
  p_session_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_session_hash IS NULL OR TRIM(p_session_hash) = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_SESSION');
  END IF;

  INSERT INTO public.site_visits (
    session_hash,
    visited_at
  ) VALUES (
    TRIM(p_session_hash),
    NOW()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_site_visit(TEXT) TO authenticated, anon, service_role;

-- 4. ENSURE FAST QUERYING ON public.idea_visits
CREATE INDEX IF NOT EXISTS idx_idea_visits_visitor_token ON public.idea_visits (visitor_token);
