-- IPL-2026 Supabase Additive Migration Script for public.profiles name confirmation and locking
-- Run this script manually in your Supabase Dashboard -> SQL Editor

-- 1. Add name_confirmed column if it does not already exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS name_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Create trigger function to enforce the name change lock at the database level
CREATE OR REPLACE FUNCTION public.check_profile_name_lock()
RETURNS TRIGGER AS $$
BEGIN
  -- If name was already confirmed, do not allow changing name or name_confirmed
  IF OLD.name_confirmed = TRUE THEN
    IF NEW.name IS DISTINCT FROM OLD.name OR NEW.name_confirmed IS DISTINCT FROM OLD.name_confirmed THEN
      RAISE EXCEPTION 'Name change is locked after confirmation.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Bind the trigger to public.profiles BEFORE UPDATE
DROP TRIGGER IF EXISTS tr_on_profile_before_update_lock ON public.profiles;
CREATE TRIGGER tr_on_profile_before_update_lock
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_profile_name_lock();

-- 4. Recreate RLS Update Policy for profiles (Users can update their own profile name and confirmation status)
DROP POLICY IF EXISTS "Users can update their own profile name" ON public.profiles;

CREATE POLICY "Users can update their own profile name"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id AND
  role = (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid()) AND
  email = (SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid())
);
