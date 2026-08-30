-- IPL-2026 Supabase Additive Migration Script for Phase 1 Document Submissions
-- Run this script manually in your Supabase Dashboard -> SQL Editor

-- 1. Create public.phase1_templates table
CREATE TABLE IF NOT EXISTS public.phase1_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL CONSTRAINT chk_template_document_type CHECK (document_type IN ('FORM_2', 'FORM_5', 'FIGURE_OF_ABSTRACT', 'LIST_OF_DRAWINGS')),
  template_name TEXT NOT NULL,
  filename TEXT NOT NULL,
  google_drive_file_id TEXT NOT NULL,
  google_drive_folder_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  uploaded_by TEXT NOT NULL, -- Admin email
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replaced_at TIMESTAMPTZ
);

-- Index for fast lookup of active templates
CREATE INDEX IF NOT EXISTS idx_phase1_templates_active 
ON public.phase1_templates(document_type) 
WHERE is_active = true;

-- 2. Create public.phase1_submissions table
CREATE TABLE IF NOT EXISTS public.phase1_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  registration_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  document_type TEXT NOT NULL CONSTRAINT chk_submission_document_type CHECK (document_type IN ('FORM_2', 'FORM_5', 'FIGURE_OF_ABSTRACT', 'LIST_OF_DRAWINGS')),
  original_filename TEXT NOT NULL,
  google_drive_file_id TEXT NOT NULL,
  google_drive_folder_id TEXT NOT NULL,
  uploaded_by TEXT NOT NULL, -- Student email
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_status TEXT NOT NULL DEFAULT 'UPLOADED' CONSTRAINT chk_submission_review_status CHECK (review_status IN ('UPLOADED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
  rejection_reason TEXT,
  reviewed_by TEXT, -- Admin email
  reviewed_at TIMESTAMPTZ,
  template_version_used INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_team_document_submission UNIQUE (team_id, document_type)
);

-- 3. Enable Row Level Security (RLS) on both tables
ALTER TABLE public.phase1_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phase1_submissions ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for public.phase1_templates
DROP POLICY IF EXISTS "Allow all authenticated users to select active templates" ON public.phase1_templates;
CREATE POLICY "Allow all authenticated users to select active templates"
ON public.phase1_templates FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow admins to manage templates" ON public.phase1_templates;
CREATE POLICY "Allow admins to manage templates"
ON public.phase1_templates FOR ALL
USING (public.get_current_user_role() = 'admin')
WITH CHECK (public.get_current_user_role() = 'admin');

-- 5. RLS Policies for public.phase1_submissions
DROP POLICY IF EXISTS "Allow students to view their own team's submissions" ON public.phase1_submissions;
CREATE POLICY "Allow students to view their own team's submissions"
ON public.phase1_submissions FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id 
    FROM public.profiles 
    WHERE registration_id = phase1_submissions.registration_id
  )
);

DROP POLICY IF EXISTS "Allow admins to view all submissions" ON public.phase1_submissions;
CREATE POLICY "Allow admins to view all submissions"
ON public.phase1_submissions FOR SELECT
USING (public.get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "Allow admins to manage submissions" ON public.phase1_submissions;
CREATE POLICY "Allow admins to manage submissions"
ON public.phase1_submissions FOR ALL
USING (public.get_current_user_role() = 'admin')
WITH CHECK (public.get_current_user_role() = 'admin');
