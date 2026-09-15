-- ==============================================================================
-- STAGE 10T: Independent Phase 3 LinkedIn Submission On/Off Control Migration
-- IPL-2026 Platform
-- ==============================================================================
--
-- PURPOSE:
-- Creates the generic public.app_settings table (if not already existing) to store
-- independent application settings, and seeds the Phase 3 LinkedIn submission
-- toggle key ('phase3_linkedin_submissions') with default {"active": false}.
--
-- IMPORTANT SAFETY:
-- - Default state is OFF ({"active": false})
-- - Independent from voting_controls.is_voting_active
-- - Independent from Phase 3 countdown timers / phase status
-- - Independent from Phase 3 shortlist status
-- - ON CONFLICT (key) DO NOTHING prevents overwriting existing configuration
-- - Safe for repeated execution
--
-- EXECUTION INSTRUCTIONS:
-- Execute manually in Supabase SQL Editor.
-- DO NOT EXECUTE AUTOMATICALLY.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by TEXT
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Allow public and authenticated read access
DROP POLICY IF EXISTS "Allow public read of app settings" ON public.app_settings;
CREATE POLICY "Allow public read of app settings"
ON public.app_settings FOR SELECT
USING (true);

-- Allow admins full management access (insert, update, delete)
DROP POLICY IF EXISTS "Allow admins to manage app settings" ON public.app_settings;
CREATE POLICY "Allow admins to manage app settings"
ON public.app_settings FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
  )
);

-- Seed default Phase 3 LinkedIn submission control (Default: OFF / false)
INSERT INTO public.app_settings (key, value)
VALUES ('phase3_linkedin_submissions', '{"active": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
