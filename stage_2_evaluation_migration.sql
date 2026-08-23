-- IPL-2026 Supabase Additive Migration Script for Stage 2 Evaluation Foundation
-- Run this script manually in your Supabase Dashboard -> SQL Editor

-- 1. Helper function to safely get the current user's role from profiles
-- Explicitly configured as SECURITY DEFINER with a safe search_path set to public.
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  RETURN COALESCE(v_role, 'student');
END;
$$;

-- 2. Create public.phases table
CREATE TABLE IF NOT EXISTS public.phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  duration TEXT,
  max_score INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Insert the three official phases if they do not exist
INSERT INTO public.phases (phase_number, name, duration, description, max_score, is_active)
VALUES
  (1, 'Ideation & Concept Design', 'Week 1', 'Identify a genuine real-world problem and turn it into a well-defined, feasible, cost-justified concept.', 100, false),
  (2, 'Prototype Development & Testing', 'Weeks 2-3', 'Design, build, and rigorously test a working prototype that proves the concept functions as intended.', 100, false),
  (3, 'Product Showcase & Commercialization', 'Week 4', 'Present the finished product to an expert panel as a market-aware, business-ready innovation.', 100, false)
ON CONFLICT (phase_number) DO UPDATE
SET name = EXCLUDED.name,
    duration = EXCLUDED.duration,
    description = EXCLUDED.description,
    max_score = EXCLUDED.max_score,
    updated_at = NOW();

-- 4. Create public.evaluator_assignments table
CREATE TABLE IF NOT EXISTS public.evaluator_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES public.phases(id) ON DELETE CASCADE,
  evaluator_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_phase_evaluator UNIQUE (phase_id, evaluator_user_id)
);

-- 5. Create public.evaluations table
-- Referenced to public.registrations(registration_id) since registration_id
-- is verified unique in the registrations table schema.
CREATE TABLE IF NOT EXISTS public.evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES public.phases(id) ON DELETE CASCADE,
  registration_id TEXT NOT NULL REFERENCES public.registrations(registration_id) ON DELETE CASCADE,
  evaluator_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL CONSTRAINT chk_score CHECK (score >= 0.00 AND score <= 100.00),
  comments TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_phase_registration_evaluator UNIQUE (phase_id, registration_id, evaluator_user_id)
);

-- 6. Enable Row Level Security (RLS) on new tables
ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluator_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for public.phases
DROP POLICY IF EXISTS "Allow all authenticated users to select phases" ON public.phases;
CREATE POLICY "Allow all authenticated users to select phases"
ON public.phases FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow admins to manage phases" ON public.phases;
CREATE POLICY "Allow admins to manage phases"
ON public.phases FOR ALL
USING (public.get_current_user_role() = 'admin')
WITH CHECK (public.get_current_user_role() = 'admin');

-- 8. RLS Policies for public.evaluator_assignments
DROP POLICY IF EXISTS "Allow admins to manage evaluator assignments" ON public.evaluator_assignments;
CREATE POLICY "Allow admins to manage evaluator assignments"
ON public.evaluator_assignments FOR ALL
USING (public.get_current_user_role() = 'admin')
WITH CHECK (public.get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "Allow evaluators to select their own assignments" ON public.evaluator_assignments;
CREATE POLICY "Allow evaluators to select their own assignments"
ON public.evaluator_assignments FOR SELECT
USING (public.get_current_user_role() = 'admin' OR auth.uid() = evaluator_user_id);

-- 9. RLS Policies for public.evaluations
DROP POLICY IF EXISTS "Allow admins and owners to select evaluations" ON public.evaluations;
CREATE POLICY "Allow admins and owners to select evaluations"
ON public.evaluations FOR SELECT
USING (public.get_current_user_role() = 'admin' OR auth.uid() = evaluator_user_id);

DROP POLICY IF EXISTS "Allow admins and assigned evaluators to insert evaluations" ON public.evaluations;
CREATE POLICY "Allow admins and assigned evaluators to insert evaluations"
ON public.evaluations FOR INSERT
WITH CHECK (
  public.get_current_user_role() = 'admin' OR 
  (auth.uid() = evaluator_user_id AND EXISTS (
    SELECT 1 FROM public.evaluator_assignments 
    WHERE phase_id = evaluations.phase_id AND evaluator_user_id = auth.uid()
  ))
);

DROP POLICY IF EXISTS "Allow admins and owners to update evaluations" ON public.evaluations;
CREATE POLICY "Allow admins and owners to update evaluations"
ON public.evaluations FOR UPDATE
USING (public.get_current_user_role() = 'admin' OR auth.uid() = evaluator_user_id)
WITH CHECK (
  public.get_current_user_role() = 'admin' OR 
  (auth.uid() = evaluator_user_id AND EXISTS (
    SELECT 1 FROM public.evaluator_assignments 
    WHERE phase_id = evaluations.phase_id AND evaluator_user_id = auth.uid()
  ))
);

DROP POLICY IF EXISTS "Allow admins to delete evaluations" ON public.evaluations;
CREATE POLICY "Allow admins to delete evaluations"
ON public.evaluations FOR DELETE
USING (public.get_current_user_role() = 'admin');
