-- ==============================================================================
-- STAGE 18: ADMIN LIKE ON/OFF CONTROL
-- Additive, non-destructive migration for independent Likes control
-- ==============================================================================

-- 1. Add is_likes_active column to public.voting_controls if not exists
ALTER TABLE public.voting_controls 
ADD COLUMN IF NOT EXISTS is_likes_active BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.voting_controls.is_likes_active IS 'Authoritative Admin ON/OFF switch for public idea likes. Defaults to TRUE.';

-- 2. Update existing controls row to ensure default is true
UPDATE public.voting_controls
SET is_likes_active = TRUE
WHERE id = 1 AND is_likes_active IS NULL;
