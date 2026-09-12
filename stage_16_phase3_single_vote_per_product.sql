-- ==============================================================================
-- STAGE 16: Phase 3 Voting Rules & Single Vote Per Idea/Product
-- IPL-2026 Platform
-- DO NOT DEPLOY AUTOMATICALLY. Manual deployment script for SQL Editor.
-- ==============================================================================

BEGIN;

-- 1. Modify public.product_votes: Remove voting_round uniqueness, enforce (voter_user_id + product_id)
DO $$
BEGIN
  -- Drop obsolete round-based unique constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_voter_product_round' 
    AND conrelid = 'public.product_votes'::regclass
  ) THEN
    ALTER TABLE public.product_votes DROP CONSTRAINT unique_voter_product_round;
  END IF;

  -- Add single vote per product constraint if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_voter_product' 
    AND conrelid = 'public.product_votes'::regclass
  ) THEN
    ALTER TABLE public.product_votes 
    ADD CONSTRAINT unique_voter_product UNIQUE (voter_user_id, product_id);
  END IF;
END $$;

-- 2. Performance indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_product_votes_product_id 
ON public.product_votes(product_id);

CREATE INDEX IF NOT EXISTS idx_product_votes_team_id 
ON public.product_votes(team_id);

-- 3. Legacy public.votes table inspection notice:
-- public.votes is an obsolete Stage 10 team-level table (columns: id, voter_user_id, team_id, voting_round, voter_department, created_at)
-- without a product_id column. The active Phase 3 voting flow authoritatively uses public.product_votes.
-- To maintain absolute safety and zero side effects, public.votes is intentionally left unmodified.

-- 4. Phase 3 Atomic cast_vote RPC Function
-- Strictly enforces:
-- - Voter identity from auth.uid()
-- - Voting window active (Phase 3)
-- - Official @sece.ac.in voter requirement
-- - Voter department required
-- - Own team vote restriction (Leader and Members; Mentor ignored)
-- - Department clash restriction (Leader and Members; Mentor ignored)
-- - ONE VOTE PER IDEA/PRODUCT: (voter_user_id + product_id)
-- - Atomic recording into public.product_votes, public.product_vote_counts, and public.team_votes

-- Drop confirmed production function signature to resolve Postgres 42P13 parameter rename conflict
-- (Existing production signature: public.cast_vote(uuid, uuid, integer, text) with parameter names p_team_id, p_voter_user_id)
DROP FUNCTION IF EXISTS public.cast_vote(UUID, UUID, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.cast_vote(
  p_product_id UUID,
  p_team_id UUID DEFAULT NULL,
  p_voting_round INTEGER DEFAULT 1,
  p_qr_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_voter_user_id UUID;
  v_voting_active BOOLEAN;
  v_voter_dept TEXT;
  v_voter_email TEXT;
  v_product_id UUID;
  v_product_team_id UUID;
  v_product_title TEXT;
  v_team_name TEXT;
  v_new_product_votes INTEGER;
  v_new_team_votes INTEGER;
  v_dept_clash BOOLEAN := FALSE;
  v_is_own_team BOOLEAN := FALSE;
BEGIN
  -- 1. Identify voter strictly from authenticated session
  v_voter_user_id := auth.uid();
  IF v_voter_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'UNAUTHORIZED',
      'message', 'Authentication required. Please sign in with your @sece.ac.in account.'
    );
  END IF;

  -- 2. Verify global voting window is active
  SELECT is_voting_active INTO v_voting_active
  FROM public.voting_controls
  WHERE id = 1
  LIMIT 1;

  IF v_voting_active IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'VOTING_CLOSED',
      'message', 'Community voting is currently unavailable.'
    );
  END IF;

  -- 3. Verify voter department and email from public.profiles
  SELECT department, email INTO v_voter_dept, v_voter_email
  FROM public.profiles
  WHERE user_id = v_voter_user_id
  LIMIT 1;

  IF v_voter_email IS NULL OR v_voter_email NOT ILIKE '%@sece.ac.in' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_EMAIL_DOMAIN',
      'message', 'Voting is strictly restricted to verified @sece.ac.in accounts.'
    );
  END IF;

  IF v_voter_dept IS NULL OR TRIM(v_voter_dept) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'DEPARTMENT_REQUIRED',
      'message', 'Please select and save your department in your profile before voting.'
    );
  END IF;

  -- 4. Verify product exists
  SELECT p.id, p.team_id, p.product_title, t.team_name
  INTO v_product_id, v_product_team_id, v_product_title, v_team_name
  FROM public.products p
  JOIN public.teams t ON t.id = p.team_id
  WHERE p.id = p_product_id
  LIMIT 1;

  IF v_product_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'PRODUCT_NOT_FOUND',
      'message', 'Selected innovation project was not found.'
    );
  END IF;

  -- Use resolved team ID if not passed
  IF p_team_id IS NOT NULL AND p_team_id <> v_product_team_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TEAM_MISMATCH',
      'message', 'The specified project does not belong to the selected team.'
    );
  END IF;

  -- 5. DUPLICATE CHECK: One vote per idea (voter_user_id + product_id)
  IF EXISTS (
    SELECT 1 FROM public.product_votes
    WHERE voter_user_id = v_voter_user_id
    AND product_id = v_product_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_VOTED',
      'message', 'You have already voted for this idea.'
    );
  END IF;

  -- 6. Verify own-team and department clash rules (Mentor is strictly excluded!)
  -- Check product_members table
  IF EXISTS (
    SELECT 1 FROM public.product_members pm
    WHERE pm.product_id = v_product_id
    AND (pm.role IS NULL OR pm.role NOT ILIKE '%mentor%')
    AND LOWER(TRIM(pm.member_email)) = LOWER(TRIM(v_voter_email))
  ) THEN
    v_is_own_team := TRUE;
  END IF;

  IF NOT v_is_own_team AND EXISTS (
    SELECT 1 FROM public.product_members pm
    LEFT JOIN public.departments d ON d.id = pm.department_id
    WHERE pm.product_id = v_product_id
    AND (pm.role IS NULL OR pm.role NOT ILIKE '%mentor%')
    AND LOWER(TRIM(d.name)) = LOWER(TRIM(v_voter_dept))
  ) THEN
    v_dept_clash := TRUE;
  END IF;

  -- Fallback check against registrations table
  IF NOT v_is_own_team OR NOT v_dept_clash THEN
    DECLARE
      v_reg RECORD;
    BEGIN
      SELECT * INTO v_reg
      FROM public.registrations
      WHERE LOWER(TRIM(team_name)) = LOWER(TRIM(v_team_name))
      LIMIT 1;

      IF v_reg IS NOT NULL THEN
        IF LOWER(TRIM(COALESCE(v_reg.leader_email, ''))) = LOWER(TRIM(v_voter_email))
           OR LOWER(TRIM(COALESCE(v_reg.member2_email, ''))) = LOWER(TRIM(v_voter_email))
           OR LOWER(TRIM(COALESCE(v_reg.member3_email, ''))) = LOWER(TRIM(v_voter_email)) THEN
          v_is_own_team := TRUE;
        END IF;

        IF LOWER(TRIM(COALESCE(v_reg.leader_department, ''))) = LOWER(TRIM(v_voter_dept))
           OR LOWER(TRIM(COALESCE(v_reg.member2_department, ''))) = LOWER(TRIM(v_voter_dept))
           OR LOWER(TRIM(COALESCE(v_reg.member3_department, ''))) = LOWER(TRIM(v_voter_dept)) THEN
          v_dept_clash := TRUE;
        END IF;
      END IF;
    END;
  END IF;

  IF v_is_own_team THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'OWN_TEAM_VOTE_BLOCKED',
      'message', 'YOU CAN''T VOTE FOR YOUR OWN TEAM - You cannot vote for your own team.'
    );
  END IF;

  IF v_dept_clash THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'DEPARTMENT_INELIGIBLE',
      'message', FORMAT('VOTING NOT ALLOWED - You cannot vote for a team containing members from your department (%s).', v_voter_dept)
    );
  END IF;

  -- 7. ATOMIC VOTE INSERTION into public.product_votes
  BEGIN
    INSERT INTO public.product_votes (
      product_id,
      voter_user_id,
      team_id,
      voter_department,
      voting_round,
      created_at
    ) VALUES (
      v_product_id,
      v_voter_user_id,
      v_product_team_id,
      v_voter_dept,
      1,
      NOW()
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'ALREADY_VOTED',
        'message', 'You have already voted for this idea.'
      );
  END;

  -- 8. Increment product_vote_counts tally
  INSERT INTO public.product_vote_counts (
    product_id,
    team_id,
    voting_round,
    total_votes,
    vote_count,
    last_vote_at,
    updated_at
  ) VALUES (
    v_product_id,
    v_product_team_id,
    1,
    1,
    1,
    NOW(),
    NOW()
  )
  ON CONFLICT (product_id, voting_round) DO UPDATE SET
    total_votes = public.product_vote_counts.total_votes + 1,
    vote_count = public.product_vote_counts.vote_count + 1,
    last_vote_at = NOW(),
    updated_at = NOW()
  RETURNING total_votes INTO v_new_product_votes;

  -- 9. Increment team_votes tally
  INSERT INTO public.team_votes (
    team_id,
    voting_round,
    vote_count,
    updated_at
  ) VALUES (
    v_product_team_id,
    1,
    1,
    NOW()
  )
  ON CONFLICT (team_id, voting_round) DO UPDATE SET
    vote_count = public.team_votes.vote_count + 1,
    updated_at = NOW()
  RETURNING vote_count INTO v_new_team_votes;

  RETURN jsonb_build_object(
    'success', true,
    'product_id', v_product_id,
    'product_title', v_product_title,
    'team_id', v_product_team_id,
    'team_name', v_team_name,
    'voting_round', 1,
    'new_product_votes', v_new_product_votes,
    'new_team_votes', v_new_team_votes,
    'message', 'Your vote has been officially recorded!'
  );
END;
$$;

-- 5. Restore execution permissions
GRANT EXECUTE ON FUNCTION public.cast_vote(UUID, UUID, INTEGER, TEXT) TO authenticated, anon, service_role;

COMMIT;

