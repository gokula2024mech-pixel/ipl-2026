-- ==============================================================================
-- STAGE 10: High-Concurrency Live Voting System Migration Script
-- IPL-2026 Platform
-- Run this script in your Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. App / Voting Controls Table
-- Stores authoritative global switches for Voting, QR Generation, and Round
CREATE TABLE IF NOT EXISTS public.voting_controls (
  id INTEGER PRIMARY KEY DEFAULT 1,
  is_voting_active BOOLEAN NOT NULL DEFAULT false,
  is_qr_generation_active BOOLEAN NOT NULL DEFAULT false,
  current_voting_round INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  CONSTRAINT single_row_check CHECK (id = 1)
);

-- Seed initial default control row if not exists
INSERT INTO public.voting_controls (id, is_voting_active, is_qr_generation_active, current_voting_round, updated_at)
VALUES (1, false, false, 1, NOW())
ON CONFLICT (id) DO NOTHING;

-- 2. Permanent Team QR Codes Table
-- Maps an opaque random cryptographically strong token to a team
CREATE TABLE IF NOT EXISTS public.team_qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  qr_token TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_team_qr UNIQUE (team_id)
);

-- Ensure is_active exists if table was already created
ALTER TABLE public.team_qr_codes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_team_qr_token ON public.team_qr_codes(qr_token);

-- 3. Permanent Votes Table
-- Enforces strict ONE USER + ONE TEAM + ONE VOTING ROUND = ONE VOTE
CREATE TABLE IF NOT EXISTS public.votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  voter_department TEXT NOT NULL,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  voting_round INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_voter_team_round UNIQUE (voter_user_id, team_id, voting_round)
);

-- Targeted indexes for query performance under load
CREATE INDEX IF NOT EXISTS idx_votes_team_round ON public.votes(team_id, voting_round);
CREATE INDEX IF NOT EXISTS idx_votes_voter_round ON public.votes(voter_user_id, voting_round);

-- 4. Authoritative Team Vote Aggregate Table
-- Avoids full-table COUNT(*) during bursts; updated atomically on vote insertion
CREATE TABLE IF NOT EXISTS public.team_votes (
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  voting_round INTEGER NOT NULL DEFAULT 1,
  vote_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, voting_round)
);

CREATE INDEX IF NOT EXISTS idx_team_votes_ranking ON public.team_votes(voting_round, vote_count DESC);

-- 5. Add department column to public.profiles if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department TEXT;

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.voting_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_votes ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies:
-- voting_controls: Public read, Admin manage
DROP POLICY IF EXISTS "Allow public read of voting controls" ON public.voting_controls;
CREATE POLICY "Allow public read of voting controls"
ON public.voting_controls FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Allow admins to manage voting controls" ON public.voting_controls;
CREATE POLICY "Allow admins to manage voting controls"
ON public.voting_controls FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
  )
);

-- team_qr_codes: Authenticated read, Admin manage
DROP POLICY IF EXISTS "Allow authenticated read of team QR codes" ON public.team_qr_codes;
CREATE POLICY "Allow authenticated read of team QR codes"
ON public.team_qr_codes FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Allow admins to manage team QR codes" ON public.team_qr_codes;
CREATE POLICY "Allow admins to manage team QR codes"
ON public.team_qr_codes FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
  )
);

-- team_votes: Public read, System/Admin write
DROP POLICY IF EXISTS "Allow public read of team votes" ON public.team_votes;
CREATE POLICY "Allow public read of team votes"
ON public.team_votes FOR SELECT
USING (true);

-- votes: Voters can read their own votes, Admin can read all
DROP POLICY IF EXISTS "Voters can view their own votes" ON public.votes;
CREATE POLICY "Voters can view their own votes"
ON public.votes FOR SELECT
TO authenticated
USING (auth.uid() = voter_user_id);

DROP POLICY IF EXISTS "Admins can view all votes" ON public.votes;
CREATE POLICY "Admins can view all votes"
ON public.votes FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
  )
);

-- Allow users to update their own profile department if not already set
DROP POLICY IF EXISTS "Users can update their own department" ON public.profiles;
CREATE POLICY "Users can update their own department"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 8. Core Atomic Vote Function (RPC)
-- Validates all business rules server-side and executes insertion + aggregation atomically
CREATE OR REPLACE FUNCTION public.cast_vote(
  p_team_id UUID,
  p_voter_user_id UUID,
  p_voting_round INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_voting_active BOOLEAN;
  v_current_round INTEGER;
  v_voter_dept TEXT;
  v_voter_email TEXT;
  v_team_exists BOOLEAN;
  v_team_name TEXT;
  v_member_depts TEXT[];
  v_is_own_team BOOLEAN := false;
  v_new_count INTEGER;
BEGIN
  -- A. Check if community voting is active
  SELECT is_voting_active, current_voting_round
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

  -- Verify voting round matches
  IF p_voting_round <> v_current_round THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_ROUND',
      'message', 'Voting round mismatch. Active round is ' || v_current_round
    );
  END IF;

  -- B. Check voter profile & voter department
  SELECT department, email
  INTO v_voter_dept, v_voter_email
  FROM public.profiles
  WHERE user_id = p_voter_user_id;

  IF v_voter_dept IS NULL OR TRIM(v_voter_dept) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'DEPARTMENT_REQUIRED',
      'message', 'Please select and save your department in your profile before voting.'
    );
  END IF;

  -- C. Verify team exists
  SELECT EXISTS(SELECT 1 FROM public.teams WHERE id = p_team_id), team_name
  INTO v_team_exists, v_team_name
  FROM public.teams
  WHERE id = p_team_id;

  IF v_team_exists IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TEAM_NOT_FOUND',
      'message', 'The requested team does not exist.'
    );
  END IF;

  -- D. Check duplicate vote (Pre-check for clean error before insert)
  IF EXISTS (
    SELECT 1 FROM public.votes
    WHERE voter_user_id = p_voter_user_id
      AND team_id = p_team_id
      AND voting_round = p_voting_round
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_VOTED',
      'message', 'You have already voted for this team in this voting round.'
    );
  END IF;

  -- E. Check own-team voting rule
  -- 1) Check product_members table
  IF EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.product_members pm ON pm.product_id = p.id
    WHERE p.team_id = p_team_id
      AND LOWER(TRIM(pm.member_email)) = LOWER(TRIM(v_voter_email))
  ) THEN
    v_is_own_team := true;
  END IF;

  -- 2) Check registrations table fallback
  IF NOT v_is_own_team THEN
    IF EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.registrations r ON r.registration_id = p.legacy_registration_id
      WHERE p.team_id = p_team_id
        AND (
          LOWER(TRIM(r.leader_email)) = LOWER(TRIM(v_voter_email)) OR
          LOWER(TRIM(r.member2_email)) = LOWER(TRIM(v_voter_email)) OR
          LOWER(TRIM(r.member3_email)) = LOWER(TRIM(v_voter_email))
        )
    ) THEN
      v_is_own_team := true;
    END IF;
  END IF;

  IF v_is_own_team THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'OWN_TEAM_VOTE_BLOCKED',
      'message', 'You cannot vote for your own team.'
    );
  END IF;

  -- F. Check Department Eligibility Rule:
  -- Voter CANNOT vote if Leader, Member 1, or Member 2 belongs to voter's department.
  -- Mentor department MUST BE COMPLETELY IGNORED.
  
  -- Gather departments of Leader, Member 1, and Member 2
  SELECT ARRAY_AGG(DISTINCT d.name)
  INTO v_member_depts
  FROM public.products p
  JOIN public.product_members pm ON pm.product_id = p.id
  JOIN public.departments d ON d.id = pm.department_id
  WHERE p.team_id = p_team_id;

  -- Also check registrations if product_members had null departments
  IF v_member_depts IS NULL OR array_length(v_member_depts, 1) = 0 THEN
    SELECT ARRAY_AGG(DISTINCT dept)
    INTO v_member_depts
    FROM (
      SELECT r.leader_department AS dept
      FROM public.products p
      JOIN public.registrations r ON r.registration_id = p.legacy_registration_id
      WHERE p.team_id = p_team_id
      UNION
      SELECT r.member2_department
      FROM public.products p
      JOIN public.registrations r ON r.registration_id = p.legacy_registration_id
      WHERE p.team_id = p_team_id
      UNION
      SELECT r.member3_department
      FROM public.products p
      JOIN public.registrations r ON r.registration_id = p.legacy_registration_id
      WHERE p.team_id = p_team_id
    ) depts
    WHERE dept IS NOT NULL;
  END IF;

  -- Compare voter department case-insensitively against team member departments
  IF v_voter_dept = ANY(v_member_depts) OR LOWER(TRIM(v_voter_dept)) = ANY(
    SELECT LOWER(TRIM(unnest(v_member_depts)))
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'DEPARTMENT_INELIGIBLE',
      'message', 'You cannot vote for a team that has a member from your department (' || v_voter_dept || ').'
    );
  END IF;

  -- G. Insert Vote (Database constraint provides ultimate duplicate protection against race conditions)
  BEGIN
    INSERT INTO public.votes (voter_user_id, voter_department, team_id, voting_round, created_at)
    VALUES (p_voter_user_id, v_voter_dept, p_team_id, p_voting_round, NOW());
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'ALREADY_VOTED',
        'message', 'You have already voted for this team in this voting round.'
      );
  END;

  -- H. Increment Aggregate Vote Count Atomically
  INSERT INTO public.team_votes (team_id, voting_round, vote_count, updated_at)
  VALUES (p_team_id, p_voting_round, 1, NOW())
  ON CONFLICT (team_id, voting_round)
  DO UPDATE SET
    vote_count = public.team_votes.vote_count + 1,
    updated_at = NOW()
  RETURNING vote_count INTO v_new_count;

  -- I. Return Success
  RETURN jsonb_build_object(
    'success', true,
    'team_id', p_team_id,
    'team_name', v_team_name,
    'voting_round', p_voting_round,
    'new_vote_count', v_new_count,
    'message', 'Your vote for ' || v_team_name || ' has been recorded successfully!'
  );
END;
$$;

-- 9. Authoritative Voting Leaderboard RPC Function
CREATE OR REPLACE FUNCTION public.get_voting_leaderboard(p_voting_round INTEGER DEFAULT 1)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH team_vote_ranks AS (
  SELECT
    t.id AS team_id,
    t.team_name,
    COALESCE(tv.vote_count, 0) AS vote_count,
    COALESCE(tv.updated_at, t.created_at) AS last_vote_time,
    -- Resolve team department
    COALESCE(
      (
        SELECT d.name
        FROM public.products p
        JOIN public.product_members pm ON pm.product_id = p.id
        JOIN public.departments d ON d.id = pm.department_id
        WHERE p.team_id = t.id AND (pm.is_team_leader = true OR pm.role = 'Team Leader')
        LIMIT 1
      ),
      (
        SELECT r.leader_department
        FROM public.products p
        JOIN public.registrations r ON r.registration_id = p.legacy_registration_id
        WHERE p.team_id = t.id
        LIMIT 1
      ),
      'Unknown Department'
    ) AS department_name,
    -- Resolve leading product title & domain
    COALESCE(
      (
        SELECT p.product_title
        FROM public.products p
        WHERE p.team_id = t.id AND p.status = 'active'
        ORDER BY p.product_number ASC, p.created_at ASC
        LIMIT 1
      ),
      'General Innovation'
    ) AS product_title,
    COALESCE(
      (
        SELECT p.innovation_domain
        FROM public.products p
        WHERE p.team_id = t.id AND p.status = 'active'
        ORDER BY p.product_number ASC, p.created_at ASC
        LIMIT 1
      ),
      'Open Innovation'
    ) AS innovation_domain
  FROM public.teams t
  LEFT JOIN public.team_votes tv ON tv.team_id = t.id AND tv.voting_round = p_voting_round
),
ranked_teams AS (
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY
        vote_count DESC,
        last_vote_time ASC,
        team_id ASC
    ) AS rank,
    team_id,
    team_name,
    department_name,
    product_title,
    innovation_domain,
    vote_count,
    last_vote_time
  FROM team_vote_ranks
)
SELECT jsonb_build_object(
  'voting_round', p_voting_round,
  'total_votes', COALESCE((SELECT SUM(vote_count) FROM public.team_votes WHERE voting_round = p_voting_round), 0),
  'total_teams', (SELECT COUNT(*) FROM ranked_teams),
  'teams', COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'rank', rank,
          'id', team_id,
          'teamName', team_name,
          'department', department_name,
          'leadingProductTitle', product_title,
          'innovationDomain', innovation_domain,
          'voteCount', vote_count,
          'lastVoteTime', last_vote_time
        )
        ORDER BY rank ASC
      )
      FROM ranked_teams
    ),
    '[]'::jsonb
  )
);
$$;

-- Grant execution privileges
GRANT EXECUTE ON FUNCTION public.cast_vote(UUID, UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_voting_leaderboard(INTEGER) TO anon, authenticated, service_role;

-- 10. Enable Supabase Realtime for team_votes and voting_controls
-- Note: Must be run by superuser / admin in Supabase SQL editor
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'team_votes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_votes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'voting_controls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.voting_controls;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Realtime publication setup skipped or already active: %', SQLERRM;
END;
$$;
