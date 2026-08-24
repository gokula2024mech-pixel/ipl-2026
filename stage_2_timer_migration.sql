-- IPL-2026 Supabase Additive Migration Script for Stage 1 Phase & Registration Timer System
-- Run this script manually in your Supabase Dashboard -> SQL Editor

-- 1. Extend public.phases with timer fields safely and idempotently
ALTER TABLE public.phases ADD COLUMN IF NOT EXISTS timer_status TEXT NOT NULL DEFAULT 'upcoming';
ALTER TABLE public.phases DROP CONSTRAINT IF EXISTS chk_timer_status;
ALTER TABLE public.phases ADD CONSTRAINT chk_timer_status CHECK (timer_status IN ('upcoming', 'running', 'paused', 'completed', 'closed'));

ALTER TABLE public.phases ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ NULL;
ALTER TABLE public.phases ADD COLUMN IF NOT EXISTS scheduled_end_at TIMESTAMPTZ NULL;
ALTER TABLE public.phases ADD COLUMN IF NOT EXISTS is_timer_running BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.phases ADD COLUMN IF NOT EXISTS is_timer_paused BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.phases ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ NULL;
ALTER TABLE public.phases ADD COLUMN IF NOT EXISTS remaining_seconds BIGINT NULL;
ALTER TABLE public.phases ADD COLUMN IF NOT EXISTS last_started_at TIMESTAMPTZ NULL;
ALTER TABLE public.phases ADD COLUMN IF NOT EXISTS extended_at TIMESTAMPTZ NULL;

-- 2. Create public.phase_timer_history table to track transitions
CREATE TABLE IF NOT EXISTS public.phase_timer_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES public.phases(id) ON DELETE CASCADE,
  action TEXT NOT NULL CONSTRAINT chk_phase_timer_action CHECK (action IN ('START', 'PAUSE', 'RESUME', 'STOP', 'EXTEND')),
  old_start_at TIMESTAMPTZ NULL,
  old_end_at TIMESTAMPTZ NULL,
  new_start_at TIMESTAMPTZ NULL,
  new_end_at TIMESTAMPTZ NULL,
  duration_added_seconds BIGINT NULL,
  performed_by UUID NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create public.registration_timer table (enforcing a singleton row)
CREATE TABLE IF NOT EXISTS public.registration_timer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  single_row_lock BOOLEAN NOT NULL DEFAULT true,
  timer_status TEXT NOT NULL DEFAULT 'upcoming' CONSTRAINT chk_registration_timer_status CHECK (timer_status IN ('upcoming', 'running', 'paused', 'completed', 'closed')),
  scheduled_start_at TIMESTAMPTZ NULL,
  scheduled_end_at TIMESTAMPTZ NULL,
  is_timer_running BOOLEAN NOT NULL DEFAULT false,
  is_timer_paused BOOLEAN NOT NULL DEFAULT false,
  paused_at TIMESTAMPTZ NULL,
  remaining_seconds BIGINT NULL,
  last_started_at TIMESTAMPTZ NULL,
  extended_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_registration_timer_single_row CHECK (single_row_lock = true),
  CONSTRAINT uq_registration_timer_single_row UNIQUE (single_row_lock)
);

-- Seed singleton registration timer record if missing
INSERT INTO public.registration_timer (single_row_lock, timer_status)
VALUES (true, 'upcoming')
ON CONFLICT (single_row_lock) DO NOTHING;

-- 4. Create public.registration_timer_history table to track registration timer transitions
CREATE TABLE IF NOT EXISTS public.registration_timer_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_timer_id UUID NOT NULL REFERENCES public.registration_timer(id) ON DELETE CASCADE,
  action TEXT NOT NULL CONSTRAINT chk_registration_timer_action CHECK (action IN ('START', 'PAUSE', 'RESUME', 'STOP', 'EXTEND')),
  old_start_at TIMESTAMPTZ NULL,
  old_end_at TIMESTAMPTZ NULL,
  new_start_at TIMESTAMPTZ NULL,
  new_end_at TIMESTAMPTZ NULL,
  duration_added_seconds BIGINT NULL,
  performed_by UUID NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.phase_timer_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_timer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_timer_history ENABLE ROW LEVEL SECURITY;

-- 6. Row Level Security Policies

-- RLS Policies for public.phase_timer_history
DROP POLICY IF EXISTS "Allow all authenticated users to select phase timer history" ON public.phase_timer_history;
CREATE POLICY "Allow all authenticated users to select phase timer history"
ON public.phase_timer_history FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow admins to manage phase timer history" ON public.phase_timer_history;
CREATE POLICY "Allow admins to manage phase timer history"
ON public.phase_timer_history FOR ALL
USING (public.get_current_user_role() = 'admin')
WITH CHECK (public.get_current_user_role() = 'admin');

-- RLS Policies for public.registration_timer
DROP POLICY IF EXISTS "Allow all authenticated users to select registration timer" ON public.registration_timer;
CREATE POLICY "Allow all authenticated users to select registration timer"
ON public.registration_timer FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow admins to manage registration timer" ON public.registration_timer;
CREATE POLICY "Allow admins to manage registration timer"
ON public.registration_timer FOR ALL
USING (public.get_current_user_role() = 'admin')
WITH CHECK (public.get_current_user_role() = 'admin');

-- RLS Policies for public.registration_timer_history
DROP POLICY IF EXISTS "Allow all authenticated users to select registration timer history" ON public.registration_timer_history;
CREATE POLICY "Allow all authenticated users to select registration timer history"
ON public.registration_timer_history FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow admins to manage registration timer history" ON public.registration_timer_history;
CREATE POLICY "Allow admins to manage registration timer history"
ON public.registration_timer_history FOR ALL
USING (public.get_current_user_role() = 'admin')
WITH CHECK (public.get_current_user_role() = 'admin');
