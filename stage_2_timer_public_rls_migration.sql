-- IPL-2026 Supabase Additive Migration Script for public SELECT and MODIFY actions
-- Run this script manually in your Supabase Dashboard -> SQL Editor

-- 1. Update SELECT policies for public/anonymous read access
DROP POLICY IF EXISTS "Allow all authenticated users to select phases" ON public.phases;
DROP POLICY IF EXISTS "Allow public select on phases" ON public.phases;
CREATE POLICY "Allow public select on phases"
ON public.phases FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Allow all authenticated users to select registration timer" ON public.registration_timer;
DROP POLICY IF EXISTS "Allow public select on registration timer" ON public.registration_timer;
CREATE POLICY "Allow public select on registration timer"
ON public.registration_timer FOR SELECT
USING (true);

-- 2. Update transitions history CHECK constraints to include the 'MODIFY' action
ALTER TABLE public.phase_timer_history DROP CONSTRAINT IF EXISTS chk_phase_timer_action;
ALTER TABLE public.phase_timer_history ADD CONSTRAINT chk_phase_timer_action CHECK (action IN ('START', 'PAUSE', 'RESUME', 'STOP', 'EXTEND', 'MODIFY'));

ALTER TABLE public.registration_timer_history DROP CONSTRAINT IF EXISTS chk_registration_timer_action;
ALTER TABLE public.registration_timer_history ADD CONSTRAINT chk_registration_timer_action CHECK (action IN ('START', 'PAUSE', 'RESUME', 'STOP', 'EXTEND', 'MODIFY'));
