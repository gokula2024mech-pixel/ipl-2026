-- ==============================================================================
-- STAGE 21: Phase 3 LinkedIn Post Submissions Schema
-- IPL-2026 Platform
-- DO NOT EXECUTE AUTOMATICALLY. Manual deployment script for Supabase SQL Editor.
-- ==============================================================================
-- Purpose:
-- Authoritative storage for Phase 3 LinkedIn post submission URLs.
-- Each shortlisted team requires exactly three LinkedIn post URL submissions:
-- 1. Team Leader (role: 'leader')
-- 2. Member 1 (role: 'member1')
-- 3. Member 2 (role: 'member2')
--
-- Safety Guarantees:
-- - Zero deletion or mutation of existing tables, registrations, teams, products,
--   votes, product_votes, idea_likes, QR records, or analytics.
-- - Strictly stores validated URLs (no OAuth tokens, credentials, or passwords).
-- ==============================================================================

BEGIN;

-- 1. Create public.phase3_linkedin_submissions table
CREATE TABLE IF NOT EXISTS public.phase3_linkedin_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  product_id UUID NULL REFERENCES public.products(id) ON DELETE CASCADE,
  registration_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('leader', 'member1', 'member2')),
  member_name TEXT NULL,
  member_email TEXT NULL,
  linkedin_post_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_phase3_linkedin_team_role UNIQUE (team_id, role)
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_phase3_linkedin_team_id 
ON public.phase3_linkedin_submissions(team_id);

CREATE INDEX IF NOT EXISTS idx_phase3_linkedin_registration_id 
ON public.phase3_linkedin_submissions(registration_id);

-- 3. Automatic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_phase3_linkedin_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_phase3_linkedin_updated_at ON public.phase3_linkedin_submissions;
CREATE TRIGGER trg_phase3_linkedin_updated_at
BEFORE UPDATE ON public.phase3_linkedin_submissions
FOR EACH ROW
EXECUTE FUNCTION public.set_phase3_linkedin_updated_at();

-- 4. Row Level Security (RLS)
ALTER TABLE public.phase3_linkedin_submissions ENABLE ROW LEVEL SECURITY;

-- Drop any existing or legacy policies for clean, idempotent execution
DROP POLICY IF EXISTS "Allow team members to view their linkedin submissions" ON public.phase3_linkedin_submissions;
DROP POLICY IF EXISTS "Allow service role full access to phase3_linkedin_submissions" ON public.phase3_linkedin_submissions;
DROP POLICY IF EXISTS "Allow admin full access to phase3_linkedin_submissions" ON public.phase3_linkedin_submissions;
DROP POLICY IF EXISTS "Allow admin read access to phase3_linkedin_submissions" ON public.phase3_linkedin_submissions;

-- Policy 1: Service role has full access for authoritative backend API operations
-- (All participant reads & writes go exclusively through backend/routes/phase3Routes.js)
CREATE POLICY "Allow service role full access to phase3_linkedin_submissions"
ON public.phase3_linkedin_submissions
FOR ALL
USING (
  auth.jwt() ->> 'role' = 'service_role'
  OR auth.role() = 'service_role'
)
WITH CHECK (
  auth.jwt() ->> 'role' = 'service_role'
  OR auth.role() = 'service_role'
);

-- Policy 2: Administrator full access (Supabase Studio / authenticated admin users)
CREATE POLICY "Allow admin full access to phase3_linkedin_submissions"
ON public.phase3_linkedin_submissions
FOR ALL
USING (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
)
WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
);

-- Note on Participant & Anonymous Access:
-- With RLS enabled and no policies granted to 'anon' or general 'authenticated' users,
-- all direct client PostgREST table access is completely denied by default.
-- Participants submit and view their submissions exclusively through the backend API
-- (/api/phase3/status and /api/phase3/linkedin-submission) which executes with service_role
-- after enforcing team membership, slot permissions, and URL validation.

COMMIT;
