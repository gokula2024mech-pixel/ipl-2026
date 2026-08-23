-- IPL-2026 Supabase Additive Migration Script for Stage 1 Google Auth
-- Run this script manually in your Supabase Dashboard -> SQL Editor

-- 1. Create public.profiles table if it does not already exist
-- Storing registration_id as TEXT without a foreign-key constraint is chosen
-- to prevent potential constraint validation failures during manual setup.
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'student' CONSTRAINT chk_role CHECK (role IN ('student', 'evaluator', 'admin')),
  registration_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Enable RLS on public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Select Policy for profiles (Users can view their own profile)
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = user_id);

-- 4. Create trigger function to automatically handle user creation
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  v_registration_id TEXT;
  v_role TEXT := 'student';
BEGIN
  -- Check if the email ends with the required domain
  IF NEW.email NOT LIKE '%@sece.ac.in' THEN
    -- Under Option 2, we do NOT raise an exception (which would crash Supabase's internal auth flow).
    -- We simply do not create a profile row. The React frontend will check for the profile on login,
    -- realize it is missing, and immediately sign the user out.
    RETURN NEW;
  END IF;

  -- Check if the user's email matches an existing registration (as leader, member2, or member3)
  SELECT registration_id INTO v_registration_id
  FROM public.registrations
  WHERE leader_email = NEW.email 
     OR member2_email = NEW.email 
     OR member3_email = NEW.email
  LIMIT 1;

  -- Insert the new user's profile
  INSERT INTO public.profiles (user_id, email, name, role, registration_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    v_role,
    v_registration_id
  )
  ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email,
      name = EXCLUDED.name,
      registration_id = EXCLUDED.registration_id,
      updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Bind the trigger to auth.users AFTER INSERT
CREATE TRIGGER tr_on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_profile();

-- 6. Create trigger function to update profile when a new registration is submitted
CREATE OR REPLACE FUNCTION public.handle_new_registration_link()
RETURNS TRIGGER AS $$
BEGIN
  -- Link registration_id to any existing profiles matching leader, member2, or member3 emails
  UPDATE public.profiles
  SET registration_id = NEW.registration_id
  WHERE email IN (NEW.leader_email, NEW.member2_email, NEW.member3_email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Bind the trigger to public.registrations AFTER INSERT
CREATE TRIGGER tr_on_registration_inserted
AFTER INSERT ON public.registrations
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_registration_link();
