const express = require('express')
const router = express.Router()
const path = require('path')
const upload = require('../middleware/upload')
const { supabase, BUCKET_NAME } = require('../supabaseClient')

// Official 13 IPL-2026 Innovation Domains
const OFFICIAL_DOMAINS = [
  'Smart Manufacturing & Industry 4.0',
  'Robotics & Intelligent Automation',
  'AI & Machine Learning',
  'IoT & Smart Systems',
  'Electric Mobility & Energy',
  'Sustainable & Green Technology',
  'Smart Agriculture & Rural Innovation',
  'Healthcare & Assistive Technology',
  'Smart Infrastructure & Public Safety',
  'Renewable Energy',
  'Defence & Safety',
  'Innovative Consumer Products',
  'Open Innovation',
]

const SECE_EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@sece\.ac\.in$/i
const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/

// SECE email domain validation helper (@sece.ac.in)
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false
  return SECE_EMAIL_REGEX.test(email.trim())
}

// 10-digit Indian mobile number starting with 6, 7, 8 or 9
function isValidIndianMobile(mobile) {
  if (!mobile || typeof mobile !== 'string') return false
  return INDIAN_MOBILE_REGEX.test(mobile.trim())
}

// -------------------------------------------------------------
// GET /api/health
// Verifies backend operation and Supabase connectivity
// -------------------------------------------------------------
router.get('/health', async (req, res) => {
  try {
    const supabaseUrl = (process.env.SUPABASE_URL || '').trim()
    const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('YOUR-PROJECT-REF')) {
      return res.status(503).json({
        success: false,
        message: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is unconfigured in backend/.env',
      })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)

    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('id', { head: true, count: 'exact' })

      clearTimeout(timeoutId)

      if (error && error.message && error.message.includes('relation "public.registrations" does not exist')) {
        return res.status(200).json({
          success: true,
          message: 'Backend operational. public.registrations table needs schema execution.',
        })
      }
    } catch (dbErr) {
      clearTimeout(timeoutId)
      return res.status(503).json({
        success: false,
        message: 'Supabase connectivity check failed: ' + dbErr.message,
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Backend operational',
    })
  } catch (err) {
    console.error('Health check error:', err.message)
    return res.status(503).json({
      success: false,
      message: 'Backend service unhealthy: ' + err.message,
    })
  }
})

// -------------------------------------------------------------
// POST /api/registrations
// Handles multipart/form-data registration submission
// -------------------------------------------------------------
router.post('/registrations', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    // Handle Multer upload errors
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          message: 'File size exceeds maximum limit of 10 MB',
        })
      }
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error',
      })
    }

    try {
      const body = req.body || {}
      let parsedData = body

      if (body.data && typeof body.data === 'string') {
        try {
          parsedData = JSON.parse(body.data)
        } catch (e) {
          // ignore
        }
      }

      // Helper to extract field value across multiple possible naming styles
      const getVal = (keys, defaultVal = '') => {
        for (const k of keys) {
          if (parsedData[k] !== undefined && parsedData[k] !== null && parsedData[k] !== '') {
            return String(parsedData[k]).trim()
          }
          if (body[k] !== undefined && body[k] !== null && body[k] !== '') {
            return String(body[k]).trim()
          }
        }
        return defaultVal
      }

      const email = getVal(['email', 'teamLeaderEmail', 'leader_email', 'leaderEmail'])
      const teamName = getVal(['teamName', 'team_name'])

      const leader = {
        name: getVal(['teamLeaderName', 'leader_name', 'leaderName', 'teamLeader[name]']),
        email: getVal(['teamLeaderEmail', 'leader_email', 'leaderEmail', 'teamLeader[email]']),
        mobile: getVal(['teamLeaderMobile', 'leader_mobile', 'leaderMobile', 'teamLeader[mobile]']),
        department: getVal(['teamLeaderDepartment', 'leader_department', 'leaderDepartment', 'teamLeader[department]']),
      }

      const member2 = {
        name: getVal(['member2Name', 'member2_name', 'member2[name]']),
        email: getVal(['member2Email', 'member2_email', 'member2[email]']),
        mobile: getVal(['member2Mobile', 'member2_mobile', 'member2[mobile]']),
        department: getVal(['member2Department', 'member2_department', 'member2[department]']),
      }

      const member3 = {
        name: getVal(['member3Name', 'member3_name', 'member3[name]']),
        email: getVal(['member3Email', 'member3_email', 'member3[email]']),
        mobile: getVal(['member3Mobile', 'member3_mobile', 'member3[mobile]']),
        department: getVal(['member3Department', 'member3_department', 'member3[department]']),
      }


      const mentor = {
        name: getVal(['facultyMentorName', 'mentor_name', 'mentorName', 'facultyMentor[name]']),
        department: getVal(['facultyMentorDepartment', 'mentor_department', 'mentorDepartment', 'facultyMentor[department]']),
      }

      const innovationDomain = getVal(['innovationDomain', 'innovation_domain'])

      let sdgGoals = getVal(['sdgGoals', 'sdg_goals'])
      if (typeof sdgGoals === 'string') {
        try {
          sdgGoals = JSON.parse(sdgGoals)
        } catch (e) {
          sdgGoals = sdgGoals.split(',').map((s) => s.trim()).filter(Boolean)
        }
      }
      if (!Array.isArray(sdgGoals)) {
        sdgGoals = []
      }

      let trlLevel = getVal(['trlLevel', 'trl_level'])
      if (trlLevel !== undefined && trlLevel !== null && trlLevel !== '') {
        trlLevel = parseInt(trlLevel, 10)
      } else {
        trlLevel = null
      }

      const projectTitle = getVal(['projectTitle', 'project_title'])
      const problemArea = getVal(['problemArea', 'problem_area'])
      const proposedSolution = getVal(['proposedSolution', 'proposed_solution'])
      const expectedImpact = getVal(['expectedImpact', 'expected_impact'])

      const declRaw = parsedData.declarationAccepted ?? body.declarationAccepted
      const declarationAccepted = declRaw === true || declRaw === 'true'

      // Validation Checks

      // 1. Email validation (must end with @sece.ac.in)
      if (!email || !isValidEmail(email)) {
        return res.status(400).json({
          success: false,
          message: 'All member email addresses must use the @sece.ac.in domain.',
        })
      }

      if (!teamName) {
        return res.status(400).json({ success: false, message: 'Team name is required' })
      }

      // Team Leader validation
      if (!leader.name) {
        return res.status(400).json({ success: false, message: 'Team leader name is required' })
      }
      if (!isValidEmail(leader.email)) {
        return res.status(400).json({
          success: false,
          message: 'All member email addresses must use the @sece.ac.in domain.',
        })
      }
      if (!isValidIndianMobile(leader.mobile)) {
        return res.status(400).json({
          success: false,
          message: 'All mobile numbers must be exactly 10 digits and start with 6, 7, 8, or 9.',
        })
      }
      if (!leader.department) {
        return res.status(400).json({ success: false, message: 'Team leader department is required' })
      }

      // Member 2 validation
      if (!member2.name) {
        return res.status(400).json({ success: false, message: 'Member 2 name is required' })
      }
      if (!isValidEmail(member2.email)) {
        return res.status(400).json({
          success: false,
          message: 'All member email addresses must use the @sece.ac.in domain.',
        })
      }
      if (!isValidIndianMobile(member2.mobile)) {
        return res.status(400).json({
          success: false,
          message: 'All mobile numbers must be exactly 10 digits and start with 6, 7, 8, or 9.',
        })
      }
      if (!member2.department) {
        return res.status(400).json({ success: false, message: 'Member 2 department is required' })
      }

      // Member 3 validation
      if (!member3.name) {
        return res.status(400).json({ success: false, message: 'Member 3 name is required' })
      }
      if (!isValidEmail(member3.email)) {
        return res.status(400).json({
          success: false,
          message: 'All member email addresses must use the @sece.ac.in domain.',
        })
      }
      if (!isValidIndianMobile(member3.mobile)) {
        return res.status(400).json({
          success: false,
          message: 'All mobile numbers must be exactly 10 digits and start with 6, 7, 8, or 9.',
        })
      }
      if (!member3.department) {
        return res.status(400).json({ success: false, message: 'Member 3 department is required' })
      }



      // Faculty Mentor validation
      if (!mentor.name) {
        return res.status(400).json({ success: false, message: 'Faculty mentor name is required' })
      }
      if (!mentor.department) {
        return res.status(400).json({ success: false, message: 'Faculty mentor department is required' })
      }

      // Innovation Domain validation
      if (!innovationDomain || !OFFICIAL_DOMAINS.includes(innovationDomain)) {
        return res.status(400).json({
          success: false,
          message: 'A valid primary innovation domain must be selected',
        })
      }

      // SDG Goals validation (must select at least 1 SDG goal)
      if (!sdgGoals || !Array.isArray(sdgGoals) || sdgGoals.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one Sustainable Development Goal (SDG) must be selected',
        })
      }

      // TRL Level validation (must be integer between 1 and 9)
      if (!trlLevel || !Number.isInteger(trlLevel) || trlLevel < 1 || trlLevel > 9) {
        return res.status(400).json({
          success: false,
          message: 'A valid Technology Readiness Level (TRL 1 through TRL 9) must be selected',
        })
      }

      // Product Info validation
      if (!projectTitle) {
        return res.status(400).json({ success: false, message: 'Project title is required' })
      }
      if (!problemArea) {
        return res.status(400).json({ success: false, message: 'Problem area is required' })
      }
      if (!proposedSolution) {
        return res.status(400).json({ success: false, message: 'Proposed solution is required' })
      }
      if (!expectedImpact) {
        return res.status(400).json({ success: false, message: 'Expected impact is required' })
      }

      // Declaration validation
      if (!declarationAccepted) {
        return res.status(400).json({
          success: false,
          message: 'You must agree to the declaration before submitting',
        })
      }

      // Check environment variables before trying Supabase
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_URL.includes('YOUR-PROJECT-REF')) {
        return res.status(503).json({
          success: false,
          message: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from backend/.env',
        })
      }

      // Fetch active departments from public.departments
      const { data: activeDepts, error: deptsError } = await supabase
        .from('departments')
        .select('id, name')
        .eq('is_active', true)

      if (deptsError || !activeDepts) {
        console.error('[Registration] Error fetching departments from Supabase:', deptsError)
        return res.status(500).json({
          success: false,
          message: 'An internal error occurred while validating departments. Please try again.',
        })
      }

      // Create a map of canonical name -> UUID, and set of canonical names
      const deptMap = {}
      const canonicalNames = new Set()
      activeDepts.forEach(d => {
        deptMap[d.name] = d.id
        canonicalNames.add(d.name)
      })

      // Validate leader, member2, member3, and mentor departments against canonical names
      const leaderDept = leader.department
      const member2Dept = member2.department
      const member3Dept = member3.department
      const mentorDept = mentor.department

      if (!canonicalNames.has(leaderDept)) {
        return res.status(400).json({ success: false, message: `Team leader department "${leaderDept}" is invalid.` })
      }
      if (!canonicalNames.has(member2Dept)) {
        return res.status(400).json({ success: false, message: `Member 2 department "${member2Dept}" is invalid.` })
      }
      if (!canonicalNames.has(member3Dept)) {
        return res.status(400).json({ success: false, message: `Member 3 department "${member3Dept}" is invalid.` })
      }
      if (!canonicalNames.has(mentorDept)) {
        return res.status(400).json({ success: false, message: `Faculty mentor department "${mentorDept}" is invalid.` })
      }

      // Insert row into Supabase PostgreSQL (only actual existing database columns)
      const recordToInsert = {
        team_name: teamName,
        leader_name: leader.name,
        leader_email: leader.email,
        leader_mobile: leader.mobile,
        leader_department: leader.department,
        member2_name: member2.name,
        member2_email: member2.email,
        member2_mobile: member2.mobile,
        member2_department: member2.department,
        member3_name: member3.name,
        member3_email: member3.email,
        member3_mobile: member3.mobile,
        member3_department: member3.department,
        mentor_name: mentor.name,
        mentor_department: mentor.department,
        innovation_domain: innovationDomain,
        sdg_goals: sdgGoals,
        trl_level: trlLevel,
        project_title: projectTitle,
        problem_area: problemArea,
        proposed_solution: proposedSolution,
        expected_impact: expectedImpact,
        declaration_accepted: declarationAccepted,
      }

      // We will track created resources for application-level rollback
      let regId = null
      let createdTeamId = null
      let wasTeamCreated = false
      let createdProductId = null
      let createdMemberIds = []

      try {
        let { data: insertedData, error: dbError } = await supabase
          .from('registrations')
          .insert([recordToInsert])
          .select('registration_id')
          .single()

        // Fallback retry if needed (preserving existing logic)
        if (dbError && String(dbError.message || dbError.details || '').includes('sdg_goals')) {
          console.warn('[Registration] Warning: sdg_goals/trl_level columns missing in live DB. Retrying fallback insert.')
          const fallbackRecord = { ...recordToInsert }
          delete fallbackRecord.sdg_goals
          delete fallbackRecord.trl_level

          const retryRes = await supabase
            .from('registrations')
            .insert([fallbackRecord])
            .select('registration_id')
            .single()

          insertedData = retryRes.data
          dbError = retryRes.error
        }

        if (dbError) {
          const errMsg = String(dbError.message || dbError.details || '')

          // Detect DUPLICATE_MEMBER_IN_TEAM / MEMBER_ALREADY_REGISTERED
          if (errMsg.includes('DUPLICATE_MEMBER_IN_TEAM') || errMsg.includes('MEMBER_ALREADY_REGISTERED')) {
            const regIdMatch = errMsg.match(/(IPL26-\d{4})/i)
            const registrationId = regIdMatch ? regIdMatch[1] : null
            return res.status(409).json({
              success: false,
              code: 'DUPLICATE_MEMBER_IN_TEAM',
              message: 'Each team member must be unique.',
              registrationId,
              registration_id: registrationId,
            })
          }

          // Detect TEAM_NAME_ALREADY_EXISTS / TEAM_ALREADY_REGISTERED
          if (
            errMsg.includes('TEAM_ALREADY_REGISTERED') ||
            errMsg.includes('TEAM_NAME_ALREADY_EXISTS') ||
            errMsg.includes('team_name')
          ) {
            const regIdMatch = errMsg.match(/(IPL26-\d{4})/i)
            const registrationId = regIdMatch ? regIdMatch[1] : null
            return res.status(409).json({
              success: false,
              code: 'TEAM_ALREADY_REGISTERED',
              message: 'This team name is already registered.',
              registrationId,
              registration_id: registrationId,
            })
          }

          throw dbError
        }

        regId = insertedData.registration_id
        console.log('[Registration] Created registration ID:', regId)

        // Find or create team (DO NOT insert normalized_team_name because it is generated)
        const normalizedSearch = teamName.toLowerCase().trim()
        const { data: existingTeam, error: teamSearchError } = await supabase
          .from('teams')
          .select('id')
          .eq('normalized_team_name', normalizedSearch)
          .maybeSingle()

        if (teamSearchError) throw teamSearchError

        let teamId
        if (existingTeam) {
          teamId = existingTeam.id
          console.log(`[Registration] Found existing team ID: ${teamId}`)
        } else {
          // Insert ONLY team_name. Let PostgreSQL generate normalized_team_name.
          const { data: newTeam, error: teamCreateError } = await supabase
            .from('teams')
            .insert([{ team_name: teamName.trim() }])
            .select('id')
            .single()

          if (teamCreateError) throw teamCreateError
          teamId = newTeam.id
          createdTeamId = teamId
          wasTeamCreated = true
          console.log(`[Registration] Created new team ID: ${teamId}`)
        }

        // Create product
        const productPayload = {
          team_id: teamId,
          product_number: 1,
          product_title: projectTitle,
          innovation_domain: innovationDomain,
          problem_area: problemArea,
          proposed_solution: proposedSolution,
          expected_impact: expectedImpact,
          sdg_goals: sdgGoals,
          trl_level: trlLevel,
          legacy_registration_id: regId,
          status: 'active'
        }

        const { data: productData, error: productCreateError } = await supabase
          .from('products')
          .insert([productPayload])
          .select('id')
          .single()

        if (productCreateError) throw productCreateError
        createdProductId = productData.id
        console.log(`[Registration] Created product ID: ${createdProductId}`)

        // Create product members (exactly 3)
        const membersPayload = [
          {
            product_id: createdProductId,
            member_name: leader.name,
            member_email: leader.email,
            member_mobile: leader.mobile,
            department_id: deptMap[leader.department],
            role: 'Team Leader',
            is_team_leader: true
          },
          {
            product_id: createdProductId,
            member_name: member2.name,
            member_email: member2.email,
            member_mobile: member2.mobile,
            department_id: deptMap[member2.department],
            role: 'Team Member',
            is_team_leader: false
          },
          {
            product_id: createdProductId,
            member_name: member3.name,
            member_email: member3.email,
            member_mobile: member3.mobile,
            department_id: deptMap[member3.department],
            role: 'Team Member',
            is_team_leader: false
          }
        ]

        const { data: membersData, error: membersCreateError } = await supabase
          .from('product_members')
          .insert(membersPayload)
          .select('id')

        if (membersCreateError) throw membersCreateError
        createdMemberIds = (membersData || []).map(m => m.id)
        console.log(`[Registration] Created ${createdMemberIds.length} product members`)

        // Return HTTP 201 Success Response
        return res.status(201).json({
          success: true,
          message: 'Registration successful',
          registrationId: regId,
        })

      } catch (transactionError) {
        console.error('[Registration] Failed during normalized data setup. Executing application-level rollback/cleanup:', transactionError.message || transactionError)

        // 1. Delete created members
        if (createdMemberIds.length > 0) {
          console.log(`[Rollback] Deleting product members: ${createdMemberIds}`)
          await supabase.from('product_members').delete().in('id', createdMemberIds)
        }

        // 2. Delete created product
        if (createdProductId) {
          console.log(`[Rollback] Deleting product: ${createdProductId}`)
          await supabase.from('products').delete().eq('id', createdProductId)
        }

        // 3. Delete created team (ONLY if it was created by this request and has no other products)
        if (wasTeamCreated && createdTeamId) {
          const { count, error: countError } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('team_id', createdTeamId)

          if (!countError && count === 0) {
            console.log(`[Rollback] Deleting team: ${createdTeamId}`)
            await supabase.from('teams').delete().eq('id', createdTeamId)
          } else {
            console.log(`[Rollback] Skipping team deletion: referenced elsewhere (count=${count})`)
          }
        }

        // 4. Delete created registration
        if (regId) {
          console.log(`[Rollback] Deleting registration: ${regId}`)
          await supabase.from('registrations').delete().eq('registration_id', regId)
        }

        return res.status(500).json({
          success: false,
          message: 'An error occurred while saving your registration. Please try again.',
        })
      }
    } catch (error) {
      console.error('[Registration] Unexpected error:', error)
      return res.status(500).json({
        success: false,
        message: 'An internal server error occurred while processing registration',
      })
    }
  })
})

// New endpoints for existing team submitting new ideas
router.get('/check-team/:teamName', async (req, res) => {
  try {
    const rawTeamName = req.params.teamName;
    const teamName = rawTeamName ? rawTeamName.trim() : '';

    console.log(`[CHECK TEAM] Checking team: ${teamName}`);

    if (!teamName) {
      console.log(`[CHECK TEAM] Rejected empty team name`);
      return res.status(400).json({ success: false, message: 'Team name is required.' });
    }

    // Determine the authenticated user
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required. Authorization header is missing or invalid.' });
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired authentication session.' });
    }
    const userEmail = user.email ? user.email.toLowerCase().trim() : '';

    const normalized = teamName.toLowerCase().trim();

    // 1. Check if team exists in teams table
    const { data: teamData, error: teamErr } = await supabase
      .from('teams')
      .select('id, team_name, normalized_team_name')
      .eq('normalized_team_name', normalized)
      .maybeSingle();

    if (teamErr) {
      console.error('[CheckTeam] Supabase team error:', teamErr.message);
      return res.status(500).json({ success: false, message: 'Database error checking team existence.' });
    }

    if (!teamData) {
      console.log(`[CHECK TEAM] Team not found: ${teamName}`);
      return res.json({ exists: false });
    }

    console.log(`[CHECK TEAM] Team found: ${teamData.team_name}`);

    // 2. Retrieve team's first product ordered by product_number ascending
    const { data: productData, error: prodErr } = await supabase
      .from('products')
      .select('id, product_number, product_title, legacy_registration_id')
      .eq('team_id', teamData.id)
      .order('product_number', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (prodErr) {
      console.error('[CheckTeam] Supabase product error:', prodErr.message);
      return res.status(500).json({ success: false, message: 'Database error fetching team products.' });
    }

    let members = [];
    let mentor = { name: '', department: '' };

    if (productData) {
      // A. Fetch members
      const { data: membersData, error: memErr } = await supabase
        .from('product_members')
        .select(`
          id,
          member_name,
          member_email,
          member_mobile,
          role,
          is_team_leader,
          department_id,
          departments ( name )
        `)
        .eq('product_id', productData.id)
        .order('is_team_leader', { ascending: false });

      if (memErr) {
        console.error('[CheckTeam] Supabase members error:', memErr.message);
        return res.status(500).json({ success: false, message: 'Database error fetching team members.' });
      }

      members = (membersData || []).map(m => ({
        id: m.id,
        member_name: m.member_name,
        member_email: m.member_email,
        member_mobile: m.member_mobile,
        department_id: m.department_id,
        department_name: m.departments ? m.departments.name : null,
        role: m.role,
        is_team_leader: m.is_team_leader
      }));

      // B. Fetch mentor from original registration
      if (productData.legacy_registration_id) {
        const { data: regData, error: regErr } = await supabase
          .from('registrations')
          .select('mentor_name, mentor_department')
          .eq('registration_id', productData.legacy_registration_id)
          .maybeSingle();

        if (!regErr && regData) {
          mentor = {
            name: regData.mentor_name || '',
            department: regData.mentor_department || ''
          };
        }
      }
    }

    // 3. Verify user is a member of this team
    const isMember = members.some(m => m.member_email && m.member_email.toLowerCase().trim() === userEmail);
    if (!isMember) {
      console.log(`[CHECK TEAM] User ${userEmail} is not authorized for team ${teamData.team_name}`);
      return res.status(403).json({ success: false, message: 'You are not authorized to submit a new idea for this team.' });
    }

    return res.json({
      exists: true,
      team: {
        id: teamData.id,
        team_name: teamData.team_name,
      },
      product: productData ? {
        id: productData.id,
        product_number: productData.product_number,
        product_title: productData.product_title
      } : null,
      members: members,
      mentor: mentor
    });

  } catch (err) {
    console.error('[CheckTeam] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

router.post('/submit-new-idea', async (req, res) => {
  try {
    const {
      teamId,
      projectTitle,
      innovationDomain,
      problemArea,
      proposedSolution,
      expectedImpact,
      sdgGoals,
      trlLevel,
      declarationAccepted
    } = req.body || {};

    // Validation checks
    if (!teamId) {
      return res.status(400).json({ success: false, message: 'Team ID is required.' });
    }
    if (!projectTitle || !projectTitle.trim()) {
      return res.status(400).json({ success: false, message: 'Project title is required.' });
    }
    if (!innovationDomain) {
      return res.status(400).json({ success: false, message: 'Innovation domain is required.' });
    }
    if (!problemArea || !problemArea.trim()) {
      return res.status(400).json({ success: false, message: 'Problem area is required.' });
    }
    if (!proposedSolution || !proposedSolution.trim()) {
      return res.status(400).json({ success: false, message: 'Proposed solution is required.' });
    }
    if (!expectedImpact || !expectedImpact.trim()) {
      return res.status(400).json({ success: false, message: 'Expected impact is required.' });
    }
    if (declarationAccepted !== undefined && !declarationAccepted) {
      return res.status(400).json({ success: false, message: 'You must agree to the declaration before submitting.' });
    }

    // Determine the authenticated user
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required. Authorization header is missing or invalid.' });
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired authentication session.' });
    }
    const userEmail = user.email ? user.email.toLowerCase().trim() : '';

    // 1. Verify team exists and get authoritative team ID
    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .select('id, team_name')
      .eq('id', teamId)
      .maybeSingle();

    if (teamErr || !team) {
      console.error('[SubmitNewIdea] Team lookup failed:', teamErr ? teamErr.message : 'Not found');
      return res.status(404).json({ success: false, message: 'Existing team not found.' });
    }

    // 2. Fetch the team's first product's members
    const { data: productData, error: prodErr } = await supabase
      .from('products')
      .select('id')
      .eq('team_id', team.id)
      .order('product_number', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (prodErr || !productData) {
      console.error('[SubmitNewIdea] Fetch first product error:', prodErr ? prodErr.message : 'No products exist');
      return res.status(400).json({ success: false, message: 'Cannot submit a new idea because no original product is associated with this team.' });
    }

    const { data: members, error: memErr } = await supabase
      .from('product_members')
      .select('member_name, member_email, member_mobile, role, is_team_leader, department_id')
      .eq('product_id', productData.id);

    if (memErr) {
      console.error('[SubmitNewIdea] Fetch members error:', memErr.message);
      return res.status(500).json({ success: false, message: 'Failed to fetch existing team members.' });
    }

    // 3. Verify user is a member of this team
    const isMember = members.some(m => m.member_email && m.member_email.toLowerCase().trim() === userEmail);
    if (!isMember) {
      console.log(`[SubmitNewIdea] User ${userEmail} is not authorized for team "${team.team_name}" (teamId: ${team.id})`);
      return res.status(403).json({ success: false, message: 'You are not authorized to submit a new idea for this team.' });
    }

    if (!members || members.length !== 3) {
      console.error(`[SubmitNewIdea] Invalid team member count: ${members ? members.length : 0}`);
      return res.status(400).json({ success: false, message: 'This team must have exactly 3 members to reuse.' });
    }

    // 3. Concurrency-safe product insert loop
    let nextProductNumber = 1;
    let insertedProduct = null;
    const maxAttempts = 3;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;
      // Query current max product_number
      const { data: maxProd, error: maxErr } = await supabase
        .from('products')
        .select('product_number')
        .eq('team_id', team.id)
        .order('product_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (maxErr) {
        console.error(`[SubmitNewIdea] Fetch max product number error (attempt ${attempt}):`, maxErr.message);
        return res.status(500).json({ success: false, message: 'Database error calculating product number.' });
      }

      nextProductNumber = maxProd ? (maxProd.product_number + 1) : 1;

      // Try to insert product
      const productPayload = {
        team_id: team.id,
        product_number: nextProductNumber,
        product_title: projectTitle.trim(),
        innovation_domain: innovationDomain,
        problem_area: problemArea.trim(),
        proposed_solution: proposedSolution.trim(),
        expected_impact: expectedImpact.trim(),
        sdg_goals: sdgGoals || null,
        trl_level: trlLevel || null,
        legacy_registration_id: null,
        status: 'active'
      };

      const { data: prodIns, error: prodInsErr } = await supabase
        .from('products')
        .insert([productPayload])
        .select('id')
        .single();

      if (prodInsErr) {
        const isUniqueConflict = String(prodInsErr.message || prodInsErr.details || '').includes('uq_team_product_number') || prodInsErr.code === '23505';
        if (isUniqueConflict && attempt < maxAttempts) {
          console.warn(`[SubmitNewIdea] Concurrency conflict on product_number=${nextProductNumber} for team=${team.id}. Retrying attempt ${attempt + 1}...`);
          continue; // Retry loop
        }
        console.error('[SubmitNewIdea] Product insertion failed:', prodInsErr.message || prodInsErr);
        return res.status(500).json({ success: false, message: 'Failed to create product record.' });
      }

      insertedProduct = prodIns;
      break; // Success!
    }

    if (!insertedProduct) {
      return res.status(409).json({
        success: false,
        message: 'Could not assign a unique product number due to concurrent updates. Please try again.'
      });
    }

    // 4. Insert members for this new product
    const membersPayload = members.map(m => ({
      product_id: insertedProduct.id,
      member_name: m.member_name,
      member_email: m.member_email,
      member_mobile: m.member_mobile,
      department_id: m.department_id,
      role: m.role,
      is_team_leader: m.is_team_leader
    }));

    const { error: membersErr } = await supabase
      .from('product_members')
      .insert(membersPayload);

    if (membersErr) {
      console.error('[SubmitNewIdea] Member insertion failed. Initiating rollback...', membersErr.message);

      // Rollback: delete the created product
      await supabase.from('products').delete().eq('id', insertedProduct.id);

      return res.status(500).json({ success: false, message: 'Failed to populate new product members.' });
    }

    console.log(`[SubmitNewIdea] Successfully registered new idea for team "${team.team_name}" as product #${nextProductNumber}`);

    return res.status(201).json({
      success: true,
      message: 'New idea submitted successfully',
      teamName: team.team_name,
      productNumber: nextProductNumber,
      productId: insertedProduct.id
    });

  } catch (err) {
    console.error('[SubmitNewIdea] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// -------------------------------------------------------------
// GET /api/my-submissions
// Retrieves all team registrations and associated products/ideas for the authenticated user
// -------------------------------------------------------------
router.get('/my-submissions', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required. Authorization header is missing.' });
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired authentication session.' });
    }
    const userEmail = (user.email || '').trim().toLowerCase();
    if (!userEmail) {
      return res.status(400).json({ success: false, message: 'User email not found in session.' });
    }

    const { data: regs, error: regsErr } = await supabase
      .from('registrations')
      .select('*')
      .or(`leader_email.ilike."${userEmail}",member2_email.ilike."${userEmail}",member3_email.ilike."${userEmail}"`);

    if (regsErr) {
      console.error('[MySubmissions] Fetch registrations error:', regsErr.message);
      return res.status(500).json({ success: false, message: 'Failed to retrieve team registrations.' });
    }

    if (!regs || regs.length === 0) {
      return res.status(200).json({ success: true, submissions: [] });
    }

    const submissions = [];

    for (const reg of regs) {
      const normTeamName = (reg.team_name || '').trim().toLowerCase();

      const { data: team, error: teamErr } = await supabase
        .from('teams')
        .select('*')
        .eq('normalized_team_name', normTeamName)
        .maybeSingle();

      if (teamErr) {
        console.error(`[MySubmissions] Error fetching team for "${reg.team_name}":`, teamErr.message);
        continue;
      }

      let userRole = 'Member';
      if ((reg.leader_email || '').trim().toLowerCase() === userEmail) {
        userRole = 'Team Leader';
      }

      const teamInfo = {
        teamId: team ? team.id : null,
        teamName: reg.team_name,
        registrationId: reg.registration_id,
        createdAt: reg.created_at,
        userRole,
        mentor: {
          name: reg.mentor_name,
          department: reg.mentor_department
        },
        members: {
          leader: { name: reg.leader_name, email: reg.leader_email, department: reg.leader_department },
          member2: { name: reg.member2_name, email: reg.member2_email, department: reg.member2_department },
          member3: { name: reg.member3_name, email: reg.member3_email, department: reg.member3_department }
        }
      };

      if (team) {
        const { data: products, error: prodErr } = await supabase
          .from('products')
          .select('*')
          .eq('team_id', team.id)
          .order('product_number', { ascending: true });

        if (prodErr) {
          console.error(`[MySubmissions] Error fetching products for team ${team.id}:`, prodErr.message);
        }

        teamInfo.ideas = products || [];
      } else {
        teamInfo.ideas = [];
      }

      submissions.push(teamInfo);
    }

    return res.status(200).json({ success: true, submissions });
  } catch (err) {
    console.error('[MySubmissions] Unexpected error:', err.message || err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

module.exports = router;
