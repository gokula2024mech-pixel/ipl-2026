-- IPL-2026 Supabase Additive Migration Script for public.profiles UPDATE policy
-- Run this script manually in your Supabase Dashboard -> SQL Editor

-- Drop the policy if it already exists to avoid conflict
DROP POLICY IF EXISTS "Users can update their own profile name" ON public.profiles;

-- Create RLS Update Policy for profiles (Users can only update their own name)
CREATE POLICY "Users can update their own profile name"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id AND
  role = (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid()) AND
  email = (SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid()) AND
  (
    (registration_id IS NULL AND (SELECT p.registration_id FROM public.profiles p WHERE p.user_id = auth.uid()) IS NULL) OR
    (registration_id = (SELECT p.registration_id FROM public.profiles p WHERE p.user_id = auth.uid()))
  )
);
