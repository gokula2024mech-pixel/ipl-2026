-- ==============================================================================
-- STAGE 8: Leaderboard Configuration Migration (App Settings Table)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Allow public / authenticated read access
DROP POLICY IF EXISTS "Allow public read of app settings" ON public.app_settings;
CREATE POLICY "Allow public read of app settings"
ON public.app_settings FOR SELECT
USING (true);

-- Allow admins full management access
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

-- Seed default leaderboard_type to TRL_BASED
INSERT INTO public.app_settings (key, value)
VALUES ('leaderboard_type', '{"type": "TRL_BASED"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
