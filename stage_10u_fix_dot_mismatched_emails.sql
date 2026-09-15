-- ==============================================================================
-- STAGE 10U MIGRATION: FIX DOT-MISMATCHED EMAILS & RECONCILE PROFILES
-- File: stage_10u_fix_dot_mismatched_emails.sql
-- Description:
-- Corrects institutional email dot-placement discrepancies for 7 confirmed students
-- across registrations and product_members tables to match their Google Workspace
-- OAuth identities (profiles.email), and reconciles profiles.registration_id.
--
-- IMPORTANT SAFETY RULES:
-- 1. Precise WHERE conditions using registration_id and confirmed old values.
-- 2. No broad username transformations or bulk regex replacements.
-- 3. Unrelated registrations, teams, and profiles remain untouched.
-- 4. DO NOT EXECUTE AUTOMATICALLY. User will manually execute in Supabase SQL Editor.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. IPL26-0292: Niket Kumar (Team Leader, "Team Debuggers")
-- Before:
--   registrations.leader_email = 'niketkumar2024cse@sece.ac.in'
--   product_members.member_email = 'niketkumar2024cse@sece.ac.in'
--   profiles.registration_id = NULL (email: 'niketkumar.2024cse@sece.ac.in')
-- After:
--   registrations.leader_email = 'niketkumar.2024cse@sece.ac.in'
--   product_members.member_email = 'niketkumar.2024cse@sece.ac.in'
--   profiles.registration_id = 'IPL26-0292'
-- ------------------------------------------------------------------------------
UPDATE public.registrations
SET leader_email = 'niketkumar.2024cse@sece.ac.in',
    updated_at = timezone('utc'::text, now())
WHERE registration_id = 'IPL26-0292'
  AND leader_email = 'niketkumar2024cse@sece.ac.in';

UPDATE public.product_members
SET member_email = 'niketkumar.2024cse@sece.ac.in',
    updated_at = timezone('utc'::text, now())
WHERE product_id = '94389b11-b937-41ff-9cbf-cba6cebd78da'
  AND member_email = 'niketkumar2024cse@sece.ac.in'
  AND role = 'Team Leader';

UPDATE public.profiles
SET registration_id = 'IPL26-0292',
    updated_at = timezone('utc'::text, now())
WHERE user_id = '2f212241-7b71-462f-81e7-fbde902bdff2'
  AND email = 'niketkumar.2024cse@sece.ac.in'
  AND (registration_id IS NULL OR registration_id = '');

-- ------------------------------------------------------------------------------
-- 2. IPL26-0283: Sethukamal P G (Team Member, "Hacktivators")
-- Before:
--   registrations.member3_email = 'sethukamal.p.g2025cse@sece.ac.in'
--   product_members.member_email = 'sethukamal.p.g2025cse@sece.ac.in'
--   profiles.registration_id = NULL (email: 'sethukamal.pg2025cse@sece.ac.in')
-- After:
--   registrations.member3_email = 'sethukamal.pg2025cse@sece.ac.in'
--   product_members.member_email = 'sethukamal.pg2025cse@sece.ac.in'
--   profiles.registration_id = 'IPL26-0283'
-- ------------------------------------------------------------------------------
UPDATE public.registrations
SET member3_email = 'sethukamal.pg2025cse@sece.ac.in',
    updated_at = timezone('utc'::text, now())
WHERE registration_id = 'IPL26-0283'
  AND member3_email = 'sethukamal.p.g2025cse@sece.ac.in';

UPDATE public.product_members
SET member_email = 'sethukamal.pg2025cse@sece.ac.in',
    updated_at = timezone('utc'::text, now())
WHERE product_id = 'c9470620-77eb-4201-9f6c-b84e262b5114'
  AND member_email = 'sethukamal.p.g2025cse@sece.ac.in';

UPDATE public.profiles
SET registration_id = 'IPL26-0283',
    updated_at = timezone('utc'::text, now())
WHERE user_id = 'a75b45ce-ecfa-43a1-80a7-80759b36f795'
  AND email = 'sethukamal.pg2025cse@sece.ac.in'
  AND (registration_id IS NULL OR registration_id = '');

-- ------------------------------------------------------------------------------
-- 3. IPL26-0241: Md jabed akhtar (Team Member, "Team brute force")
-- Before:
--   registrations.member2_email = 'jabedakhtarmd.2025cse@sece.ac.in'
--   product_members.member_email = 'jabedakhtarmd.2025cse@sece.ac.in'
--   profiles.registration_id = NULL (email: 'jabedakhtar.md2025cse@sece.ac.in')
-- After:
--   registrations.member2_email = 'jabedakhtar.md2025cse@sece.ac.in'
--   product_members.member_email = 'jabedakhtar.md2025cse@sece.ac.in'
--   profiles.registration_id = 'IPL26-0241'
-- ------------------------------------------------------------------------------
UPDATE public.registrations
SET member2_email = 'jabedakhtar.md2025cse@sece.ac.in',
    updated_at = timezone('utc'::text, now())
WHERE registration_id = 'IPL26-0241'
  AND member2_email = 'jabedakhtarmd.2025cse@sece.ac.in';

UPDATE public.product_members
SET member_email = 'jabedakhtar.md2025cse@sece.ac.in',
    updated_at = timezone('utc'::text, now())
WHERE product_id = 'a835d3fa-7e9a-4b73-a18d-2128b72c7d06'
  AND member_email = 'jabedakhtarmd.2025cse@sece.ac.in';

UPDATE public.profiles
SET registration_id = 'IPL26-0241',
    updated_at = timezone('utc'::text, now())
WHERE user_id = '4073d68d-1e8e-4381-bd54-bc1890e8dd00'
  AND email = 'jabedakhtar.md2025cse@sece.ac.in'
  AND (registration_id IS NULL OR registration_id = '');

-- ------------------------------------------------------------------------------
-- 4. IPL26-0247: ABIARASAN K.M (Team Member, "QUANTUM CODERS")
-- Before:
--   registrations.member2_email = 'abiarasan.k.m2025aiml@sece.ac.in'
--   product_members.member_email = 'abiarasan.k.m2025aiml@sece.ac.in'
--   profiles.registration_id = NULL (email: 'abiarasan.km2025aiml@sece.ac.in')
-- After:
--   registrations.member2_email = 'abiarasan.km2025aiml@sece.ac.in'
--   product_members.member_email = 'abiarasan.km2025aiml@sece.ac.in'
--   profiles.registration_id = 'IPL26-0247'
-- ------------------------------------------------------------------------------
UPDATE public.registrations
SET member2_email = 'abiarasan.km2025aiml@sece.ac.in',
    updated_at = timezone('utc'::text, now())
WHERE registration_id = 'IPL26-0247'
  AND member2_email = 'abiarasan.k.m2025aiml@sece.ac.in';

UPDATE public.product_members
SET member_email = 'abiarasan.km2025aiml@sece.ac.in',
    updated_at = timezone('utc'::text, now())
WHERE product_id = '02a12aad-e545-40c8-8770-d536cbdfb7dc'
  AND member_email = 'abiarasan.k.m2025aiml@sece.ac.in';

UPDATE public.profiles
SET registration_id = 'IPL26-0247',
    updated_at = timezone('utc'::text, now())
WHERE user_id = '3e57ee77-7fc4-4710-8cd9-dbb3fc985852'
  AND email = 'abiarasan.km2025aiml@sece.ac.in'
  AND (registration_id IS NULL OR registration_id = '');

-- ------------------------------------------------------------------------------
-- 5. IPL26-0499: Dhivithkumar R (Team Member, "Auranet")
-- Before:
--   registrations.member3_email = 'dhivithkumar2023csbs@sece.ac.in'
--   product_members.member_email = 'dhivithkumar2023csbs@sece.ac.in'
--   profiles.registration_id = NULL (email: 'dhivithkumar.2023csbs@sece.ac.in')
-- After:
--   registrations.member3_email = 'dhivithkumar.2023csbs@sece.ac.in'
--   product_members.member_email = 'dhivithkumar.2023csbs@sece.ac.in'
--   profiles.registration_id = 'IPL26-0499'
-- ------------------------------------------------------------------------------
UPDATE public.registrations
SET member3_email = 'dhivithkumar.2023csbs@sece.ac.in',
    updated_at = timezone('utc'::text, now())
WHERE registration_id = 'IPL26-0499'
  AND member3_email = 'dhivithkumar2023csbs@sece.ac.in';

UPDATE public.product_members
SET member_email = 'dhivithkumar.2023csbs@sece.ac.in',
    updated_at = timezone('utc'::text, now())
WHERE product_id = '3c02ca51-f143-456c-b884-bfc6cce88fcd'
  AND member_email = 'dhivithkumar2023csbs@sece.ac.in';

UPDATE public.profiles
SET registration_id = 'IPL26-0499',
    updated_at = timezone('utc'::text, now())
WHERE user_id = 'b4493f88-bfd0-4bd8-902d-0d6a417fc155'
  AND email = 'dhivithkumar.2023csbs@sece.ac.in'
  AND (registration_id IS NULL OR registration_id = '');

-- ------------------------------------------------------------------------------
-- 6. IPL26-0147: Mohamed Adhil A (Team Member, "WhiteWakers")
-- Before:
--   registrations.member3_email = 'mohamedadhil.2024lit@sece.ac.in'
--   product_members.member_email = 'mohamedadhil.2024lit@sece.ac.in'
--   profiles.registration_id = NULL (email: 'mohamedadhil2024lit@sece.ac.in')
-- After:
--   registrations.member3_email = 'mohamedadhil2024lit@sece.ac.in'
--   product_members.member_email = 'mohamedadhil2024lit@sece.ac.in'
--   profiles.registration_id = 'IPL26-0147'
-- ------------------------------------------------------------------------------
UPDATE public.registrations
SET member3_email = 'mohamedadhil2024lit@sece.ac.in',
    updated_at = timezone('utc'::text, now())
WHERE registration_id = 'IPL26-0147'
  AND member3_email = 'mohamedadhil.2024lit@sece.ac.in';

UPDATE public.product_members
SET member_email = 'mohamedadhil2024lit@sece.ac.in',
    updated_at = timezone('utc'::text, now())
WHERE product_id = 'bc389b2b-06cd-4f0f-9c70-afb9452f8d52'
  AND member_email = 'mohamedadhil.2024lit@sece.ac.in';

UPDATE public.profiles
SET registration_id = 'IPL26-0147',
    updated_at = timezone('utc'::text, now())
WHERE user_id = 'b47c504c-d335-455f-9b83-a3a46309d10e'
  AND email = 'mohamedadhil2024lit@sece.ac.in'
  AND (registration_id IS NULL OR registration_id = '');

-- ------------------------------------------------------------------------------
-- 7. IPL26-0136: Mogitha Gowri Sankar (Team Member, "ZeroBugs")
-- Before:
--   registrations.member3_email = 'mogithagowrisankar2025cse@sece.ac.in'
--   product_members.member_email = 'mogithagowrisankar2025cse@sece.ac.in'
--   profiles.registration_id = NULL (email: 'mogithagowrisankar.2025cse@sece.ac.in')
-- After:
--   registrations.member3_email = 'mogithagowrisankar.2025cse@sece.ac.in'
--   product_members.member_email = 'mogithagowrisankar.2025cse@sece.ac.in'
--   profiles.registration_id = 'IPL26-0136'
-- ------------------------------------------------------------------------------
UPDATE public.registrations
SET member3_email = 'mogithagowrisankar.2025cse@sece.ac.in',
    updated_at = timezone('utc'::text, now())
WHERE registration_id = 'IPL26-0136'
  AND member3_email = 'mogithagowrisankar2025cse@sece.ac.in';

UPDATE public.product_members
SET member_email = 'mogithagowrisankar.2025cse@sece.ac.in',
    updated_at = timezone('utc'::text, now())
WHERE product_id = '2def437d-532c-4915-9588-4173aeaaa9b3'
  AND member_email = 'mogithagowrisankar2025cse@sece.ac.in';

UPDATE public.profiles
SET registration_id = 'IPL26-0136',
    updated_at = timezone('utc'::text, now())
WHERE user_id = '444ddd67-26e9-484a-8e83-754ca167c15e'
  AND email = 'mogithagowrisankar.2025cse@sece.ac.in'
  AND (registration_id IS NULL OR registration_id = '');

COMMIT;

-- ==============================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- Run these queries after applying the migration to verify all 7 records.
-- ==============================================================================

-- 1. Verify Registrations Emails
SELECT registration_id, team_name, leader_email, member2_email, member3_email
FROM public.registrations
WHERE registration_id IN ('IPL26-0292', 'IPL26-0283', 'IPL26-0241', 'IPL26-0247', 'IPL26-0499', 'IPL26-0147', 'IPL26-0136')
ORDER BY registration_id;

-- 2. Verify Product Members Emails
SELECT pm.id, pm.product_id, pm.member_name, pm.member_email, pm.role, p.legacy_registration_id
FROM public.product_members pm
JOIN public.products p ON p.id = pm.product_id
WHERE p.legacy_registration_id IN ('IPL26-0292', 'IPL26-0283', 'IPL26-0241', 'IPL26-0247', 'IPL26-0499', 'IPL26-0147', 'IPL26-0136')
  AND pm.member_email IN (
    'niketkumar.2024cse@sece.ac.in',
    'sethukamal.pg2025cse@sece.ac.in',
    'jabedakhtar.md2025cse@sece.ac.in',
    'abiarasan.km2025aiml@sece.ac.in',
    'dhivithkumar.2023csbs@sece.ac.in',
    'mohamedadhil2024lit@sece.ac.in',
    'mogithagowrisankar.2025cse@sece.ac.in'
  )
ORDER BY p.legacy_registration_id;

-- 3. Verify Profiles registration_id linkage
SELECT user_id, email, name, registration_id
FROM public.profiles
WHERE email IN (
  'niketkumar.2024cse@sece.ac.in',
  'sethukamal.pg2025cse@sece.ac.in',
  'jabedakhtar.md2025cse@sece.ac.in',
  'abiarasan.km2025aiml@sece.ac.in',
  'dhivithkumar.2023csbs@sece.ac.in',
  'mohamedadhil2024lit@sece.ac.in',
  'mogithagowrisankar.2025cse@sece.ac.in'
)
ORDER BY registration_id;
