-- ==============================================================================
-- STAGE 11: Product-Level Voting Architecture Migration Script (Hardened)
-- IPL-2026 Platform
-- Run this script in your Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 0. Safety Pre-check
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.votes;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'SAFETY STOP: public.votes contains % rows. Migration requires 0 real votes.', v_count;
  END IF;
END $$;

-- 1. Modify public.votes table for product-level uniqueness & FK RESTRICT protection
-- Add product_id column referencing products table with ON DELETE RESTRICT
ALTER TABLE public.votes ADD COLUMN IF NOT EXISTS product_id UUID;

-- Update foreign key constraint on product_id to ON DELETE RESTRICT
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_product_id_fkey;
ALTER TABLE public.votes 
ADD CONSTRAINT votes_product_id_fkey 
FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

-- Update foreign key constraint on team_id to ON DELETE RESTRICT
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_team_id_fkey;
ALTER TABLE public.votes 
ADD CONSTRAINT votes_team_id_fkey 
FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE RESTRICT;

-- Drop old team-level unique constraint if exists
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS unique_voter_team_round;
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS votes_voter_user_id_team_id_voting_round_key;
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS unique_voter_product_round;

-- Add new product-level unique constraint (authoritative database duplicate guard)
ALTER TABLE public.votes 
ADD CONSTRAINT unique_voter_product_round UNIQUE (voter_user_id, product_id, voting_round);

-- Performance indexes for high-concurrency votes queries
CREATE INDEX IF NOT EXISTS idx_votes_product_round ON public.votes(product_id, voting_round);
CREATE INDEX IF NOT EXISTS idx_votes_voter_product ON public.votes(voter_user_id, product_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter_round ON public.votes(voter_user_id, voting_round);
CREATE INDEX IF NOT EXISTS idx_votes_team_round ON public.votes(team_id, voting_round);

-- 2. Create normalized product_votes aggregate table with ON DELETE RESTRICT
CREATE TABLE IF NOT EXISTS public.product_votes (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  voting_round INTEGER NOT NULL DEFAULT 1,
  total_votes INTEGER NOT NULL DEFAULT 0,
  vote_count INTEGER NOT NULL DEFAULT 0,
  last_vote_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, voting_round)
);

CREATE INDEX IF NOT EXISTS idx_product_votes_ranking ON public.product_votes(voting_round, vote_count DESC, last_vote_at ASC);
CREATE INDEX IF NOT EXISTS idx_product_votes_team ON public.product_votes(team_id);

-- Enable RLS for product_votes
ALTER TABLE public.product_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read of product votes" ON public.product_votes;
CREATE POLICY "Allow public read of product votes"
ON public.product_votes FOR SELECT
USING (true);

-- 3. Drop legacy cast_vote functions if exist to avoid signature clash
DROP FUNCTION IF EXISTS public.cast_vote(UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS public.cast_vote(UUID, UUID, UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.cast_vote(UUID, UUID, INTEGER, TEXT);

-- 4. Core Atomic Product-Level Vote Function (RPC)
-- AUTHORITATIVE IDENTITY: Derived strictly from auth.uid() inside database boundary.
-- CLIENT-SUPPLIED VOTER ID IS NOT ACCEPTED AS A PARAMETER.
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
  v_current_round INTEGER;
  v_voter_dept TEXT;
  v_voter_email TEXT;
  v_product_id UUID;
  v_product_team_id UUID;
  v_product_title TEXT;
  v_product_status TEXT;
  v_team_id UUID;
  v_team_name TEXT;
  v_qr_team_id UUID;
  v_qr_is_active BOOLEAN;
  v_member_depts TEXT[];
  v_is_own_team BOOLEAN := false;
  v_new_product_votes INTEGER;
  v_new_team_votes INTEGER;
BEGIN
  -- A. Determine authoritative voter identity strictly from auth.uid()
  v_voter_user_id := auth.uid();

  IF v_voter_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'AUTH_REQUIRED',
      'message', 'Authentication required. No valid voter identity found.'
    );
  END IF;

  -- B. Check global community voting switch & active round
  SELECT 
    COALESCE(is_voting_active, community_voting_enabled, false),
    COALESCE(current_voting_round, 1)
  INTO v_voting_active, v_current_round
  FROM public.voting_controls
  WHERE id = 1;

  IF v_voting_active IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'VOTING_CLOSED',
      'message', 'Community voting is currently closed by the administrator.'
    );
  END IF;

  IF p_voting_round <> v_current_round THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_ROUND',
      'message', 'Voting round mismatch. Active round is ' || v_current_round
    );
  END IF;

  -- C. Verify voter profile and permanent department in public.profiles
  SELECT department, email
  INTO v_voter_dept, v_voter_email
  FROM public.profiles
  WHERE user_id = v_voter_user_id;

  IF v_voter_dept IS NULL OR TRIM(v_voter_dept) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'DEPARTMENT_REQUIRED',
      'message', 'Please select and save your department in your profile before voting.'
    );
  END IF;

  -- D. Resolve target product & its normalized team_id
  SELECT id, team_id, product_title, COALESCE(status, 'active')
  INTO v_product_id, v_product_team_id, v_product_title, v_product_status
  FROM public.products
  WHERE id = p_product_id;

  IF v_product_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'PRODUCT_NOT_FOUND',
      'message', 'The requested innovation project was not found.'
    );
  END IF;

  IF v_product_status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'PRODUCT_INACTIVE',
      'message', 'This project is not currently active for community voting.'
    );
  END IF;

  IF p_team_id IS NOT NULL AND p_team_id <> v_product_team_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TEAM_PRODUCT_MISMATCH',
      'message', 'The specified product does not belong to the provided team.'
    );
  END IF;

  v_team_id := v_product_team_id;

  SELECT team_name INTO v_team_name
  FROM public.teams
  WHERE id = v_team_id;

  IF v_team_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TEAM_NOT_FOUND',
      'message', 'The team associated with this product does not exist.'
    );
  END IF;

  -- E. Validate QR Token (if provided)
  IF p_qr_token IS NOT NULL AND TRIM(p_qr_token) <> '' THEN
    SELECT team_id, is_active
    INTO v_qr_team_id, v_qr_is_active
    FROM public.team_qr_codes
    WHERE qr_token = TRIM(p_qr_token) OR token = TRIM(p_qr_token)
    LIMIT 1;

    IF v_qr_team_id IS NULL OR v_qr_is_active IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'INVALID_QR_CODE',
        'message', 'INVALID QR CODE - This QR code is not active or is invalid.'
      );
    END IF;

    IF v_qr_team_id <> v_team_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'QR_TEAM_MISMATCH',
        'message', 'INVALID QR CODE - This QR code does not belong to the product team.'
      );
    END IF;
  END IF;

  -- F. Check duplicate vote for THIS SPECIFIC PRODUCT in this round
  IF EXISTS (
    SELECT 1 FROM public.votes
    WHERE voter_user_id = v_voter_user_id
      AND product_id = v_product_id
      AND voting_round = p_voting_round
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_VOTED',
      'message', 'You have already voted for this product in this voting round.'
    );
  END IF;

  -- G. Check own-team voting rule (Leader, Member 1, Member 2)
  -- Authoritative normalized lookup via public.product_members
  -- Strictly filtered to 'Team Leader' and 'Team Member'; Mentor is NEVER a team member
  IF EXISTS (
    SELECT 1 
    FROM public.product_members pm
    JOIN public.products p ON p.id = pm.product_id
    WHERE p.team_id = v_team_id
      AND pm.role IN ('Team Leader', 'Team Member')
      AND LOWER(TRIM(pm.member_email)) = LOWER(TRIM(v_voter_email))
  ) THEN
    v_is_own_team := true;
  END IF;

  IF v_is_own_team THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'OWN_TEAM_VOTE_BLOCKED',
      'message', 'You cannot vote for your own team.'
    );
  END IF;

  -- H. Check Department Eligibility Rule:
  -- Block if voter department matches Leader, Member 1, or Member 2 department.
  -- MENTOR DEPARTMENT IS STRICTLY IGNORED.
  -- Authoritative normalized lookup via public.product_members JOIN public.departments
  SELECT ARRAY_AGG(DISTINCT d.name)
  INTO v_member_depts
  FROM public.product_members pm
  JOIN public.products p ON p.id = pm.product_id
  JOIN public.departments d ON d.id = pm.department_id
  WHERE p.team_id = v_team_id
    AND pm.role IN ('Team Leader', 'Team Member');

  IF v_member_depts IS NOT NULL AND array_length(v_member_depts, 1) > 0 THEN
    IF LOWER(TRIM(v_voter_dept)) = ANY(
      SELECT LOWER(TRIM(unnest(v_member_depts)))
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'DEPARTMENT_INELIGIBLE',
        'message', 'You cannot vote for a team that has a member from your department (' || v_voter_dept || ').'
      );
    END IF;
  END IF;

  -- I. Atomic Vote Insertion (Database constraint enforces duplicate prevention)
  BEGIN
    INSERT INTO public.votes (
      voter_user_id,
      product_id,
      team_id,
      voting_round,
      voter_department,
      created_at
    )
    VALUES (
      v_voter_user_id,
      v_product_id,
      v_team_id,
      p_voting_round,
      v_voter_dept,
      NOW()
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'ALREADY_VOTED',
        'message', 'You have already voted for this product in this voting round.'
      );
  END;

  -- J. Atomic Upsert into product_votes aggregate
  INSERT INTO public.product_votes (
    product_id,
    team_id,
    voting_round,
    total_votes,
    vote_count,
    last_vote_at,
    created_at,
    updated_at
  )
  VALUES (
    v_product_id,
    v_team_id,
    p_voting_round,
    1,
    1,
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (product_id, voting_round)
  DO UPDATE SET
    total_votes = public.product_votes.vote_count + 1,
    vote_count = public.product_votes.vote_count + 1,
    last_vote_at = NOW(),
    updated_at = NOW()
  RETURNING vote_count INTO v_new_product_votes;

  -- K. Atomic Upsert into team_votes aggregate (backward compatibility)
  INSERT INTO public.team_votes (
    team_id,
    voting_round,
    vote_count,
    last_vote_at,
    updated_at
  )
  VALUES (
    v_team_id,
    p_voting_round,
    1,
    NOW(),
    NOW()
  )
  ON CONFLICT (team_id, voting_round)
  DO UPDATE SET
    vote_count = public.team_votes.vote_count + 1,
    last_vote_at = NOW(),
    updated_at = NOW()
  RETURNING vote_count INTO v_new_team_votes;

  RETURN jsonb_build_object(
    'success', true,
    'product_id', v_product_id,
    'product_title', v_product_title,
    'team_id', v_team_id,
    'team_name', v_team_name,
    'voting_round', p_voting_round,
    'new_product_votes', v_new_product_votes,
    'new_team_votes', v_new_team_votes,
    'new_vote_count', v_new_product_votes,
    'message', 'Your vote for "' || v_product_title || '" has been recorded successfully!'
  );
END;
$$;

-- 5. Leaderboard View RPC (Ranks active products individually)
CREATE OR REPLACE FUNCTION public.get_voting_leaderboard(
  p_round INTEGER DEFAULT 1,
  p_limit INTEGER DEFAULT 350
)
RETURNS TABLE (
  rank BIGINT,
  id UUID,
  product_id UUID,
  product_title TEXT,
  leading_product_title TEXT,
  team_id UUID,
  team_name TEXT,
  department TEXT,
  team_leader_name TEXT,
  vote_count INTEGER,
  total_votes BIGINT,
  last_vote_time TIMESTAMPTZ,
  share_url TEXT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH total_counter AS (
    SELECT COALESCE(SUM(pv.vote_count), 0)::BIGINT AS grand_total
    FROM public.product_votes pv
    WHERE pv.voting_round = p_round
  )
  SELECT
    DENSE_RANK() OVER (
      ORDER BY COALESCE(pv.vote_count, 0) DESC, COALESCE(pv.last_vote_at, p.created_at) ASC, p.id ASC
    ) AS rank,
    p.id AS id,
    p.id AS product_id,
    COALESCE(p.product_title, 'Untitled Innovation') AS product_title,
    COALESCE(p.product_title, 'Untitled Innovation') AS leading_product_title,
    t.id AS team_id,
    COALESCE(t.team_name, 'Independent Team') AS team_name,
    COALESCE(
      (
        SELECT d.name
        FROM public.product_members pm
        JOIN public.departments d ON d.id = pm.department_id
        WHERE pm.product_id = p.id
        ORDER BY pm.is_team_leader DESC, pm.id ASC
        LIMIT 1
      ),
      'Engineering'
    ) AS department,
    COALESCE(
      (
        SELECT pm.member_name
        FROM public.product_members pm
        WHERE pm.product_id = p.id AND pm.is_team_leader = TRUE
        LIMIT 1
      ),
      'Team Representative'
    ) AS team_leader_name,
    COALESCE(pv.vote_count, 0)::INTEGER AS vote_count,
    tc.grand_total AS total_votes,
    COALESCE(pv.last_vote_at, p.created_at) AS last_vote_time,
    ''::TEXT AS share_url
  FROM public.products p
  JOIN public.teams t ON t.id = p.team_id
  CROSS JOIN total_counter tc
  LEFT JOIN public.product_votes pv ON pv.product_id = p.id AND pv.voting_round = p_round
  WHERE COALESCE(p.status, 'active') = 'active'
  ORDER BY rank ASC
  LIMIT p_limit;
$$;

-- 6. Permissions & Realtime Publication
GRANT EXECUTE ON FUNCTION public.cast_vote(UUID, UUID, INTEGER, TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_voting_leaderboard(INTEGER, INTEGER) TO authenticated, service_role, anon;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'product_votes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_votes;
  END IF;
END $$;
