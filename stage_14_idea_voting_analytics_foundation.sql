-- ==============================================================================
-- STAGE 14: Idea Voting, Likes, & Visit Analytics Foundation
-- IPL-2026 Platform
-- Architecture: Product/Idea-Level Liking, Voting, & Visit Analytics
-- 
-- IMPORTANT:
-- This script is strictly ADDITIVE. It does NOT delete, rename, or modify
-- existing tables (registrations, teams, products, product_members, profiles,
-- departments, votes, team_votes, voting_controls).
-- 
-- Future Scoring Formula:
-- TOTAL SCORE = LIKES + (VOTES × 2)
-- Visits are strictly for analytics and DO NOT contribute to score.
-- 
-- Execution: Run this script in your Supabase Dashboard -> SQL Editor
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLE: public.idea_likes (IDEA-BASED LIKES)
-- ==============================================================================
-- Supports both authenticated users and anonymous visitors (+1 mark).
-- Enforces: One Like per idea for the same recognized visitor token or user ID.
-- IP hash is stored strictly as an abuse-prevention/rate-limiting signal (never raw IP).
CREATE TABLE IF NOT EXISTS public.idea_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  voter_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  visitor_token TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_idea_likes_identity CHECK (
    voter_user_id IS NOT NULL OR (visitor_token IS NOT NULL AND TRIM(visitor_token) <> '')
  )
);

COMMENT ON TABLE public.idea_likes IS 'Additive table tracking public and authenticated likes for individual innovation products/ideas.';

-- Indexes for performance & rate limiting
CREATE INDEX IF NOT EXISTS idx_idea_likes_product_id ON public.idea_likes (product_id);
CREATE INDEX IF NOT EXISTS idx_idea_likes_ip_time ON public.idea_likes (ip_hash, created_at DESC);

-- Partial Unique Index 1: One Like per idea per authenticated user
CREATE UNIQUE INDEX IF NOT EXISTS idx_idea_likes_user_product 
ON public.idea_likes (product_id, voter_user_id) 
WHERE voter_user_id IS NOT NULL;

-- Partial Unique Index 2: One Like per idea per anonymous visitor token
CREATE UNIQUE INDEX IF NOT EXISTS idx_idea_likes_visitor_product 
ON public.idea_likes (product_id, visitor_token) 
WHERE visitor_token IS NOT NULL AND voter_user_id IS NULL;


-- ==============================================================================
-- 2. TABLE: public.idea_visits (IDEA-PAGE VISIT ANALYTICS)
-- ==============================================================================
-- Tracks page views/impressions to specific idea pages strictly for analytics.
-- Visits DO NOT contribute to score or marks.
CREATE TABLE IF NOT EXISTS public.idea_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  visitor_token TEXT,
  ip_hash TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_agent TEXT,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.idea_visits IS 'Analytics ledger for page views of specific idea pages. Visits do not affect scoring.';

-- Indexes for analytics querying & export
CREATE INDEX IF NOT EXISTS idx_idea_visits_product_id ON public.idea_visits (product_id);
CREATE INDEX IF NOT EXISTS idx_idea_visits_visited_at ON public.idea_visits (visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_idea_visits_product_time ON public.idea_visits (product_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_idea_visits_ip_time ON public.idea_visits (ip_hash, visited_at DESC);


-- ==============================================================================
-- 3. TABLE: public.product_votes (PRODUCT-LEVEL VOTE LEDGER)
-- ==============================================================================
-- Individual vote ledger for product/idea-level voting (+2 marks).
-- Enforces: ONE vote per user per product per round.
-- Keyed on (voter_user_id, product_id, voting_round) - NOT team_id - to cleanly
-- support multi-product teams.
CREATE TABLE IF NOT EXISTS public.product_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  voter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  team_id UUID REFERENCES public.teams(id) ON DELETE RESTRICT,
  voter_department TEXT NOT NULL,
  voting_round INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_voter_product_round UNIQUE (voter_user_id, product_id, voting_round)
);

COMMENT ON TABLE public.product_votes IS 'Audit ledger of every verified vote cast for an individual innovation product/idea.';

-- Indexes for high-concurrency lookup & duplicate prevention
CREATE INDEX IF NOT EXISTS idx_product_votes_product_round ON public.product_votes (product_id, voting_round);
CREATE INDEX IF NOT EXISTS idx_product_votes_voter_round ON public.product_votes (voter_user_id, voting_round);
CREATE INDEX IF NOT EXISTS idx_product_votes_team_round ON public.product_votes (team_id, voting_round);


-- ==============================================================================
-- 4. TABLE: public.product_vote_counts (PRODUCT VOTE AGGREGATE TALLIES)
-- ==============================================================================
-- High-speed aggregate tally table to avoid full-table COUNT(*) queries.
CREATE TABLE IF NOT EXISTS public.product_vote_counts (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  voting_round INTEGER NOT NULL DEFAULT 1,
  vote_count INTEGER NOT NULL DEFAULT 0,
  total_votes INTEGER NOT NULL DEFAULT 0,
  last_vote_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, voting_round)
);

COMMENT ON TABLE public.product_vote_counts IS 'Realtime aggregate vote tally per product for high-speed live leaderboard performance.';

-- Sync trigger to keep vote_count and total_votes aliases synchronized
CREATE OR REPLACE FUNCTION public.sync_product_vote_counts()
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

DROP TRIGGER IF EXISTS trg_sync_product_vote_counts ON public.product_vote_counts;
CREATE TRIGGER trg_sync_product_vote_counts
BEFORE INSERT OR UPDATE ON public.product_vote_counts
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_vote_counts();

CREATE INDEX IF NOT EXISTS idx_product_vote_counts_ranking 
ON public.product_vote_counts (voting_round, vote_count DESC, last_vote_at ASC);

CREATE INDEX IF NOT EXISTS idx_product_vote_counts_team 
ON public.product_vote_counts (team_id);


-- ==============================================================================
-- 5. QR COMPATIBILITY: ADDITIVE product_id ON public.team_qr_codes
-- ==============================================================================
-- Safely add nullable product_id column to prepare for future product-targeted QR codes.
-- Existing team_id, token, qr_token, and constraints remain 100% functional.
ALTER TABLE public.team_qr_codes 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_qr_codes_product_id ON public.team_qr_codes(product_id);


-- ==============================================================================
-- 6. SCORING FOUNDATION VIEW: public.idea_scores
-- ==============================================================================
-- Future Formula: TOTAL SCORE = LIKES + (VOTES × 2)
-- Raw likes_count and votes_count are kept separate from calculated total_score.
-- Visits are strictly excluded from score calculation.
CREATE OR REPLACE VIEW public.idea_scores AS
WITH like_counts AS (
  SELECT product_id, COUNT(*)::INTEGER AS likes_count
  FROM public.idea_likes
  GROUP BY product_id
),
vote_counts AS (
  SELECT product_id, voting_round, vote_count AS votes_count, last_vote_at
  FROM public.product_vote_counts
)
SELECT 
  p.id AS product_id,
  p.team_id,
  p.product_title,
  t.team_name,
  COALESCE(vc.voting_round, 1) AS voting_round,
  COALESCE(lc.likes_count, 0) AS likes_count,
  COALESCE(vc.votes_count, 0) AS votes_count,
  (COALESCE(lc.likes_count, 0) + (COALESCE(vc.votes_count, 0) * 2))::INTEGER AS total_score,
  vc.last_vote_at,
  p.created_at
FROM public.products p
JOIN public.teams t ON t.id = p.team_id
LEFT JOIN like_counts lc ON lc.product_id = p.id
LEFT JOIN vote_counts vc ON vc.product_id = p.id
WHERE COALESCE(p.status, 'active') = 'active';

COMMENT ON VIEW public.idea_scores IS 'Dynamic calculation view: total_score = likes + (votes * 2). Visits are not in score.';


-- ==============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- A. public.idea_likes
ALTER TABLE public.idea_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read of idea_likes" ON public.idea_likes;
CREATE POLICY "Allow public read of idea_likes"
ON public.idea_likes FOR SELECT
USING (true);

-- Direct client-side INSERT is strictly disallowed for both anon and authenticated.
-- All like writes must be routed exclusively through the SECURITY DEFINER RPC record_idea_like or backend service role.
DROP POLICY IF EXISTS "Allow authenticated user to insert own like" ON public.idea_likes;
DROP POLICY IF EXISTS "Allow anon insert like" ON public.idea_likes;

-- B. public.idea_visits
ALTER TABLE public.idea_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view idea_visits" ON public.idea_visits;
CREATE POLICY "Admins can view idea_visits"
ON public.idea_visits FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
  )
);

-- C. public.product_votes
ALTER TABLE public.product_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Voters can view own product votes" ON public.product_votes;
CREATE POLICY "Voters can view own product votes"
ON public.product_votes FOR SELECT
TO authenticated
USING (auth.uid() = voter_user_id);

DROP POLICY IF EXISTS "Admins can view all product votes" ON public.product_votes;
CREATE POLICY "Admins can view all product votes"
ON public.product_votes FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
  )
);

-- D. public.product_vote_counts
ALTER TABLE public.product_vote_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read product_vote_counts" ON public.product_vote_counts;
CREATE POLICY "Allow public read product_vote_counts"
ON public.product_vote_counts FOR SELECT
USING (true);


-- ==============================================================================
-- 8. HELPER RPC FUNCTIONS (SECURITY DEFINER)
-- ==============================================================================

-- A. Atomic Like Submission Function
CREATE OR REPLACE FUNCTION public.record_idea_like(
  p_product_id UUID,
  p_visitor_token TEXT DEFAULT NULL,
  p_ip_hash TEXT DEFAULT NULL,
  p_voter_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_effective_user_id UUID;
  v_effective_visitor_token TEXT;
  v_product_exists BOOLEAN;
  v_new_like_count INTEGER;
BEGIN
  -- Determine effective identity (prefer authenticated auth.uid() over parameter)
  v_effective_user_id := COALESCE(auth.uid(), p_voter_user_id);
  v_effective_visitor_token := NULLIF(TRIM(p_visitor_token), '');

  IF v_effective_user_id IS NULL AND v_effective_visitor_token IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'IDENTITY_REQUIRED',
      'message', 'A valid visitor token or authenticated user session is required to like an idea.'
    );
  END IF;

  -- Verify product exists and is active
  SELECT EXISTS (
    SELECT 1 FROM public.products 
    WHERE id = p_product_id AND COALESCE(status, 'active') = 'active'
  ) INTO v_product_exists;

  IF NOT v_product_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'PRODUCT_NOT_FOUND',
      'message', 'The requested innovation idea does not exist.'
    );
  END IF;

  -- Layered Rate Limiting Hook (Abuse prevention via IP Hash)
  IF p_ip_hash IS NOT NULL AND TRIM(p_ip_hash) <> '' THEN
    IF (
      SELECT COUNT(*) 
      FROM public.idea_likes 
      WHERE ip_hash = p_ip_hash 
        AND created_at > NOW() - INTERVAL '1 minute'
    ) >= 30 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'RATE_LIMITED',
        'message', 'Too many like requests from this network. Please try again shortly.'
      );
    END IF;
  END IF;

  -- Check duplicate like for authenticated user (checks user ID and visitor token)
  IF v_effective_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.idea_likes
      WHERE product_id = p_product_id 
        AND (
          voter_user_id = v_effective_user_id 
          OR (v_effective_visitor_token IS NOT NULL AND visitor_token = v_effective_visitor_token)
        )
    ) THEN
      SELECT COUNT(*)::INTEGER INTO v_new_like_count FROM public.idea_likes WHERE product_id = p_product_id;
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'ALREADY_LIKED',
        'message', 'You have already liked this idea.',
        'likes_count', v_new_like_count
      );
    END IF;
  -- Check duplicate like for anonymous visitor token
  ELSIF v_effective_visitor_token IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.idea_likes
      WHERE product_id = p_product_id AND visitor_token = v_effective_visitor_token
    ) THEN
      SELECT COUNT(*)::INTEGER INTO v_new_like_count FROM public.idea_likes WHERE product_id = p_product_id;
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'ALREADY_LIKED',
        'message', 'You have already liked this idea.',
        'likes_count', v_new_like_count
      );
    END IF;
  END IF;

  -- Insert like record
  BEGIN
    INSERT INTO public.idea_likes (
      product_id,
      voter_user_id,
      visitor_token,
      ip_hash,
      created_at
    ) VALUES (
      p_product_id,
      v_effective_user_id,
      v_effective_visitor_token,
      p_ip_hash,
      NOW()
    );
  EXCEPTION
    WHEN unique_violation THEN
      SELECT COUNT(*)::INTEGER INTO v_new_like_count FROM public.idea_likes WHERE product_id = p_product_id;
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'ALREADY_LIKED',
        'message', 'You have already liked this idea.',
        'likes_count', v_new_like_count
      );
  END;

  SELECT COUNT(*)::INTEGER INTO v_new_like_count FROM public.idea_likes WHERE product_id = p_product_id;

  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'likes_count', v_new_like_count,
    'message', 'Idea liked successfully!'
  );
END;
$$;

-- B. Atomic Visit Recording Function (Analytics only, strictly decoupled from score)
CREATE OR REPLACE FUNCTION public.record_idea_visit(
  p_product_id UUID,
  p_visitor_token TEXT DEFAULT NULL,
  p_ip_hash TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_effective_user_id UUID;
  v_product_exists BOOLEAN;
BEGIN
  -- Validate that product exists and is active
  SELECT EXISTS (
    SELECT 1 FROM public.products 
    WHERE id = p_product_id AND COALESCE(status, 'active') = 'active'
  ) INTO v_product_exists;

  IF NOT v_product_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'PRODUCT_NOT_FOUND',
      'message', 'The requested innovation idea does not exist.'
    );
  END IF;

  v_effective_user_id := COALESCE(auth.uid(), p_user_id);

  INSERT INTO public.idea_visits (
    product_id,
    visitor_token,
    ip_hash,
    user_id,
    user_agent,
    visited_at
  ) VALUES (
    p_product_id,
    NULLIF(TRIM(p_visitor_token), ''),
    p_ip_hash,
    v_effective_user_id,
    p_user_agent,
    NOW()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_idea_like(UUID, TEXT, TEXT, UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_idea_visit(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated, anon, service_role;


-- ==============================================================================
-- 9. SUPABASE REALTIME CONFIGURATION
-- ==============================================================================
ALTER TABLE public.product_vote_counts REPLICA IDENTITY FULL;
ALTER TABLE public.idea_likes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Add product_vote_counts to realtime publication if not already present
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'product_vote_counts'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.product_vote_counts;
    END IF;

    -- Add idea_likes to realtime publication if not already present
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'idea_likes'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.idea_likes;
    END IF;
  END IF;
END;
$$;

COMMIT;
