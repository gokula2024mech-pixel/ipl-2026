-- IPL-2026 Supabase Additive Migration Script for Team Registration Rules (Stage 4)
-- Run this script in your Supabase Dashboard -> SQL Editor

-- 1. Drop existing trigger if it exists to avoid conflicts
DROP TRIGGER IF EXISTS registration_member_duplicate_check ON public.registrations;

-- 2. Create or replace the validation function with the new business rules
CREATE OR REPLACE FUNCTION public.check_registration_member_duplicates()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_team_name TEXT;
  v_existing_reg_id TEXT;
  v_email_leader TEXT;
  v_email_m2 TEXT;
  v_email_m3 TEXT;
  v_mobile_leader TEXT;
  v_mobile_m2 TEXT;
  v_mobile_m3 TEXT;
BEGIN
  -- A. Normalize emails and mobile numbers
  v_email_leader := LOWER(TRIM(NEW.leader_email));
  v_email_m2 := LOWER(TRIM(NEW.member2_email));
  v_email_m3 := LOWER(TRIM(NEW.member3_email));

  v_mobile_leader := TRIM(NEW.leader_mobile);
  v_mobile_m2 := TRIM(NEW.member2_mobile);
  v_mobile_m3 := TRIM(NEW.member3_mobile);

  -- B. Validate uniqueness of emails within the same registration
  IF v_email_leader = v_email_m2 OR v_email_leader = v_email_m3 OR v_email_m2 = v_email_m3 THEN
    RAISE EXCEPTION 'DUPLICATE_MEMBER_IN_TEAM: Each team member must be unique.';
  END IF;

  -- C. Validate uniqueness of mobile numbers within the same registration
  IF (v_mobile_leader <> '' AND (v_mobile_leader = v_mobile_m2 OR v_mobile_leader = v_mobile_m3)) OR
     (v_mobile_m2 <> '' AND v_mobile_m2 = v_mobile_m3) THEN
    RAISE EXCEPTION 'DUPLICATE_MEMBER_IN_TEAM: Each team member must be unique.';
  END IF;

  -- D. Validate team name uniqueness
  v_normalized_team_name := LOWER(TRIM(NEW.team_name));
  
  -- Check in public.registrations
  SELECT registration_id INTO v_existing_reg_id
  FROM public.registrations
  WHERE LOWER(TRIM(team_name)) = v_normalized_team_name AND id <> NEW.id
  LIMIT 1;

  -- If not found in registrations, check in public.teams
  IF v_existing_reg_id IS NULL THEN
    SELECT p.legacy_registration_id INTO v_existing_reg_id
    FROM public.teams tm
    JOIN public.products p ON p.team_id = tm.id AND p.product_number = 1
    WHERE tm.normalized_team_name = v_normalized_team_name
    LIMIT 1;
  END IF;

  -- If team name exists, reject
  IF v_existing_reg_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.teams WHERE normalized_team_name = v_normalized_team_name
  ) THEN
    RAISE EXCEPTION 'TEAM_NAME_ALREADY_EXISTS: The team name "%" is already registered. (Registration ID: %)', NEW.team_name, COALESCE(v_existing_reg_id, 'IPL26-0000');
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Bind the trigger to public.registrations BEFORE INSERT
CREATE TRIGGER registration_member_duplicate_check
BEFORE INSERT ON public.registrations
FOR EACH ROW
EXECUTE FUNCTION public.check_registration_member_duplicates();
