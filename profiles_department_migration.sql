-- ====================================================================
-- IPL 2026 Supabase Additive Migration Script: profiles.department
-- Run this script in your Supabase Dashboard -> SQL Editor
-- ====================================================================

-- 1. Add department column to public.profiles if it does not already exist
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS department TEXT;

COMMENT ON COLUMN public.profiles.department IS 'Authoritative one-time department selection for IPL 2026 Community Voting.';

-- 2. Migrate existing departments saved in auth.users raw_user_meta_data
UPDATE public.profiles p
SET department = (u.raw_user_meta_data->>'department')::TEXT,
    updated_at = NOW()
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.department IS NULL OR p.department = '')
  AND u.raw_user_meta_data->>'department' IS NOT NULL
  AND u.raw_user_meta_data->>'department' <> '';

-- 3. Verification query: display all profiles with departments populated
SELECT user_id, email, name, department, updated_at
FROM public.profiles
WHERE department IS NOT NULL;
