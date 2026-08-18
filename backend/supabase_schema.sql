-- IPL-2026 Supabase Schema Migration Script
-- Run this script in your Supabase Dashboard -> SQL Editor

-- 1. Create atomic PostgreSQL sequence for concurrency-safe Registration IDs
CREATE SEQUENCE IF NOT EXISTS registration_id_seq START WITH 1 INCREMENT BY 1;

-- 2. Create function to generate formatted registration ID (IPL26-0001, IPL26-0002, ...)
CREATE OR REPLACE FUNCTION generate_ipl_registration_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'IPL26-' || LPAD(nextval('registration_id_seq')::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 3. Create public.registrations table
CREATE TABLE IF NOT EXISTS public.registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id TEXT UNIQUE NOT NULL DEFAULT generate_ipl_registration_id(),
  team_name TEXT NOT NULL,

  -- Team Leader Details
  leader_name TEXT NOT NULL,
  leader_email TEXT NOT NULL,
  leader_mobile TEXT NOT NULL,
  leader_department TEXT NOT NULL,

  -- Member 2 Details
  member2_name TEXT NOT NULL,
  member2_email TEXT NOT NULL,
  member2_mobile TEXT NOT NULL,
  member2_department TEXT NOT NULL,

  -- Member 3 Details
  member3_name TEXT NOT NULL,
  member3_email TEXT NOT NULL,
  member3_mobile TEXT NOT NULL,
  member3_department TEXT NOT NULL,

  -- Faculty Mentor Details
  mentor_name TEXT NOT NULL,
  mentor_department TEXT NOT NULL,

  -- Project / Innovation Details
  innovation_domain TEXT NOT NULL,
  project_title TEXT NOT NULL,
  problem_area TEXT NOT NULL,
  proposed_solution TEXT NOT NULL,
  expected_impact TEXT NOT NULL,

  -- Uploaded File Metadata
  file_original_name TEXT,
  file_stored_name TEXT,
  file_mime_type TEXT,
  file_size BIGINT,
  file_path TEXT,

  -- Declaration & Timestamps
  declaration_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS for table security (Service Role key bypasses RLS)
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
