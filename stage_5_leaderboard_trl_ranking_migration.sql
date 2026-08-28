-- IPL-2026 Supabase Migration
-- Stage 5: TRL-Only Team Leaderboard
--
-- Ranking:
--   1. Highest TRL
--   2. Earlier submission time
--   3. Team ID (stable final tie-breaker)
--
-- IMPORTANT:
-- This function does NOT use evaluation scores or product count
-- for leaderboard ranking.

CREATE OR REPLACE FUNCTION public.get_leaderboard_v2()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$

WITH product_leaders AS (
  SELECT
    pm.product_id,
    pm.department_id,
    pm.member_email,
    ROW_NUMBER() OVER (
      PARTITION BY pm.product_id
      ORDER BY
        CASE
          WHEN pm.is_team_leader = true
            OR pm.role = 'Team Leader'
          THEN 1
          ELSE 2
        END,
        pm.created_at ASC,
        pm.id ASC
    ) AS rn
  FROM public.product_members pm
),

resolved_product_leaders AS (
  SELECT
    product_id,
    department_id,
    member_email
  FROM product_leaders
  WHERE rn = 1
),

product_departments AS (
  SELECT
    p.id AS product_id,
    p.team_id,
    p.innovation_domain,
    p.created_at,
    p.product_number,
    p.trl_level,
    p.product_title,
    COALESCE(d.name, 'Unknown Department') AS department_name
  FROM public.products p
  LEFT JOIN resolved_product_leaders rpl
    ON rpl.product_id = p.id
  LEFT JOIN public.departments d
    ON d.id = rpl.department_id
   AND d.is_active = true
),

team_departments_ranked AS (
  SELECT
    team_id,
    department_name,
    ROW_NUMBER() OVER (
      PARTITION BY team_id
      ORDER BY
        CASE
          WHEN product_number = 1 THEN 1
          ELSE 2
        END,
        created_at ASC,
        product_id ASC
    ) AS rn
  FROM product_departments
),

team_departments AS (
  SELECT
    team_id,
    department_name
  FROM team_departments_ranked
  WHERE rn = 1
),

/*
  Select the highest-TRL active product for each team.
  If two products have the same TRL, the earlier product
  submission is selected as the leading product.
*/
leading_products AS (
  SELECT
    p.team_id,
    p.product_title,
    p.trl_level,
    p.created_at,
    p.id AS product_id,
    ROW_NUMBER() OVER (
      PARTITION BY p.team_id
      ORDER BY
        p.trl_level DESC NULLS LAST,
        p.created_at ASC,
        p.id ASC
    ) AS rn
  FROM public.products p
  WHERE p.status = 'active'
),

team_metrics AS (
  SELECT
    t.id AS team_id,
    t.team_name,

    COALESCE(
      td.department_name,
      'Unknown Department'
    ) AS department_name,

    COUNT(p.id) AS ideas_count,

    MIN(p.created_at) AS earliest_time,

    /*
      Official leaderboard score:
      highest TRL achieved by the team.
    */
    MAX(p.trl_level) AS highest_trl,

    lp.product_title AS leading_product_title

  FROM public.teams t

  LEFT JOIN public.products p
    ON p.team_id = t.id
   AND p.status = 'active'

  LEFT JOIN team_departments td
    ON td.team_id = t.id

  LEFT JOIN leading_products lp
    ON lp.team_id = t.id
   AND lp.rn = 1

  GROUP BY
    t.id,
    t.team_name,
    td.department_name,
    lp.product_title
),

team_rankings AS (
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY
        /*
          PRIMARY:
          Highest TRL
        */
        highest_trl DESC NULLS LAST,

        /*
          SECONDARY:
          Earlier team submission
        */
        COALESCE(
          earliest_time,
          '9999-12-31 23:59:59+00'::timestamptz
        ) ASC,

        /*
          FINAL:
          Stable deterministic ordering
        */
        team_id ASC
    ) AS rank,

    team_id AS id,
    team_name,
    department_name AS department,
    ideas_count AS ideas,
    earliest_time,
    highest_trl,
    leading_product_title

  FROM team_metrics
),

active_departments AS (
  SELECT name
  FROM public.departments
  WHERE is_active = true

  UNION

  SELECT 'Unknown Department'
),

dept_aggregates AS (
  SELECT
    pd.department_name,
    COUNT(DISTINCT pd.team_id) AS teams_count,
    COUNT(pd.product_id) AS ideas_count,
    MIN(pd.created_at) AS earliest_time
  FROM product_departments pd
  GROUP BY pd.department_name
),

dept_student_counts AS (
  SELECT
    pd.department_name,
    COUNT(
      DISTINCT LOWER(TRIM(pm.member_email))
    ) AS students_count
  FROM product_departments pd
  JOIN public.product_members pm
    ON pm.product_id = pd.product_id
  WHERE
    pm.member_email IS NOT NULL
    AND TRIM(pm.member_email) <> ''
  GROUP BY pd.department_name
),

dept_metrics AS (
  SELECT
    ad.name AS department,
    COALESCE(da.teams_count, 0) AS teams,
    COALESCE(da.ideas_count, 0) AS ideas,
    COALESCE(dsc.students_count, 0) AS students,
    da.earliest_time

  FROM active_departments ad

  LEFT JOIN dept_aggregates da
    ON da.department_name = ad.name

  LEFT JOIN dept_student_counts dsc
    ON dsc.department_name = ad.name

  WHERE
    ad.name <> 'Unknown Department'
    OR COALESCE(da.ideas_count, 0) > 0
),

dept_rankings AS (
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY
        ideas DESC,
        COALESCE(
          earliest_time,
          '9999-12-31 23:59:59+00'::timestamptz
        ) ASC,
        department ASC
    ) AS rank,

    department AS id,
    department,
    teams,
    ideas,
    students,
    earliest_time

  FROM dept_metrics
),

domain_products AS (
  SELECT
    p.id AS product_id,
    p.team_id,
    p.created_at,
    COALESCE(
      NULLIF(TRIM(p.innovation_domain), ''),
      'Open Innovation'
    ) AS domain_name

  FROM public.products p
),

domain_aggregates AS (
  SELECT
    dp.domain_name,
    COUNT(DISTINCT dp.team_id) AS teams_count,
    COUNT(dp.product_id) AS ideas_count,
    MIN(dp.created_at) AS earliest_time

  FROM domain_products dp
  GROUP BY dp.domain_name
),

domain_student_counts AS (
  SELECT
    dp.domain_name,
    COUNT(
      DISTINCT LOWER(TRIM(pm.member_email))
    ) AS students_count

  FROM domain_products dp

  JOIN public.product_members pm
    ON pm.product_id = dp.product_id

  WHERE
    pm.member_email IS NOT NULL
    AND TRIM(pm.member_email) <> ''

  GROUP BY dp.domain_name
),

domain_metrics AS (
  SELECT
    da.domain_name AS domain,
    da.teams_count AS teams,
    da.ideas_count AS ideas,
    COALESCE(dsc.students_count, 0) AS students,
    da.earliest_time

  FROM domain_aggregates da

  LEFT JOIN domain_student_counts dsc
    ON dsc.domain_name = da.domain_name
),

domain_rankings AS (
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY
        ideas DESC,
        COALESCE(
          earliest_time,
          '9999-12-31 23:59:59+00'::timestamptz
        ) ASC,
        domain ASC
    ) AS rank,

    domain AS id,
    domain,
    teams,
    ideas,
    students,
    earliest_time

  FROM domain_metrics
),

kpis AS (
  SELECT

    (
      SELECT COUNT(*)
      FROM public.teams
    ) AS total_teams,

    (
      SELECT COUNT(
        DISTINCT LOWER(TRIM(member_email))
      )
      FROM public.product_members
      WHERE
        member_email IS NOT NULL
        AND TRIM(member_email) <> ''
    ) AS total_students,

    (
      SELECT COUNT(*)
      FROM public.products
    ) AS total_ideas,

    (
      SELECT COUNT(*)
      FROM public.departments
      WHERE is_active = true
    ) AS total_departments,

    (
      SELECT COUNT(
        DISTINCT COALESCE(
          NULLIF(TRIM(innovation_domain), ''),
          'Open Innovation'
        )
      )
      FROM public.products
    ) AS total_domains
)

SELECT json_build_object(

  'kpis',
  (
    SELECT json_build_object(
      'totalTeams', total_teams,
      'totalStudents', total_students,
      'totalIdeas', total_ideas,
      'totalDepartments', total_departments,
      'totalDomains', total_domains
    )
    FROM kpis
  ),

  'team_rankings',
  (
    SELECT json_agg(
      json_build_object(
        'rank', rank,
        'id', id,
        'teamName', team_name,
        'department', department,
        'ideas', ideas,
        'earliestTime', earliest_time,
        'highestTrl', highest_trl,
        'leadingProductTitle', leading_product_title
      )
      ORDER BY rank
    )
    FROM team_rankings
  ),

  'dept_rankings',
  (
    SELECT json_agg(
      json_build_object(
        'rank', rank,
        'id', id,
        'department', department,
        'teams', teams,
        'ideas', ideas,
        'students', students,
        'earliestTime', earliest_time
      )
      ORDER BY rank
    )
    FROM dept_rankings
  ),

  'domain_rankings',
  (
    SELECT json_agg(
      json_build_object(
        'rank', rank,
        'id', id,
        'domain', domain,
        'teams', teams,
        'ideas', ideas,
        'students', students,
        'earliestTime', earliest_time
      )
      ORDER BY rank
    )
    FROM domain_rankings
  )

);

$function$;

GRANT EXECUTE
ON FUNCTION public.get_leaderboard_v2()
TO anon, authenticated;