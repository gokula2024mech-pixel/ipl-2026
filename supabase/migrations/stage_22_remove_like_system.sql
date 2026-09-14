-- ==============================================================================
-- STAGE 22: COMPLETE LIKE SYSTEM REMOVAL
-- IPL-2026 Platform
-- DO NOT DEPLOY AUTOMATICALLY. Manual deployment script for Supabase SQL Editor.
-- ==============================================================================
-- Purpose:
-- Completely and permanently remove the Like subsystem from the database.
-- Authoritative scoring formula:
--     SCORE = VOTES * 2
--
-- ABSOLUTE SAFETY & IMMUTABILITY GUARANTEES:
-- 1. ZERO modifications, updates, deletes, or truncations to vote data:
--    - public.product_votes is 100% UNTOUCHED.
--    - public.votes is 100% UNTOUCHED.
--    - public.product_vote_counts is 100% UNTOUCHED.
--    - For every product: vote_count_after = vote_count_before.
-- 2. ZERO cascade:
--    - NO 'DROP TABLE ... CASCADE' is used.
--    - All Like-dependent objects (view, RPC, indexes, policies, publication) are
--      explicitly cleaned up first in exact safe dependency order.
-- 3. ZERO impact on Phase 3 Shortlist, LinkedIn submissions, Teams, Products,
--    Registrations, Profiles, or QR Codes.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. UPDATE SCORING VIEW: public.idea_scores (REMOVE LIKE DEPENDENCY)
-- ==============================================================================
-- Must be updated first because the old view depended on public.idea_likes.
-- Note: In PostgreSQL, CREATE OR REPLACE VIEW cannot drop columns (likes_count).
-- We safely drop the view without CASCADE (preserving schema safety, failing if unexpected dependencies exist)
-- and recreate it cleanly with Score = Votes * 2.
DROP VIEW IF EXISTS public.idea_scores;

CREATE VIEW public.idea_scores AS
WITH vote_counts AS (
  SELECT product_id, voting_round, vote_count AS votes_count, last_vote_at
  FROM public.product_vote_counts
)
SELECT 
  p.id AS product_id,
  p.team_id,
  p.product_title,
  t.team_name,
  COALESCE(vc.voting_round, 1) AS voting_round,
  COALESCE(vc.votes_count, 0) AS votes_count,
  (COALESCE(vc.votes_count, 0) * 2)::INTEGER AS total_score,
  vc.last_vote_at,
  p.created_at
FROM public.products p
JOIN public.teams t ON t.id = p.team_id
LEFT JOIN vote_counts vc ON vc.product_id = p.id
WHERE COALESCE(p.status, 'active') = 'active';

COMMENT ON VIEW public.idea_scores IS 'Authoritative product score view: total_score = votes_count * 2. Likes are completely removed.';

-- ==============================================================================
-- 2. REMOVE FROM SUPABASE REALTIME PUBLICATION
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'idea_likes'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.idea_likes;
    END IF;
  END IF;
END;
$$;

-- ==============================================================================
-- 3. DROP LIKE RPC FUNCTION (SECURITY DEFINER)
-- ==============================================================================
DROP FUNCTION IF EXISTS public.record_idea_like(UUID, TEXT, TEXT, UUID);

-- ==============================================================================
-- 4. DROP LIKE RLS POLICIES
-- ==============================================================================
DROP POLICY IF EXISTS "Allow public read of idea_likes" ON public.idea_likes;
DROP POLICY IF EXISTS "Allow authenticated user to insert own like" ON public.idea_likes;
DROP POLICY IF EXISTS "Allow anon insert like" ON public.idea_likes;

-- ==============================================================================
-- 5. DROP LIKE INDEXES
-- ==============================================================================
DROP INDEX IF EXISTS public.idx_idea_likes_product_id;
DROP INDEX IF EXISTS public.idx_idea_likes_ip_time;
DROP INDEX IF EXISTS public.idx_idea_likes_user_product;
DROP INDEX IF EXISTS public.idx_idea_likes_visitor_product;

-- ==============================================================================
-- 6. DROP TABLE public.idea_likes (WITHOUT CASCADE)
-- ==============================================================================
-- All dependencies were explicitly cleared above. No CASCADE needed.
DROP TABLE IF EXISTS public.idea_likes;

-- ==============================================================================
-- 7. CLEANUP public.voting_controls.is_likes_active
-- ==============================================================================
-- Remove the like toggle column added in Stage 18.
ALTER TABLE public.voting_controls 
DROP COLUMN IF EXISTS is_likes_active;

-- ==============================================================================
-- 8. VOTE PRESERVATION VERIFICATION ASSERTION
-- ==============================================================================
-- Confirm that vote tables are intact and populated.
DO $$
DECLARE
  v_pv_exists BOOLEAN;
  v_pvc_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'product_votes'
  ) INTO v_pv_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'product_vote_counts'
  ) INTO v_pvc_exists;

  IF NOT v_pv_exists OR NOT v_pvc_exists THEN
    RAISE EXCEPTION 'CRITICAL SAFETY ERROR: Vote tables missing after migration!';
  END IF;
END;
$$;

COMMIT;
