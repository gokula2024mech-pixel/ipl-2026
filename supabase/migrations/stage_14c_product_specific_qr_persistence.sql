-- ==============================================================================
-- STAGE 14C: Product-Specific QR Persistence & Constraint Alignment
-- IPL-2026 Platform
-- Architecture: Product-Aware QR Uniqueness & Legacy Compatibility
--
-- IMPORTANT:
-- This script adjusts the uniqueness model on public.team_qr_codes to allow
-- multi-product teams to persist separate, dedicated QR codes for each product
-- in the same voting round, while preserving legacy QR rows (product_id IS NULL).
--
-- Execution: Run this script in your Supabase Dashboard -> SQL Editor
-- ==============================================================================

BEGIN;

-- 1. DROP LEGACY TEAM-LEVEL UNIQUENESS CONSTRAINTS
-- These legacy constraints restricted each team to strictly 1 QR row per team / round.
ALTER TABLE public.team_qr_codes
DROP CONSTRAINT IF EXISTS unique_team_round_qr;

ALTER TABLE public.team_qr_codes
DROP CONSTRAINT IF EXISTS unique_team_qr;

-- 2. CREATE PRODUCT-AWARE PARTIAL UNIQUE INDEX
-- Allows each team to have multiple distinct product QR rows in the same round,
-- but prevents duplicate QR generation for the same exact product.
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_qr_product_round
ON public.team_qr_codes (team_id, product_id, voting_round)
WHERE product_id IS NOT NULL;

-- 3. PRESERVE LEGACY QR UNIQUENESS
-- Ensures that teams with legacy QRs (where product_id IS NULL) maintain at most
-- 1 legacy QR row per voting round.
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_qr_legacy_round
ON public.team_qr_codes (team_id, voting_round)
WHERE product_id IS NULL;

COMMIT;
