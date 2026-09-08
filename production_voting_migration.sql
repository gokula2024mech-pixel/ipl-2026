-- ==============================================================================
-- IPL 2026: Authoritative Production Voting Architecture Migration
-- ==============================================================================
-- Description: Creates the authoritative production voting schema for IPL 2026
--              including voter department persistence, durable voting controls,
--              permanent team QR codes, vote ledger with duplicate protection,
--              leaderboard aggregate table, atomic voting RPC, RLS policies,
--              and Supabase Realtime publication configuration.
-- Execution:   Run this script in your Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- ==============================================================================
-- 1. ADD DEPARTMENT COLUMN TO public.profiles
-- ==============================================================================
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS department TEXT;

COMMENT ON COLUMN public.profiles.department IS 'Authoritative one-time department selection for IPL 2026 Community Voting.';

-- Migrate existing voter departments from auth.users raw_user_meta_data
UPDATE public.profiles p
SET department = (u.raw_user_meta_data->>'department')::TEXT,
    updated_at = NOW()
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.department IS NULL OR TRIM(p.department) = '')
  AND u.raw_user_meta_data->>'department' IS NOT NULL
  AND TRIM(u.raw_user_meta_data->>'department') <> '';


-- ==============================================================================
-- 2. CREATE public.voting_controls (DURABLE ADMIN CONTROLS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.voting_controls (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  qr_generation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  community_voting_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_voting_active BOOLEAN NOT NULL DEFAULT FALSE,
  is_qr_generation_active BOOLEAN NOT NULL DEFAULT FALSE,
  current_voting_round INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT DEFAULT 'system'
);

COMMENT ON TABLE public.voting_controls IS 'Authoritative Admin operational controls for IPL 2026 Community Voting and QR generation.';

-- Trigger to sync boolean aliases automatically
CREATE OR REPLACE FUNCTION public.sync_voting_controls_aliases()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.community_voting_enabled IS DISTINCT FROM OLD.community_voting_enabled THEN
    NEW.is_voting_active := NEW.community_voting_enabled;
  ELSIF NEW.is_voting_active IS DISTINCT FROM OLD.is_voting_active THEN
    NEW.community_voting_enabled := NEW.is_voting_active;
  END IF;

  IF NEW.qr_generation_enabled IS DISTINCT FROM OLD.qr_generation_enabled THEN
    NEW.is_qr_generation_active := NEW.qr_generation_enabled;
  ELSIF NEW.is_qr_generation_active IS DISTINCT FROM OLD.is_qr_generation_active THEN
    NEW.qr_generation_enabled := NEW.is_qr_generation_active;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_voting_controls_aliases ON public.voting_controls;
CREATE TRIGGER trg_sync_voting_controls_aliases
BEFORE INSERT OR UPDATE ON public.voting_controls
FOR EACH ROW
EXECUTE FUNCTION public.sync_voting_controls_aliases();

-- Seed authoritative control record (defaults: OFF)
INSERT INTO public.voting_controls (
  id,
  qr_generation_enabled,
  community_voting_enabled,
  is_voting_active,
  is_qr_generation_active,
  current_voting_round,
  updated_at
) VALUES (
  1,
  false,
  false,
  false,
  false,
  1,
  NOW()
) ON CONFLICT (id) DO NOTHING;


-- ==============================================================================
-- 3. CREATE public.team_qr_codes (PERMANENT SECURE TEAM QR IDENTITY)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.team_qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  qr_token TEXT NOT NULL,
  voting_round INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  scans_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_team_round_qr UNIQUE (team_id, voting_round)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_qr_codes_token ON public.team_qr_codes(token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_qr_codes_qr_token ON public.team_qr_codes(qr_token);
CREATE INDEX IF NOT EXISTS idx_team_qr_codes_team_id ON public.team_qr_codes(team_id);

COMMENT ON TABLE public.team_qr_codes IS 'Permanent secure QR identities for teams participating in IPL 2026 Community Voting.';


-- ==============================================================================
-- 4. CREATE public.votes (AUDIT VOTE LEDGER WITH DUPLICATE PROTECTION)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  voting_round INTEGER NOT NULL DEFAULT 1,
  voter_department TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_voter_team_round UNIQUE (voter_user_id, team_id, voting_round)
);

CREATE INDEX IF NOT EXISTS idx_votes_team_id ON public.votes(team_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter_user_id ON public.votes(voter_user_id);
CREATE INDEX IF NOT EXISTS idx_votes_created_at ON public.votes(created_at DESC);

COMMENT ON TABLE public.votes IS 'Immutable audit ledger of every single vote cast in IPL 2026 Community Voting.';


-- ==============================================================================
-- 5. CREATE public.team_votes (DURABLE LEADERBOARD AGGREGATE TABLE)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.team_votes (
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  total_votes INTEGER NOT NULL DEFAULT 0,
  vote_count INTEGER NOT NULL DEFAULT 0,
  voting_round INTEGER NOT NULL DEFAULT 1,
  last_vote_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, voting_round)
);

CREATE INDEX IF NOT EXISTS idx_team_votes_ranking ON public.team_votes(total_votes DESC, last_vote_at ASC);

COMMENT ON TABLE public.team_votes IS 'Realtime aggregate vote tally per team for high-speed live leaderboard performance.';

-- Trigger to keep total_votes and vote_count aliases synchronized
CREATE OR REPLACE FUNCTION public.sync_team_votes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.total_votes IS DISTINCT FROM OLD.total_votes THEN
    NEW.vote_count := NEW.total_votes;
  ELSIF NEW.vote_count IS DISTINCT FROM OLD.vote_count THEN
    NEW.total_votes := NEW.vote_count;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_team_votes_count ON public.team_votes;
CREATE TRIGGER trg_sync_team_votes_count
BEFORE INSERT OR UPDATE ON public.team_votes
FOR EACH ROW
EXECUTE FUNCTION public.sync_team_votes_count();


-- ==============================================================================
-- 6. CREATE public.cast_vote (ATOMIC VOTING RPC FUNCTION)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.cast_vote(
  p_team_id UUID,
  p_voter_user_id UUID,
  p_voting_round INTEGER DEFAULT 1,
  p_qr_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctrl RECORD;
  v_voter_dept TEXT;
  v_voter_email TEXT;
  v_team_name TEXT;
  v_is_team_member BOOLEAN := false;
  v_has_dept_conflict BOOLEAN := false;
  v_vote_id UUID;
  v_new_total INTEGER;
BEGIN
  -- 1. Check Voting Controls: Community Voting must be active
  SELECT community_voting_enabled, is_voting_active, current_voting_round 
  INTO v_ctrl
  FROM public.voting_controls 
  WHERE id = 1;

  IF v_ctrl IS NULL OR NOT (COALESCE(v_ctrl.community_voting_enabled, false) OR COALESCE(v_ctrl.is_voting_active, false)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'VOTING_CLOSED',
      'message', 'Community Voting is currently closed or paused by Admin.'
    );
  END IF;

  -- 2. Verify Voting Round
  IF p_voting_round <> v_ctrl.current_voting_round THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_ROUND',
      'message', 'Voting round is not currently open.'
    );
  END IF;

  -- 3. Resolve authoritative voter department & email
  SELECT department, email INTO v_voter_dept, v_voter_email
  FROM public.profiles
  WHERE user_id = p_voter_user_id;

  IF v_voter_dept IS NULL OR TRIM(v_voter_dept) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'DEPARTMENT_REQUIRED',
      'message', 'Please select and save your department in your profile before voting.'
    );
  END IF;

  -- 4. Target team must exist
  SELECT team_name INTO v_team_name
  FROM public.teams
  WHERE id = p_team_id;

  IF v_team_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TEAM_NOT_FOUND',
      'message', 'Target team does not exist.'
    );
  END IF;

  -- 5. If QR token is passed, verify team_qr_codes validity
  IF p_qr_token IS NOT NULL AND TRIM(p_qr_token) <> '' THEN
    IF NOT EXISTS(
      SELECT 1 FROM public.team_qr_codes
      WHERE (token = p_qr_token OR qr_token = p_qr_token)
        AND team_id = p_team_id
        AND voting_round = p_voting_round
        AND is_active = true
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'INVALID_QR_CODE',
        'message', 'INVALID QR CODE - This QR code is not active or is not associated with this team.'
      );
    END IF;
  END IF;

  -- 6. Duplicate Vote Check: One student = one vote per team per round
  IF EXISTS(
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

  -- 7. Own Team Check: Student cannot vote for their own team
  -- Mentor is EXCLUDED from team membership check!
  IF v_voter_email IS NOT NULL AND TRIM(v_voter_email) <> '' THEN
    -- Check product_members (excluding mentors)
    SELECT EXISTS(
      SELECT 1
      FROM public.product_members pm
      JOIN public.products p ON p.id = pm.product_id
      WHERE p.team_id = p_team_id
        AND LOWER(TRIM(pm.member_email)) = LOWER(TRIM(v_voter_email))
        AND LOWER(pm.role) NOT LIKE '%mentor%'
    ) INTO v_is_team_member;

    -- Also check registrations table
    IF NOT v_is_team_member THEN
      SELECT EXISTS(
        SELECT 1
        FROM public.registrations r
        WHERE LOWER(TRIM(r.team_name)) = LOWER(TRIM(v_team_name))
          AND (
            LOWER(TRIM(r.leader_email)) = LOWER(TRIM(v_voter_email)) OR
            LOWER(TRIM(r.member2_email)) = LOWER(TRIM(v_voter_email)) OR
            LOWER(TRIM(r.member3_email)) = LOWER(TRIM(v_voter_email))
          )
      ) INTO v_is_team_member;
    END IF;
  END IF;

  IF v_is_team_member THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'OWN_TEAM_VOTE_BLOCKED',
      'message', 'YOU CAN''T VOTE FOR YOUR OWN TEAM - You cannot vote for your own team.'
    );
  END IF;

  -- 8. Department Conflict Check: Cannot vote for team containing a member from voter''s department
  -- Mentor department is STRICTLY EXCLUDED!
  -- Check product_members + departments table
  SELECT EXISTS(
    SELECT 1
    FROM public.product_members pm
    JOIN public.products p ON p.id = pm.product_id
    JOIN public.departments d ON d.id = pm.department_id
    WHERE p.team_id = p_team_id
      AND LOWER(pm.role) NOT LIKE '%mentor%'
      AND LOWER(TRIM(d.name)) = LOWER(TRIM(v_voter_dept))
  ) INTO v_has_dept_conflict;

  -- Also check registrations table (leader_department, member2_department, member3_department)
  -- Mentor department is IGNORED!
  IF NOT v_has_dept_conflict THEN
    SELECT EXISTS(
      SELECT 1
      FROM public.registrations r
      WHERE LOWER(TRIM(r.team_name)) = LOWER(TRIM(v_team_name))
        AND (
          LOWER(TRIM(r.leader_department)) = LOWER(TRIM(v_voter_dept)) OR
          LOWER(TRIM(r.member2_department)) = LOWER(TRIM(v_voter_dept)) OR
          LOWER(TRIM(r.member3_department)) = LOWER(TRIM(v_voter_dept))
        )
    ) INTO v_has_dept_conflict;
  END IF;

  IF v_has_dept_conflict THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'VOTING_NOT_ALLOWED',
      'message', 'VOTING NOT ALLOWED - You cannot vote for a team containing a leader/member from your department (' || v_voter_dept || '). Mentor department is ignored.'
    );
  END IF;

  -- 9. Insert Vote into public.votes
  INSERT INTO public.votes (
    voter_user_id,
    team_id,
    voting_round,
    voter_department,
    created_at
  ) VALUES (
    p_voter_user_id,
    p_team_id,
    p_voting_round,
    v_voter_dept,
    NOW()
  ) RETURNING id INTO v_vote_id;

  -- 10. Increment aggregate in public.team_votes atomically
  INSERT INTO public.team_votes (
    team_id,
    total_votes,
    vote_count,
    voting_round,
    last_vote_at,
    updated_at
  ) VALUES (
    p_team_id,
    1,
    1,
    p_voting_round,
    NOW(),
    NOW()
  )
  ON CONFLICT (team_id, voting_round) DO UPDATE
  SET total_votes = public.team_votes.total_votes + 1,
      vote_count = public.team_votes.vote_count + 1,
      last_vote_at = NOW(),
      updated_at = NOW()
  RETURNING total_votes INTO v_new_total;

  -- 11. Increment scans_count on QR if token was provided
  IF p_qr_token IS NOT NULL AND TRIM(p_qr_token) <> '' THEN
    UPDATE public.team_qr_codes
    SET scans_count = scans_count + 1,
        updated_at = NOW()
    WHERE (token = p_qr_token OR qr_token = p_qr_token);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'vote_id', v_vote_id,
    'team_id', p_team_id,
    'team_name', v_team_name,
    'new_vote_count', v_new_total,
    'voter_department', v_voter_dept,
    'message', 'Your vote for ' || v_team_name || ' has been recorded successfully!'
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_VOTED',
      'message', 'You have already voted for this team in this voting round.'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TRANSACTION_ERROR',
      'message', SQLERRM
    );
END;
$$;


-- ==============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- voting_controls: Public read, service_role / admin write
ALTER TABLE public.voting_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read voting_controls" ON public.voting_controls;
CREATE POLICY "Allow public read voting_controls"
ON public.voting_controls FOR SELECT
USING (true);

-- team_qr_codes: Authenticated read
ALTER TABLE public.team_qr_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read team_qr_codes" ON public.team_qr_codes;
CREATE POLICY "Allow authenticated read team_qr_codes"
ON public.team_qr_codes FOR SELECT
TO authenticated
USING (true);

-- team_votes: Public read for live leaderboard
ALTER TABLE public.team_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read team_votes" ON public.team_votes;
CREATE POLICY "Allow public read team_votes"
ON public.team_votes FOR SELECT
USING (true);

-- votes: Voter can view only their own votes; direct insert blocked (must use cast_vote RPC)
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own votes" ON public.votes;
CREATE POLICY "Users can view own votes"
ON public.votes FOR SELECT
TO authenticated
USING (auth.uid() = voter_user_id);


-- ==============================================================================
-- 8. SUPABASE REALTIME CONFIGURATION
-- ==============================================================================
ALTER TABLE public.team_votes REPLICA IDENTITY FULL;
ALTER TABLE public.voting_controls REPLICA IDENTITY FULL;

DO $$
BEGIN
  -- Add team_votes to realtime publication if publication exists
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'team_votes'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.team_votes;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'voting_controls'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.voting_controls;
    END IF;
  END IF;
END;
$$;


-- ==============================================================================
-- 9. VERIFICATION QUERY
-- ==============================================================================
SELECT 'voting_controls' AS object_name, COUNT(*)::text AS details FROM public.voting_controls
UNION ALL
SELECT 'team_qr_codes', COUNT(*)::text FROM public.team_qr_codes
UNION ALL
SELECT 'team_votes', COUNT(*)::text FROM public.team_votes
UNION ALL
SELECT 'votes', COUNT(*)::text FROM public.votes
UNION ALL
SELECT 'profiles_with_department', COUNT(*)::text FROM public.profiles WHERE department IS NOT NULL;
