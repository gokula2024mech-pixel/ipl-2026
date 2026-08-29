-- Migration Script: Standardize Faculty Mentor Department values in public.registrations
-- Run this script in your Supabase SQL Editor to clean up older data formats.

-- 1. Standardize Artificial Intelligence and Machine Learning
UPDATE public.registrations
SET mentor_department = 'Artificial Intelligence and Machine Learning'
WHERE mentor_department ILIKE '%aiml%'
   OR mentor_department ILIKE '%machine learning%'
   OR mentor_department ILIKE '%machine language%'
   OR mentor_department ILIKE '%ai&ml%'
   OR mentor_department ILIKE '%ai & ml%'
   OR mentor_department ILIKE '%ai/ml%'
   OR mentor_department ILIKE '%ai and ml%';

-- 2. Standardize Artificial Intelligence and Data Science
UPDATE public.registrations
SET mentor_department = 'Artificial Intelligence and Data Science'
WHERE (mentor_department ILIKE '%aids%'
   OR mentor_department ILIKE '%data science%'
   OR mentor_department ILIKE '%ai&ds%'
   OR mentor_department ILIKE '%ai & ds%'
   OR mentor_department ILIKE '%ai/ds%'
   OR mentor_department ILIKE '%ai and ds%')
   AND mentor_department NOT ILIKE 'Artificial Intelligence and Machine Learning';

-- 3. Standardize Computer Science and Business System
UPDATE public.registrations
SET mentor_department = 'Computer Science and Business System'
WHERE mentor_department ILIKE '%csbs%'
   OR mentor_department ILIKE '%business system%';

-- 4. Standardize Cyber Security
UPDATE public.registrations
SET mentor_department = 'Cyber Security'
WHERE mentor_department ILIKE '%cyber security%'
   OR mentor_department ILIKE '%cybersecurity%';

-- 5. Standardize Computer and Communication Engineering
UPDATE public.registrations
SET mentor_department = 'Computer and Communication Engineering'
WHERE mentor_department ILIKE '%cce%'
   OR mentor_department ILIKE '%computer and communication%'
   OR mentor_department ILIKE '%computer & communication%';

-- 6. Standardize Electronics and Communication Engineering
UPDATE public.registrations
SET mentor_department = 'Electronics and Communication Engineering'
WHERE mentor_department ILIKE '%ece%'
   OR mentor_department ILIKE '%electronics and communication%'
   OR mentor_department ILIKE '%electronics & communication%'
   OR mentor_department ILIKE '%electrical and communication%';

-- 7. Standardize Electrical and Electronics Engineering
UPDATE public.registrations
SET mentor_department = 'Electrical and Electronics Engineering'
WHERE mentor_department ILIKE '%eee%'
   OR mentor_department ILIKE '%electrical and electronics%'
   OR mentor_department ILIKE '%electrical and electronic%'
   OR mentor_department ILIKE '%electrical & electronics%'
   OR mentor_department ILIKE '%electrical & electronic%';

-- 8. Standardize Computer Science and Engineering
UPDATE public.registrations
SET mentor_department = 'Computer Science and Engineering'
WHERE (mentor_department ILIKE '%cse%'
   OR mentor_department ILIKE '%computer science%'
   OR mentor_department ILIKE '%computer scinece%'
   OR mentor_department ILIKE '%computer and science%')
   AND mentor_department NOT IN (
     'Artificial Intelligence and Machine Learning',
     'Artificial Intelligence and Data Science',
     'Computer Science and Business System',
     'Computer and Communication Engineering'
   );

-- 9. Standardize Information Technology
UPDATE public.registrations
SET mentor_department = 'Information Technology'
WHERE mentor_department ILIKE '%information technology%'
   OR mentor_department ~* '\yit\y';

-- 10. Standardize Mechanical Engineering
UPDATE public.registrations
SET mentor_department = 'Mechanical Engineering'
WHERE mentor_department ILIKE '%mech%'
   OR mentor_department ILIKE '%mechanical%';
