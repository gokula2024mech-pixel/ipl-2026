-- IPL-2026 Supabase Additive Migration Script for Leaderboard RPC Function
-- Run this script manually in your Supabase Dashboard -> SQL Editor

-- Create the security-definer function to retrieve aggregated statistics safely
CREATE OR REPLACE FUNCTION public.get_leaderboard_v2()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH product_leaders AS (
  -- 1. Identify the authoritative team leader for each product/idea
  SELECT 
    pm.product_id,
    pm.department_id,
    pm.member_email,
    ROW_NUMBER() OVER (
      PARTITION BY pm.product_id 
      ORDER BY 
        CASE WHEN pm.is_team_leader = true OR pm.role = 'Team Leader' THEN 1 ELSE 2 END,
        pm.created_at ASC,
        pm.id ASC
    ) as rn
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
  -- 2. Resolve the department name for each product
  SELECT 
    p.id AS product_id,
    p.team_id,
    p.innovation_domain,
    p.created_at,
    p.product_number,
    COALESCE(d.name, 'Unknown Department') AS department_name
  FROM public.products p
  LEFT JOIN resolved_product_leaders rpl ON rpl.product_id = p.id
  LEFT JOIN public.departments d ON d.id = rpl.department_id AND d.is_active = true
),
team_departments_ranked AS (
  -- 3. Resolve the department for each team based on its product #1's leader (or first product)
  SELECT 
    team_id,
    department_name,
    ROW_NUMBER() OVER (
      PARTITION BY team_id 
      ORDER BY 
        CASE WHEN product_number = 1 THEN 1 ELSE 2 END,
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
team_metrics AS (
  -- 4. Calculate total ideas and earliest submission timestamp per team
  SELECT 
    t.id AS team_id,
    t.team_name,
    COALESCE(td.department_name, 'Unknown Department') AS department_name,
    COUNT(p.id) AS ideas_count,
    MIN(p.created_at) AS earliest_time
  FROM public.teams t
  LEFT JOIN public.products p ON p.team_id = t.id
  LEFT JOIN team_departments td ON td.team_id = t.id
  GROUP BY t.id, t.team_name, td.department_name
),
team_rankings AS (
  -- 5. Sort teams: total ideas DESC, earliest submission ASC, ID comparison ASC (fallback)
  SELECT 
    ROW_NUMBER() OVER (
      ORDER BY 
        ideas_count DESC, 
        COALESCE(earliest_time, '9999-12-31 23:59:59+00'::timestamptz) ASC,
        team_id ASC
    ) AS rank,
    team_id AS id,
    team_name,
    department_name AS department,
    ideas_count AS ideas,
    earliest_time
  FROM team_metrics
),
active_departments AS (
  -- 6. Collect active departments plus Unknown Department
  SELECT name FROM public.departments WHERE is_active = true
  UNION
  SELECT 'Unknown Department' AS name
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
    COUNT(DISTINCT LOWER(TRIM(pm.member_email))) AS students_count
  FROM product_departments pd
  JOIN public.product_members pm ON pm.product_id = pd.product_id
  WHERE pm.member_email IS NOT NULL AND TRIM(pm.member_email) <> ''
  GROUP BY pd.department_name
),
dept_metrics AS (
  -- 7. Gather department metrics, only retaining Unknown Department if active ideas exist
  SELECT 
    ad.name AS department,
    COALESCE(da.teams_count, 0) AS teams,
    COALESCE(da.ideas_count, 0) AS ideas,
    COALESCE(dsc.students_count, 0) AS students,
    da.earliest_time
  FROM active_departments ad
  LEFT JOIN dept_aggregates da ON da.department_name = ad.name
  LEFT JOIN dept_student_counts dsc ON dsc.department_name = ad.name
  WHERE ad.name <> 'Unknown Department' OR COALESCE(da.ideas_count, 0) > 0
),
dept_rankings AS (
  -- 8. Sort departments: ideas DESC, earliest submission ASC, name fallback
  SELECT 
    ROW_NUMBER() OVER (
      ORDER BY 
        ideas DESC, 
        COALESCE(earliest_time, '9999-12-31 23:59:59+00'::timestamptz) ASC,
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
  -- 9. Resolve domain names with Open Innovation fallback
  SELECT 
    p.id AS product_id,
    p.team_id,
    p.created_at,
    COALESCE(NULLIF(TRIM(p.innovation_domain), ''), 'Open Innovation') AS domain_name
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
    COUNT(DISTINCT LOWER(TRIM(pm.member_email))) AS students_count
  FROM domain_products dp
  JOIN public.product_members pm ON pm.product_id = dp.product_id
  WHERE pm.member_email IS NOT NULL AND TRIM(pm.member_email) <> ''
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
  LEFT JOIN domain_student_counts dsc ON dsc.domain_name = da.domain_name
),
domain_rankings AS (
  -- 10. Sort domains: ideas DESC, earliest submission ASC, domain fallback
  SELECT 
    ROW_NUMBER() OVER (
      ORDER BY 
        ideas DESC, 
        COALESCE(earliest_time, '9999-12-31 23:59:59+00'::timestamptz) ASC,
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
  -- 11. Compile ecosystem metrics
  SELECT 
    (SELECT COUNT(*) FROM public.teams) AS total_teams,
    (SELECT COUNT(DISTINCT LOWER(TRIM(member_email))) FROM public.product_members WHERE member_email IS NOT NULL AND TRIM(member_email) <> '') AS total_students,
    (SELECT COUNT(*) FROM public.products) AS total_ideas,
    (SELECT COUNT(*) FROM public.departments WHERE is_active = true) AS total_departments,
    (SELECT COUNT(DISTINCT COALESCE(NULLIF(TRIM(innovation_domain), ''), 'Open Innovation')) FROM public.products) AS total_domains
)
-- 12. Format and output unified JSON payload
SELECT json_build_object(
  'kpis', (SELECT json_build_object(
    'totalTeams', total_teams,
    'totalStudents', total_students,
    'totalIdeas', total_ideas,
    'totalDepartments', total_departments,
    'totalDomains', total_domains
  ) FROM kpis),
  'team_rankings', (SELECT json_agg(json_build_object(
    'rank', rank,
    'id', id,
    'teamName', team_name,
    'department', department,
    'ideas', ideas,
    'earliestTime', earliest_time
  )) FROM team_rankings),
  'dept_rankings', (SELECT json_agg(json_build_object(
    'rank', rank,
    'id', id,
    'department', department,
    'teams', teams,
    'ideas', ideas,
    'students', students,
    'earliestTime', earliest_time
  )) FROM dept_rankings),
  'domain_rankings', (SELECT json_agg(json_build_object(
    'rank', rank,
    'id', id,
    'domain', domain,
    'teams', teams,
    'ideas', ideas,
    'students', students,
    'earliestTime', earliest_time
  )) FROM domain_rankings)
);
$$;

-- Grant execution privileges to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION public.get_leaderboard_v2() TO anon, authenticated;
