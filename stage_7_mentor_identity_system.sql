-- Stage 7: Mentor Identity System and Alias Mapping Migration
-- Run this script in your Supabase Dashboard -> SQL Editor to initialize the system.

-- 1. Create public.mentors table
CREATE TABLE IF NOT EXISTS public.mentors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  department TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create public.mentor_aliases table
CREATE TABLE IF NOT EXISTS public.mentor_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL REFERENCES public.mentors(id) ON DELETE CASCADE,
  alias TEXT NOT NULL UNIQUE,
  normalized_alias TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Add mentor_id column to public.registrations table (Additive change)
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS mentor_id UUID REFERENCES public.mentors(id);

-- 4. Enable RLS on mentors and mentor_aliases
ALTER TABLE public.mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_aliases ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Select policies for public read access (evaluators, mentors, and students need to read)
CREATE POLICY "Allow public select on mentors" ON public.mentors FOR SELECT USING (true);
CREATE POLICY "Allow public select on mentor_aliases" ON public.mentor_aliases FOR SELECT USING (true);

-- 6. Create RLS Insert/Update policies for service role and admin write access
CREATE POLICY "Allow admin all access on mentors" ON public.mentors FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'
  )
);

CREATE POLICY "Allow admin all access on mentor_aliases" ON public.mentor_aliases FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'
  )
);
