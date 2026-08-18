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

      const member4 = {
        name: getVal(['member4Name', 'member4_name', 'member4[name]']),
        email: getVal(['member4Email', 'member4_email', 'member4[email]']),
        mobile: getVal(['member4Mobile', 'member4_mobile', 'member4[mobile]']),
        department: getVal(['member4Department', 'member4_department', 'member4[department]']),
      }

      const mentor = {
        name: getVal(['facultyMentorName', 'mentor_name', 'mentorName', 'facultyMentor[name]']),
        department: getVal(['facultyMentorDepartment', 'mentor_department', 'mentorDepartment', 'facultyMentor[department]']),
      }

      const innovationDomain = getVal(['innovationDomain', 'innovation_domain'])
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

      // Member 4 optional validation
      if (member4.name || member4.email || member4.mobile || member4.department) {
        if (!member4.name) {
          return res.status(400).json({ success: false, message: 'Member 4 name is required when Member 4 details are provided' })
        }
        if (!isValidEmail(member4.email)) {
          return res.status(400).json({
            success: false,
            message: 'All member email addresses must use the @sece.ac.in domain.',
          })
        }
        if (!isValidIndianMobile(member4.mobile)) {
          return res.status(400).json({
            success: false,
            message: 'All mobile numbers must be exactly 10 digits and start with 6, 7, 8, or 9.',
          })
        }
        if (!member4.department) {
          return res.status(400).json({ success: false, message: 'Member 4 department is required' })
        }
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

      // Upload File to Supabase Storage if present
      let uploadedFilePath = null
      let fileOriginalName = null
      let fileStoredName = null
      let fileMimeType = null
      let fileSize = null

      if (req.file) {
        console.log('[Registration] Uploading document...')

        const ext = path.extname(req.file.originalname).toLowerCase()
        const sanitizedBase = path
          .basename(req.file.originalname, ext)
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 40)
        
        const timestamp = new Date()
        const year = timestamp.getFullYear()
        const month = String(timestamp.getMonth() + 1).padStart(2, '0')
        
        fileStoredName = `${sanitizedBase}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`
        uploadedFilePath = `registrations/${year}/${month}/${fileStoredName}`
        fileOriginalName = req.file.originalname
        fileMimeType = req.file.mimetype
        fileSize = req.file.size

        const { data: storageData, error: storageError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(uploadedFilePath, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false,
          })

        if (storageError) {
          console.error('[Registration] Storage upload error:', storageError.message || storageError)
          return res.status(500).json({
            success: false,
            message: 'Supabase Storage upload error: ' + (storageError.message || 'AccessDenied or Policy Violation'),
          })
        }

        console.log('[Registration] Storage upload successful:', uploadedFilePath)
      }

      // Insert row into Supabase PostgreSQL
      const recordToInsert = {
        email,
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
        member4_name: member4.name || null,
        member4_email: member4.email || null,
        member4_mobile: member4.mobile || null,
        member4_department: member4.department || null,
        mentor_name: mentor.name,
        mentor_department: mentor.department,
        innovation_domain: innovationDomain,
        project_title: projectTitle,
        problem_area: problemArea,
        proposed_solution: proposedSolution,
        expected_impact: expectedImpact,
        file_original_name: fileOriginalName,
        file_stored_name: fileStoredName,
        file_mime_type: fileMimeType,
        file_size: fileSize,
        file_path: uploadedFilePath,
        declaration_accepted: true,
      }

      const { data: insertedData, error: dbError } = await supabase
        .from('registrations')
        .insert([recordToInsert])
        .select('registration_id')
        .single()

      // ORPHAN FILE CLEANUP
      if (dbError) {
        console.error('[Registration] Database insert error:', dbError.message || dbError)
        
        if (uploadedFilePath) {
          console.warn('[Registration] Cleaning up orphan file from Supabase Storage:', uploadedFilePath)
          await supabase.storage.from(BUCKET_NAME).remove([uploadedFilePath])
        }

        return res.status(500).json({
          success: false,
          message: 'Database error saving registration: ' + dbError.message,
        })
      }

      console.log('[Registration] Database insert successful')
      console.log('[Registration] Registration ID:', insertedData.registration_id)

      // Return HTTP 201 Success Response
      return res.status(201).json({
        success: true,
        message: 'Registration successful',
        registrationId: insertedData.registration_id,
      })
    } catch (error) {
      console.error('[Registration] Unexpected error:', error)
      return res.status(500).json({
        success: false,
        message: 'An internal server error occurred while processing registration',
      })
    }
  })
})

module.exports = router
