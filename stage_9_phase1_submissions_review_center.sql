-- ==============================================================================
-- STAGE 9: Admin Submissions Review Center Migration
-- Adds team-level decision state, admin comment, and decision_seen flag
-- Run this script in your Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Add admin comment and notification seen columns to phase1_submissions
ALTER TABLE public.phase1_submissions
  ADD COLUMN IF NOT EXISTS admin_comment TEXT,
  ADD COLUMN IF NOT EXISTS decision_seen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS patent_type TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT;

-- 2. Relax or update review_status constraint to support PENDING, APPROVED, REJECTED
ALTER TABLE public.phase1_submissions
  DROP CONSTRAINT IF EXISTS chk_submission_review_status;

ALTER TABLE public.phase1_submissions
  ADD CONSTRAINT chk_submission_review_status
  CHECK (review_status IN ('UPLOADED', 'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'));

-- 3. Relax document_type constraint to allow any official Google Drive template (Utility and Design)
ALTER TABLE public.phase1_submissions
  DROP CONSTRAINT IF EXISTS chk_submission_document_type;

-- 4. Create an index for fast lookup of team submissions by registration_id and review_status
CREATE INDEX IF NOT EXISTS idx_phase1_submissions_reg_status
  ON public.phase1_submissions(registration_id, review_status);

-- 5. RLS policy to allow students to mark decision_seen on their team's submissions
DROP POLICY IF EXISTS "Allow students to update decision_seen on their submissions" ON public.phase1_submissions;
CREATE POLICY "Allow students to update decision_seen on their submissions"
ON public.phase1_submissions FOR UPDATE
USING (
  auth.uid() IN (
    SELECT user_id 
    FROM public.profiles 
    WHERE registration_id = phase1_submissions.registration_id
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT user_id 
    FROM public.profiles 
    WHERE registration_id = phase1_submissions.registration_id
  )
);
