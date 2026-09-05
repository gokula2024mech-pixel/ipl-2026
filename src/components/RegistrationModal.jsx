import { useState, useEffect } from 'react'
import {
  X,
  CheckCircle2,
  AlertCircle,
  Upload,
  FileText,
  Copy,
  Check,
  User,
  Users,
  Building,
  Lightbulb,
  FileCheck,
  ShieldAlert,
  Globe,
  Rocket,
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import MechanicalLoader from './MechanicalLoader'

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
  'Open Innovation',
]

const SDG_GOALS = [
  '1 - No Poverty',
  '2 - Zero Hunger',
  '3 - Good Health and Well-Being',
  '4 - Quality Education',
  '5 - Gender Equality',
  '6 - Clean Water and Sanitation',
  '7 - Affordable and Clean Energy',
  '8 - Decent Work and Economic Growth',
  '9 - Industry, Innovation and Infrastructure',
  '10 - Reduced Inequalities',
  '11 - Sustainable Cities and Communities',
  '12 - Responsible Consumption and Production',
  '13 - Climate Action',
  '14 - Life Below Water',
  '15 - Life on Land',
  '16 - Peace, Justice and Strong Institutions',
  '17 - Partnerships for the Goals',
]

const TRL_LEVELS = [
  { level: 9, description: 'System ready for full scale deployment' },
  { level: 8, description: 'System incorporated in commercial design' },
  { level: 7, description: 'Integrated pilot system demonstrated' },
  { level: 6, description: 'Prototype system verified' },
  { level: 5, description: 'Laboratory testing of integrated system' },
  { level: 4, description: 'Laboratory testing of prototype component or process' },
  { level: 3, description: 'Critical function: proof of concept established' },
  { level: 2, description: 'Technology concept and/or application formulated' },
  { level: 1, description: 'Basic principles observed and reported' },
]

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.ppt', '.pptx']
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')
const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl.slice(0, -4) : rawApiUrl

const SECE_EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@sece\.ac\.in$/i
const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/

export default function RegistrationModal({ isOpen, onClose, onRegistrationClosed }) {
  const [formData, setFormData] = useState({
    email: '',
    teamName: '',
    teamLeaderName: '',
    teamLeaderEmail: '',
    teamLeaderMobile: '',
    teamLeaderDepartment: '',
    member2Name: '',
    member2Email: '',
    member2Mobile: '',
    member2Department: '',
    member3Name: '',
    member3Email: '',
    member3Mobile: '',
    member3Department: '',
    member4Name: '',
    member4Email: '',
    member4Mobile: '',
    member4Department: '',
    facultyMentorName: '',
    facultyMentorDepartment: '',
    facultyMentorId: '',
    innovationDomain: '',
    sdgGoals: [],
    trlLevel: '',
    projectTitle: '',
    problemArea: '',
    proposedSolution: '',
    expectedImpact: '',
    declarationAccepted: false,
  })

  const [mentorsList, setMentorsList] = useState([])
  const [selectedMentorType, setSelectedMentorType] = useState('') // '', 'preset', 'other'

  useEffect(() => {
    if (!isOpen) return
    const fetchMentors = async () => {
      try {
        const { data, error } = await supabase
          .from('mentors')
          .select('*')
          .order('name', { ascending: true })
        if (!error && data) {
          setMentorsList(data)
        }
      } catch (err) {
        // Table may not be migrated yet; fallback to manual mentor input
      }
    }
    fetchMentors()
  }, [isOpen])

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const draft = localStorage.getItem('registration_form_draft')
      if (draft) {
        const parsed = JSON.parse(draft)
        setFormData((prev) => ({ ...prev, ...parsed }))
        if (parsed.facultyMentorId) {
          setSelectedMentorType('preset')
        } else if (parsed.facultyMentorName) {
          setSelectedMentorType('other')
        }
      }
    } catch (e) {
      console.error('[RegistrationModal] Failed to load draft:', e)
    }
  }, [])

  // Save draft to localStorage on change
  useEffect(() => {
    const isEmpty = Object.values(formData).every((val) => {
      if (Array.isArray(val)) return val.length === 0
      return val === '' || val === false
    })
    try {
      if (isEmpty) {
        localStorage.removeItem('registration_form_draft')
      } else {
        localStorage.setItem('registration_form_draft', JSON.stringify(formData))
      }
    } catch (e) {
      console.error('[RegistrationModal] Failed to save draft:', e)
    }
  }, [formData])

  const [selectedFile, setSelectedFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [activePopup, setActivePopup] = useState(null)
  const [successData, setSuccessData] = useState(null)
  const [copied, setCopied] = useState(false)

  const [departments, setDepartments] = useState([])

  const OFFICIAL_DEPARTMENTS = [
    'Artificial Intelligence and Data Science',
    'Artificial Intelligence and Machine Learning',
    'Computer and Communication Engineering',
    'Computer Science and Business System',
    'Computer Science and Engineering',
    'Cyber Security',
    'Electrical and Electronics Engineering',
    'Electronics and Communication Engineering',
    'Information Technology',
    'Mechanical Engineering'
  ]

  useEffect(() => {
    if (!isOpen) return
    const fetchDepartments = async () => {
      try {
        const { data, error } = await supabase
          .from('departments')
          .select('id, name')
          .eq('is_active', true)
          .order('name')
        if (error) throw error
        if (data) {
          setDepartments(data.map(d => d.name))
        }
      } catch (err) {
        console.error('Error loading departments from Supabase:', err)
      }
    }
    fetchDepartments()
  }, [isOpen])

  const [existingTeamData, setExistingTeamData] = useState(null)
  const [isNewIdeaMode, setIsNewIdeaMode] = useState(false)
  const [isCheckingTeam, setIsCheckingTeam] = useState(false)

  const handleTeamNameBlur = async () => {
    const teamName = formData.teamName.trim()
    if (!teamName || isNewIdeaMode) return

    setIsCheckingTeam(true)
    setErrors(prev => ({ ...prev, teamName: '' }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const response = await fetch(`${API_BASE_URL}/api/check-team/${encodeURIComponent(teamName)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      const contentType = response.headers.get('content-type')

      if (!response.ok) {
        let msg = `Unable to verify team name (Server responded with status ${response.status}).`
        if (response.status === 403 && contentType && contentType.includes('application/json')) {
          try {
            const errData = await response.json()
            msg = errData.message || 'You are not authorized to submit a new idea for this team.'
          } catch (e) {
            msg = 'You are not authorized to submit a new idea for this team.'
          }
        }
        setErrors(prev => ({
          ...prev,
          teamName: msg
        }))
        setExistingTeamData(null)
        return
      }

      const data = await response.json()
      if (data.exists) {
        setExistingTeamData(data)
      } else {
        setExistingTeamData(null)
      }
    } catch (err) {
      console.error('Error checking team existence:', err)
      setErrors(prev => ({
        ...prev,
        teamName: 'Network error verifying team name. Please check your connection.'
      }))
      setExistingTeamData(null)
    } finally {
      setIsCheckingTeam(false)
    }
  }

  const handleStartNewIdeaMode = () => {
    if (!existingTeamData) return
    setIsNewIdeaMode(true)

    // Pre-populate members & departments in form data from existingTeamData
    const leader = existingTeamData.members.find(m => m.is_team_leader)
    const members = existingTeamData.members.filter(m => !m.is_team_leader)
    const m2 = members[0] || {}
    const m3 = members[1] || {}
    const mentor = existingTeamData.mentor || {}

    setFormData(prev => ({
      ...prev,
      teamLeaderName: leader?.member_name || '',
      teamLeaderEmail: leader?.member_email || '',
      teamLeaderMobile: leader?.member_mobile || '',
      teamLeaderDepartment: leader?.department_name || '',
      member2Name: m2.member_name || '',
      member2Email: m2.member_email || '',
      member2Mobile: m2.member_mobile || '',
      member2Department: m2.department_name || '',
      member3Name: m3.member_name || '',
      member3Email: m3.member_email || '',
      member3Mobile: m3.member_mobile || '',
      member3Department: m3.department_name || '',
      facultyMentorName: mentor.name || '',
      facultyMentorDepartment: mentor.department || '',
      // Clear idea-specific fields to let user enter the new idea
      innovationDomain: '',
      sdgGoals: [],
      trlLevel: '',
      projectTitle: '',
      problemArea: '',
      proposedSolution: '',
      expectedImpact: '',
      declarationAccepted: false
    }))
  }

  const handleCancelNewIdeaMode = () => {
    setIsNewIdeaMode(false)
    setExistingTeamData(null)
    setFormData(prev => ({
      ...prev,
      teamName: '',
      teamLeaderName: '',
      teamLeaderEmail: '',
      teamLeaderMobile: '',
      teamLeaderDepartment: '',
      member2Name: '',
      member2Email: '',
      member2Mobile: '',
      member2Department: '',
      member3Name: '',
      member3Email: '',
      member3Mobile: '',
      member3Department: '',
      innovationDomain: '',
      sdgGoals: [],
      trlLevel: '',
      projectTitle: '',
      problemArea: '',
      proposedSolution: '',
      expectedImpact: '',
      declarationAccepted: false
    }))
  }

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSdgToggle = (sdgValue) => {
    setFormData((prev) => {
      const currentSdgs = prev.sdgGoals || []
      const isSelected = currentSdgs.includes(sdgValue)
      const updatedSdgs = isSelected
        ? currentSdgs.filter((item) => item !== sdgValue)
        : [...currentSdgs, sdgValue]
      return { ...prev, sdgGoals: updatedSdgs }
    })
    if (errors.sdgGoals) {
      setErrors((prev) => ({ ...prev, sdgGoals: '' }))
    }
    if (submitError) setSubmitError('')
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    let val = type === 'checkbox' ? checked : value

    const mobileFields = [
      'teamLeaderMobile',
      'member2Mobile',
      'member3Mobile',
      'member4Mobile',
    ]

    // Enforce digit-only numeric filter & max length 10 for mobile fields
    if (mobileFields.includes(name) && typeof val === 'string') {
      val = val.replace(/\D/g, '').slice(0, 10)
    }

    setFormData((prev) => ({
      ...prev,
      [name]: val,
    }))

    // Clear error for field
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
    if (submitError) setSubmitError('')
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setErrors((prev) => ({
        ...prev,
        file: 'Invalid file extension. Allowed: PDF, PNG, JPG, JPEG, PPT, PPTX',
      }))
      setSelectedFile(null)
      return
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrors((prev) => ({
        ...prev,
        file: 'File size exceeds maximum allowed limit of 10 MB.',
      }))
      setSelectedFile(null)
      return
    }

    setErrors((prev) => ({ ...prev, file: '' }))
    setSelectedFile(file)
  }

  const validateForm = () => {
    const newErrors = {}

    // Check for duplicate emails within the same registration
    const emails = [
      (formData.teamLeaderEmail || '').trim().toLowerCase(),
      (formData.member2Email || '').trim().toLowerCase(),
      (formData.member3Email || '').trim().toLowerCase()
    ].filter(Boolean)
    if (formData.member4Email && formData.member4Email.trim()) {
      emails.push(formData.member4Email.trim().toLowerCase())
    }
    const uniqueEmails = new Set(emails)
    if (uniqueEmails.size < emails.length) {
      newErrors.teamLeaderEmail = 'Each team member must be unique. Duplicate emails are not allowed.'
      newErrors.member2Email = 'Each team member must be unique. Duplicate emails are not allowed.'
      newErrors.member3Email = 'Each team member must be unique. Duplicate emails are not allowed.'
    }

    // Check for duplicate mobile numbers within the same registration
    const mobiles = [
      (formData.teamLeaderMobile || '').trim(),
      (formData.member2Mobile || '').trim(),
      (formData.member3Mobile || '').trim()
    ].filter(Boolean)
    if (formData.member4Mobile && formData.member4Mobile.trim()) {
      mobiles.push(formData.member4Mobile.trim())
    }
    const uniqueMobiles = new Set(mobiles)
    if (uniqueMobiles.size < mobiles.length) {
      newErrors.teamLeaderMobile = 'Each team member must be unique. Duplicate mobile numbers are not allowed.'
      newErrors.member2Mobile = 'Each team member must be unique. Duplicate mobile numbers are not allowed.'
      newErrors.member3Mobile = 'Each team member must be unique. Duplicate mobile numbers are not allowed.'
    }

    // General & Team Leader
    const effectiveEmail = (formData.email || formData.teamLeaderEmail || '').trim()
    if (!effectiveEmail) {
      newErrors.email = 'Email is required'
    } else if (!SECE_EMAIL_REGEX.test(effectiveEmail)) {
      newErrors.email = 'Please enter a valid SECE email address ending with @sece.ac.in.'
    }

    if (!formData.teamName.trim()) newErrors.teamName = 'Team name is required'

    if (!formData.teamLeaderName.trim())
      newErrors.teamLeaderName = 'Leader name is required'

    if (!formData.teamLeaderEmail.trim()) {
      newErrors.teamLeaderEmail = 'Leader email is required'
    } else if (!SECE_EMAIL_REGEX.test(formData.teamLeaderEmail.trim())) {
      newErrors.teamLeaderEmail = 'Please enter a valid SECE email address ending with @sece.ac.in.'
    }

    if (!formData.teamLeaderMobile.trim()) {
      newErrors.teamLeaderMobile = 'Leader mobile number is required'
    } else if (!INDIAN_MOBILE_REGEX.test(formData.teamLeaderMobile.trim())) {
      newErrors.teamLeaderMobile =
        'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.'
    }

    if (!formData.teamLeaderDepartment.trim())
      newErrors.teamLeaderDepartment = 'Leader department is required'

    // Member 2
    if (!formData.member2Name.trim())
      newErrors.member2Name = 'Member 2 name is required'

    if (!formData.member2Email.trim()) {
      newErrors.member2Email = 'Member 2 email is required'
    } else if (!SECE_EMAIL_REGEX.test(formData.member2Email.trim())) {
      newErrors.member2Email = 'Please enter a valid SECE email address ending with @sece.ac.in.'
    }

    if (!formData.member2Mobile.trim()) {
      newErrors.member2Mobile = 'Member 2 mobile number is required'
    } else if (!INDIAN_MOBILE_REGEX.test(formData.member2Mobile.trim())) {
      newErrors.member2Mobile =
        'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.'
    }

    if (!formData.member2Department.trim())
      newErrors.member2Department = 'Member 2 department is required'

    // Member 3
    if (!formData.member3Name.trim())
      newErrors.member3Name = 'Member 3 name is required'

    if (!formData.member3Email.trim()) {
      newErrors.member3Email = 'Member 3 email is required'
    } else if (!SECE_EMAIL_REGEX.test(formData.member3Email.trim())) {
      newErrors.member3Email = 'Please enter a valid SECE email address ending with @sece.ac.in.'
    }

    if (!formData.member3Mobile.trim()) {
      newErrors.member3Mobile = 'Member 3 mobile number is required'
    } else if (!INDIAN_MOBILE_REGEX.test(formData.member3Mobile.trim())) {
      newErrors.member3Mobile =
        'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.'
    }

    if (!formData.member3Department.trim())
      newErrors.member3Department = 'Member 3 department is required'

    // Optional Member 4 validation if any field filled
    if (
      formData.member4Name ||
      formData.member4Email ||
      formData.member4Mobile ||
      formData.member4Department
    ) {
      if (!formData.member4Name.trim())
        newErrors.member4Name = 'Member 4 name is required'

      if (!formData.member4Email.trim()) {
        newErrors.member4Email = 'Member 4 email is required'
      } else if (!SECE_EMAIL_REGEX.test(formData.member4Email.trim())) {
        newErrors.member4Email = 'Please enter a valid SECE email address ending with @sece.ac.in.'
      }

      if (!formData.member4Mobile.trim()) {
        newErrors.member4Mobile = 'Member 4 mobile number is required'
      } else if (!INDIAN_MOBILE_REGEX.test(formData.member4Mobile.trim())) {
        newErrors.member4Mobile =
          'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.'
      }

      if (!formData.member4Department.trim())
        newErrors.member4Department = 'Member 4 department is required'
    }

    // Faculty Mentor
    if (!formData.facultyMentorName.trim())
      newErrors.facultyMentorName = 'Faculty mentor name is required'
    if (!formData.facultyMentorDepartment.trim())
      newErrors.facultyMentorDepartment =
        'Faculty mentor department is required'

    // Innovation Domain
    if (!formData.innovationDomain)
      newErrors.innovationDomain = 'Please select one primary domain'

    // SDG Goals
    if (!formData.sdgGoals || formData.sdgGoals.length === 0) {
      newErrors.sdgGoals = 'Please select at least one Sustainable Development Goal (SDG)'
    }

    // TRL Level
    if (!formData.trlLevel) {
      newErrors.trlLevel = 'Please select a Technology Readiness Level (TRL)'
    }

    // Product details
    if (!formData.projectTitle.trim())
      newErrors.projectTitle = 'Project title is required'
    if (!formData.problemArea.trim())
      newErrors.problemArea = 'Problem area is required'
    if (!formData.proposedSolution.trim())
      newErrors.proposedSolution = 'Proposed solution is required'
    if (!formData.expectedImpact.trim())
      newErrors.expectedImpact = 'Expected impact is required'

    // Declaration
    if (!formData.declarationAccepted)
      newErrors.declarationAccepted =
        'You must accept the declaration to submit'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    console.log('[Registration] Submit clicked')
    setSubmitError('')

    const isValid = validateForm()
    if (!isValid) {
      console.log('[Registration] Validation failed')
      setSubmitError('Please fix all validation errors before submitting.')
      return
    }

    console.log('[Registration] Validation passed')
    console.log('[Registration] API URL:', API_BASE_URL)

    setIsSubmitting(true)

    try {
      const dataPayload = new FormData()

      const effectiveData = {
        ...formData,
        email: formData.email.trim() || formData.teamLeaderEmail.trim(),
      }

      // Append text fields & array/object fields
      Object.keys(effectiveData).forEach((key) => {
        if (key === 'sdgGoals') {
          dataPayload.append('sdgGoals', JSON.stringify(effectiveData.sdgGoals))
          dataPayload.append('sdg_goals', JSON.stringify(effectiveData.sdgGoals))
        } else if (key === 'trlLevel') {
          dataPayload.append('trlLevel', String(effectiveData.trlLevel))
          dataPayload.append('trl_level', String(effectiveData.trlLevel))
        } else {
          dataPayload.append(key, effectiveData[key])
        }
      })

      // Append file if selected
      if (selectedFile) {
        dataPayload.append('file', selectedFile)
      }

      console.log('[Registration] Sending registration request')

      console.log('[Registration] Sending request, mode isNewIdeaMode =', isNewIdeaMode)

      let response
      if (isNewIdeaMode) {
        const payload = {
          teamId: existingTeamData.team.id,
          projectTitle: formData.projectTitle,
          innovationDomain: formData.innovationDomain,
          problemArea: formData.problemArea,
          proposedSolution: formData.proposedSolution,
          expectedImpact: formData.expectedImpact,
          sdgGoals: formData.sdgGoals,
          trlLevel: formData.trlLevel ? Number(formData.trlLevel) : null,
          declarationAccepted: formData.declarationAccepted
        }

        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token

        response = await fetch(`${API_BASE_URL}/api/submit-new-idea`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload),
        })
      } else {
        response = await fetch(`${API_BASE_URL}/api/registrations`, {
          method: 'POST',
          body: dataPayload,
        })
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        console.error(`Submission failed. Status: ${response.status}`)
        setActivePopup({
          type: 'error',
          title: 'Server Error',
          message: `The server returned an unexpected response (Status ${response.status}). Please check your connection and try again.`,
        })
        return
      }

      const data = await response.json()

      if (!response.ok || !data.success) {
        const rawMsg = String(data.message || '')
        const extractedId =
          data.registration_id ||
          data.registrationId ||
          (rawMsg.match(/(IPL26-\d{4})/i) || [])[1] ||
          null

        // Detect REGISTRATION_CLOSED (HTTP 403 / 409 or code)
        if (
          data.code === 'REGISTRATION_CLOSED' ||
          rawMsg.includes('REGISTRATION_CLOSED') ||
          rawMsg.toLowerCase().includes('registration is currently closed')
        ) {
          console.log('[Registration] Registration closed detected from server')
          setActivePopup(null)
          if (onClose) onClose()
          if (onRegistrationClosed) onRegistrationClosed()
          return
        }

        if (
          data.code === 'MEMBER_ALREADY_REGISTERED' ||
          rawMsg.includes('MEMBER_ALREADY_REGISTERED') ||
          data.code === 'DUPLICATE_MEMBER_IN_TEAM' ||
          rawMsg.includes('DUPLICATE_MEMBER_IN_TEAM')
        ) {
          setActivePopup({
            type: 'duplicate_member',
            title: 'Registration Already Exists',
            message: 'Each team member must be unique.',
            registrationId: extractedId,
          })
          return
        }

        if (
          data.code === 'TEAM_ALREADY_REGISTERED' ||
          rawMsg.includes('TEAM_ALREADY_REGISTERED') ||
          data.code === 'TEAM_NAME_ALREADY_EXISTS' ||
          rawMsg.includes('TEAM_NAME_ALREADY_EXISTS') ||
          rawMsg.includes('team_name')
        ) {
          setActivePopup({
            type: 'duplicate_team',
            title: 'Team Already Registered',
            message: 'This team name has already been registered.',
            registrationId: extractedId,
          })
          return
        }

        // Generic / Unexpected Error
        setActivePopup({
          type: 'error',
          title: 'Unable to Complete Registration',
          message: data.message || 'Something went wrong while submitting your registration. Please try again.',
        })
        return
      }

      console.log('[Registration] Submission success:', data)
      setSuccessData(data)
      window.dispatchEvent(new CustomEvent('refresh-leaderboard'));
      if (isNewIdeaMode) {
        setActivePopup({
          type: 'success',
          title: 'Idea Submitted Successfully',
          message: `New idea registered successfully for team ${data.teamName}.`,
          registrationId: `Product #${data.productNumber}`,
        })
      } else {
        const regId = data.registrationId || data.registration_id
        setActivePopup({
          type: 'success',
          title: 'Registration Successful',
          message: 'Your team has been registered successfully.',
          registrationId: regId,
        })
      }
    } catch (err) {
      console.error('[Registration] Submission error:', err)
      setActivePopup({
        type: 'error',
        title: 'Unable to Complete Registration',
        message: 'Something went wrong while submitting your registration. Please try again.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopyPopupId = (id) => {
    if (id) {
      navigator.clipboard.writeText(id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleClose = () => {
    setSuccessData(null)
    setSubmitError('')
    setActivePopup(null)
    setExistingTeamData(null)
    setIsNewIdeaMode(false)
    setFormData({
      email: '',
      teamName: '',
      teamLeaderName: '',
      teamLeaderEmail: '',
      teamLeaderMobile: '',
      teamLeaderDepartment: '',
      member2Name: '',
      member2Email: '',
      member2Mobile: '',
      member2Department: '',
      member3Name: '',
      member3Email: '',
      member3Mobile: '',
      member3Department: '',
      member4Name: '',
      member4Email: '',
      member4Mobile: '',
      member4Department: '',
      facultyMentorName: '',
      facultyMentorDepartment: '',
      innovationDomain: '',
      sdgGoals: [],
      trlLevel: '',
      projectTitle: '',
      problemArea: '',
      proposedSolution: '',
      expectedImpact: '',
      declarationAccepted: false,
    })
    onClose()
  }

  const handleClosePopup = () => {
    const isSuccess = activePopup?.type === 'success'
    setActivePopup(null)
    if (isSuccess) {
      handleClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/80 p-3 backdrop-blur-sm md:p-6">
      {/* POPUP MODAL OVERLAY */}
      {activePopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl transition-all md:p-8 text-center">
            <button
              type="button"
              onClick={handleClosePopup}
              className="absolute top-4 right-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="Close popup"
            >
              <X size={20} />
            </button>

            {/* Icon Header */}
            {activePopup.type === 'success' ? (
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 size={36} />
              </div>
            ) : activePopup.type === 'error' ? (
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertCircle size={36} />
              </div>
            ) : (
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <AlertCircle size={36} />
              </div>
            )}

            {/* Popup Title */}
            <h3 className="font-heading text-xl font-bold text-slate-900 md:text-2xl">
              {activePopup.title}
            </h3>

            {/* Popup Message */}
            <p className="mt-2 text-sm text-slate-600 font-medium leading-relaxed">
              {activePopup.message}
            </p>

            {/* Registration ID Badge */}
            {activePopup.registrationId && (
              <div className="my-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {activePopup.type === 'success' ? 'Registration ID' : 'Existing Registration ID'}
                </p>
                <div className="mt-2 flex items-center justify-center gap-3">
                  <span className="font-heading text-2xl font-extrabold tracking-tight text-slate-900">
                    {activePopup.registrationId}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyPopupId(activePopup.registrationId)}
                    className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-all"
                  >
                    {copied ? (
                      <>
                        <Check size={14} className="text-emerald-600" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={14} /> Copy ID
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Close Action Button */}
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={handleClosePopup}
                className="w-full rounded-full bg-slate-900 px-8 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800 hover:shadow-lg sm:w-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 md:px-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-accent">
              {isNewIdeaMode ? 'Existing Team Submission' : 'IPL 2026 Registration'}
            </span>
            <h2 className="font-heading text-xl font-bold text-slate-900 md:text-2xl">
              {isNewIdeaMode ? 'Submit New Idea' : 'Team Registration Form'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {isNewIdeaMode && (
              <button
                type="button"
                onClick={handleCancelNewIdeaMode}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-all focus:outline-none"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close modal"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {/* FORM STATE */}
          <form onSubmit={handleSubmit} className="space-y-8" noValidate>
            {submitError && submitError.startsWith('Please fix') && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertCircle size={20} className="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-bold">Form Validation Warning</p>
                  <p className="mt-0.5">{submitError}</p>
                </div>
              </div>
            )}

            {/* 1. TEAM INFORMATION */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 md:p-6">
              <div className="mb-4 flex items-center gap-2.5 border-b border-slate-200 pb-3 text-slate-900">
                <Users className="text-accent" size={20} />
                <h3 className="font-heading text-lg font-bold">1. Team Information</h3>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Team Name *
                  </label>
                  <input
                    type="text"
                    name="teamName"
                    value={formData.teamName}
                    onChange={handleChange}
                    onBlur={handleTeamNameBlur}
                    readOnly={isNewIdeaMode}
                    disabled={isNewIdeaMode}
                    placeholder="e.g. Innovators 2026"
                    autoComplete="organization"
                    className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                      isNewIdeaMode
                        ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-500'
                        : errors.teamName
                          ? 'bg-white border-red-400 focus:ring-red-200'
                          : 'bg-white border-slate-300 focus:border-accent focus:ring-amber-100'
                    }`}
                  />
                  {errors.teamName && (
                    <p className="mt-1 text-xs text-red-600">{errors.teamName}</p>
                  )}
                  {isCheckingTeam && (
                    <p className="mt-1 text-xs text-slate-500">Checking team existence...</p>
                  )}
                  {existingTeamData && !isNewIdeaMode && (
                    <div className="mt-4 p-4 border border-amber-200 bg-amber-50 rounded-xl space-y-3">
                      <div className="flex items-start gap-2 text-amber-800">
                        <AlertCircle className="shrink-0 mt-0.5" size={18} />
                        <div>
                          <p className="font-semibold text-sm">Team already exists</p>
                          <p className="text-xs text-amber-700 mt-1">
                            Team <strong>{existingTeamData.team.team_name}</strong> is already registered.
                          </p>
                          <div className="mt-2 text-xs space-y-1">
                            <span className="font-semibold text-amber-800">Existing Members:</span>
                            <ul className="list-disc list-inside text-amber-700 space-y-0.5">
                              {existingTeamData.members.map((m, idx) => (
                                <li key={idx}>
                                  {m.member_name} ({m.role === 'Team Leader' ? 'Leader' : 'Member'} - {m.department_name})
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleStartNewIdeaMode}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-all focus:outline-none"
                        >
                          Submit New Idea
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 border-t border-slate-200/80 pt-4">
                <h4 className="mb-3 text-sm font-bold text-slate-800 flex items-center gap-2">
                  <User size={16} className="text-primary" /> Team Leader Details
                </h4>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Leader Name *
                    </label>
                    <input
                      type="text"
                      name="teamLeaderName"
                      value={formData.teamLeaderName}
                      onChange={handleChange}
                      readOnly={isNewIdeaMode}
                      disabled={isNewIdeaMode}
                      placeholder="Full Name"
                      autoComplete="name"
                      className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                        isNewIdeaMode
                          ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-500'
                          : errors.teamLeaderName
                            ? 'bg-white border-red-400 focus:ring-red-200'
                            : 'bg-white border-slate-300 focus:border-accent focus:ring-amber-100'
                      }`}
                    />
                    {errors.teamLeaderName && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.teamLeaderName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Leader Email *
                    </label>
                    <input
                      type="email"
                      name="teamLeaderEmail"
                      value={formData.teamLeaderEmail}
                      onChange={handleChange}
                      readOnly={isNewIdeaMode}
                      disabled={isNewIdeaMode}
                      placeholder="name@sece.ac.in"
                      autoComplete="email"
                      className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                        isNewIdeaMode
                          ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-500'
                          : errors.teamLeaderEmail
                            ? 'bg-white border-red-400 focus:ring-red-200'
                            : 'bg-white border-slate-300 focus:border-accent focus:ring-amber-100'
                      }`}
                    />
                    {errors.teamLeaderEmail && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.teamLeaderEmail}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Leader Mobile No *
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      name="teamLeaderMobile"
                      value={formData.teamLeaderMobile}
                      onChange={handleChange}
                      readOnly={isNewIdeaMode}
                      disabled={isNewIdeaMode}
                      placeholder="10-digit Indian Mobile No"
                      autoComplete="tel"
                      className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                        isNewIdeaMode
                          ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-500'
                          : errors.teamLeaderMobile
                            ? 'bg-white border-red-400 focus:ring-red-200'
                            : 'bg-white border-slate-300 focus:border-accent focus:ring-amber-100'
                      }`}
                    />
                    {errors.teamLeaderMobile && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.teamLeaderMobile}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Leader Department *
                    </label>
                    <select
                      name="teamLeaderDepartment"
                      value={formData.teamLeaderDepartment}
                      onChange={handleChange}
                      disabled={isNewIdeaMode}
                      className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                        isNewIdeaMode
                          ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-500'
                          : errors.teamLeaderDepartment
                            ? 'bg-white border-red-400 focus:ring-red-200'
                            : 'bg-white border-slate-300 focus:border-accent focus:ring-amber-100'
                      }`}
                    >
                      <option value="">Select Department</option>
                      {(departments.length > 0 ? departments : OFFICIAL_DEPARTMENTS).map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                    {errors.teamLeaderDepartment && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.teamLeaderDepartment}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. TEAM MEMBERS */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 md:p-6 space-y-6">
              <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3 text-slate-900">
                <Users className="text-accent" size={20} />
                <h3 className="font-heading text-lg font-bold">2. Team Members</h3>
              </div>

              {/* Team Member 2 */}
              <div>
                <h4 className="mb-3 text-sm font-bold text-slate-800">
                  Team Member 2 *
                </h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Name *
                    </label>
                    <input
                      type="text"
                      name="member2Name"
                      value={formData.member2Name}
                      onChange={handleChange}
                      readOnly={isNewIdeaMode}
                      disabled={isNewIdeaMode}
                      placeholder="Full Name"
                      autoComplete="name"
                      className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                        isNewIdeaMode
                          ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-500'
                          : errors.member2Name
                            ? 'bg-white border-red-400 focus:ring-red-200'
                            : 'bg-white border-slate-300 focus:border-accent focus:ring-amber-100'
                      }`}
                    />
                    {errors.member2Name && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.member2Name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Email *
                    </label>
                    <input
                      type="email"
                      name="member2Email"
                      value={formData.member2Email}
                      onChange={handleChange}
                      readOnly={isNewIdeaMode}
                      disabled={isNewIdeaMode}
                      placeholder="name@sece.ac.in"
                      autoComplete="email"
                      className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                        isNewIdeaMode
                          ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-500'
                          : errors.member2Email
                            ? 'bg-white border-red-400 focus:ring-red-200'
                            : 'bg-white border-slate-300 focus:border-accent focus:ring-amber-100'
                      }`}
                    />
                    {errors.member2Email && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.member2Email}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Mobile No *
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      name="member2Mobile"
                      value={formData.member2Mobile}
                      onChange={handleChange}
                      readOnly={isNewIdeaMode}
                      disabled={isNewIdeaMode}
                      placeholder="10-digit Indian Mobile No"
                      autoComplete="tel"
                      className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                        isNewIdeaMode
                          ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-500'
                          : errors.member2Mobile
                            ? 'bg-white border-red-400 focus:ring-red-200'
                            : 'bg-white border-slate-300 focus:border-accent focus:ring-amber-100'
                      }`}
                    />
                    {errors.member2Mobile && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.member2Mobile}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Department *
                    </label>
                    <select
                      name="member2Department"
                      value={formData.member2Department}
                      onChange={handleChange}
                      disabled={isNewIdeaMode}
                      className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                        isNewIdeaMode
                          ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-500'
                          : errors.member2Department
                            ? 'bg-white border-red-400 focus:ring-red-200'
                            : 'bg-white border-slate-300 focus:border-accent focus:ring-amber-100'
                      }`}
                    >
                      <option value="">Select Department</option>
                      {(departments.length > 0 ? departments : OFFICIAL_DEPARTMENTS).map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                    {errors.member2Department && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.member2Department}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Team Member 3 */}
              <div className="border-t border-slate-200/80 pt-4">
                <h4 className="mb-3 text-sm font-bold text-slate-800">
                  Team Member 3 *
                </h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Name *
                    </label>
                    <input
                      type="text"
                      name="member3Name"
                      value={formData.member3Name}
                      onChange={handleChange}
                      readOnly={isNewIdeaMode}
                      disabled={isNewIdeaMode}
                      placeholder="Full Name"
                      autoComplete="name"
                      className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                        isNewIdeaMode
                          ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-500'
                          : errors.member3Name
                            ? 'bg-white border-red-400 focus:ring-red-200'
                            : 'bg-white border-slate-300 focus:border-accent focus:ring-amber-100'
                      }`}
                    />
                    {errors.member3Name && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.member3Name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Email *
                    </label>
                    <input
                      type="email"
                      name="member3Email"
                      value={formData.member3Email}
                      onChange={handleChange}
                      readOnly={isNewIdeaMode}
                      disabled={isNewIdeaMode}
                      placeholder="name@sece.ac.in"
                      autoComplete="email"
                      className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                        isNewIdeaMode
                          ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-500'
                          : errors.member3Email
                            ? 'bg-white border-red-400 focus:ring-red-200'
                            : 'bg-white border-slate-300 focus:border-accent focus:ring-amber-100'
                      }`}
                    />
                    {errors.member3Email && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.member3Email}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Mobile No *
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      name="member3Mobile"
                      value={formData.member3Mobile}
                      onChange={handleChange}
                      readOnly={isNewIdeaMode}
                      disabled={isNewIdeaMode}
                      placeholder="10-digit Indian Mobile No"
                      autoComplete="tel"
                      className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                        isNewIdeaMode
                          ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-500'
                          : errors.member3Mobile
                            ? 'bg-white border-red-400 focus:ring-red-200'
                            : 'bg-white border-slate-300 focus:border-accent focus:ring-amber-100'
                      }`}
                    />
                    {errors.member3Mobile && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.member3Mobile}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Department *
                    </label>
                    <select
                      name="member3Department"
                      value={formData.member3Department}
                      onChange={handleChange}
                      disabled={isNewIdeaMode}
                      className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                        isNewIdeaMode
                          ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-500'
                          : errors.member3Department
                            ? 'bg-white border-red-400 focus:ring-red-200'
                            : 'bg-white border-slate-300 focus:border-accent focus:ring-amber-100'
                      }`}
                    >
                      <option value="">Select Department</option>
                      {(departments.length > 0 ? departments : OFFICIAL_DEPARTMENTS).map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                    {errors.member3Department && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.member3Department}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. FACULTY MENTOR */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 md:p-6">
              <div className="mb-4 flex items-center gap-2.5 border-b border-slate-200 pb-3 text-slate-900">
                <Building className="text-accent" size={20} />
                <h3 className="font-heading text-lg font-bold">
                  3. Faculty Mentor
                </h3>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {mentorsList.length > 0 && !isNewIdeaMode && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Choose Faculty Mentor *
                    </label>
                    <select
                      value={formData.facultyMentorId ? formData.facultyMentorId : (selectedMentorType === 'other' ? 'other' : '')}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val === 'other') {
                          setSelectedMentorType('other')
                          setFormData((prev) => ({
                            ...prev,
                            facultyMentorId: '',
                            facultyMentorName: '',
                            facultyMentorDepartment: ''
                          }))
                        } else if (val === '') {
                          setSelectedMentorType('')
                          setFormData((prev) => ({
                            ...prev,
                            facultyMentorId: '',
                            facultyMentorName: '',
                            facultyMentorDepartment: ''
                          }))
                        } else {
                          setSelectedMentorType('preset')
                          const selected = mentorsList.find(m => m.id === val)
                          if (selected) {
                            setFormData((prev) => ({
                              ...prev,
                              facultyMentorId: selected.id,
                              facultyMentorName: selected.name,
                              facultyMentorDepartment: selected.department
                            }))
                          }
                        }
                      }}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-accent focus:ring-2 focus:ring-amber-100"
                    >
                      <option value="">Select Faculty Mentor...</option>
                      {mentorsList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.department})
                        </option>
                      ))}
                      <option value="other">Other (Enter name manually)</option>
                    </select>
                  </div>
                )}

                {((selectedMentorType === 'other') || mentorsList.length === 0 || isNewIdeaMode) && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                        Faculty Mentor Name *
                      </label>
                      <input
                        type="text"
                        name="facultyMentorName"
                        value={formData.facultyMentorName}
                        onChange={handleChange}
                        readOnly={isNewIdeaMode}
                        disabled={isNewIdeaMode}
                        placeholder="Dr. / Prof. Full Name"
                        autoComplete="name"
                        className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                          isNewIdeaMode
                            ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-500'
                            : errors.facultyMentorName
                              ? 'bg-white border-red-400 focus:ring-red-200'
                              : 'bg-white border-slate-300 focus:border-accent focus:ring-amber-100'
                        }`}
                      />
                      {errors.facultyMentorName && (
                        <p className="mt-1 text-xs text-red-600">
                          {errors.facultyMentorName}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                        Faculty Mentor Department *
                      </label>
                      <select
                        name="facultyMentorDepartment"
                        value={formData.facultyMentorDepartment}
                        onChange={handleChange}
                        disabled={isNewIdeaMode}
                        className={`mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                          isNewIdeaMode
                            ? 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-500'
                            : errors.facultyMentorDepartment
                              ? 'bg-white border-red-400 focus:ring-red-200'
                              : 'bg-white border-slate-300 focus:border-accent focus:ring-amber-100'
                        }`}
                      >
                        <option value="">Select Department</option>
                        {(departments.length > 0 ? departments : OFFICIAL_DEPARTMENTS).map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                      {errors.facultyMentorDepartment && (
                        <p className="mt-1 text-xs text-red-600">
                          {errors.facultyMentorDepartment}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 4. INNOVATION DOMAIN */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 md:p-6">
              <div className="mb-4 flex items-center gap-2.5 border-b border-slate-200 pb-3 text-slate-900">
                <Lightbulb className="text-accent" size={20} />
                <h3 className="font-heading text-lg font-bold">
                  4. Innovation Domain
                </h3>
              </div>

              <p className="mb-4 text-xs font-medium text-slate-600">
                Select exactly ONE primary innovation domain for your team project:
              </p>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {OFFICIAL_DOMAINS.map((domain) => {
                  const isSelected = formData.innovationDomain === domain
                  return (
                    <label
                      key={domain}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-xs font-semibold transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 text-primary shadow-sm ring-1 ring-primary'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="innovationDomain"
                        value={domain}
                        checked={isSelected}
                        onChange={handleChange}
                        className="h-4 w-4 accent-primary"
                      />
                      <span>{domain}</span>
                    </label>
                  )
                })}
              </div>
              {errors.innovationDomain && (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  {errors.innovationDomain}
                </p>
              )}
            </div>

            {/* 5. SUSTAINABLE DEVELOPMENT GOALS (SDGs) */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 md:p-6">
              <div className="mb-4 flex items-center gap-2.5 border-b border-slate-200 pb-3 text-slate-900">
                <Globe className="text-accent" size={20} />
                <h3 className="font-heading text-lg font-bold">
                  5. Sustainable Development Goals (SDGs)
                </h3>
              </div>

              <p className="mb-4 text-xs font-medium text-slate-600">
                Select one or more Sustainable Development Goals (SDGs) aligned with your project:
              </p>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {SDG_GOALS.map((sdg) => {
                  const isChecked = (formData.sdgGoals || []).includes(sdg)
                  return (
                    <label
                      key={sdg}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-xs font-semibold transition-all ${
                        isChecked
                          ? 'border-primary bg-primary/5 text-primary shadow-sm ring-1 ring-primary'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        value={sdg}
                        checked={isChecked}
                        onChange={() => handleSdgToggle(sdg)}
                        className="h-4 w-4 rounded accent-primary shrink-0"
                      />
                      <span>{sdg}</span>
                    </label>
                  )
                })}
              </div>
              {errors.sdgGoals && (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  {errors.sdgGoals}
                </p>
              )}
            </div>

            {/* 6. TECHNOLOGY READINESS LEVEL (TRL) */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 md:p-6">
              <div className="mb-4 flex items-center gap-2.5 border-b border-slate-200 pb-3 text-slate-900">
                <Rocket className="text-accent" size={20} />
                <h3 className="font-heading text-lg font-bold">
                  6. Technology Readiness Level (TRL)
                </h3>
              </div>

              <p className="mb-4 text-xs font-medium text-slate-600">
                Select exactly ONE Technology Readiness Level (TRL 1 through TRL 9) for your project:
              </p>

              <div className="space-y-2.5">
                {TRL_LEVELS.map(({ level, description }) => {
                  const isSelected = String(formData.trlLevel) === String(level)
                  return (
                    <label
                      key={level}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-xs font-semibold transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 text-primary shadow-sm ring-1 ring-primary'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="trlLevel"
                        value={level}
                        checked={isSelected}
                        onChange={handleChange}
                        className="mt-0.5 h-4 w-4 accent-primary shrink-0"
                      />
                      <div>
                        <span className="font-bold text-slate-900">TRL {level}</span>
                        <span className="mx-2 text-slate-400">—</span>
                        <span className="font-medium text-slate-700">{description}</span>
                      </div>
                    </label>
                  )
                })}
              </div>
              {errors.trlLevel && (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  {errors.trlLevel}
                </p>
              )}
            </div>

            {/* 7. PRODUCT DETAILS */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 md:p-6 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3 text-slate-900">
                <FileText className="text-accent" size={20} />
                <h3 className="font-heading text-lg font-bold">
                  7. Product / Project Details
                </h3>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Proposed Product / Project Title *
                </label>
                <input
                  type="text"
                  name="projectTitle"
                  value={formData.projectTitle}
                  onChange={handleChange}
                  placeholder="Clear title describing your innovation"
                  className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                    errors.projectTitle
                      ? 'border-red-400 focus:ring-red-200'
                      : 'border-slate-300 focus:border-accent focus:ring-amber-100'
                  }`}
                />
                {errors.projectTitle && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.projectTitle}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Problem Area *
                </label>
                <textarea
                  name="problemArea"
                  rows={3}
                  value={formData.problemArea}
                  onChange={handleChange}
                  placeholder="Describe the real-world problem you are addressing..."
                  className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                    errors.problemArea
                      ? 'border-red-400 focus:ring-red-200'
                      : 'border-slate-300 focus:border-accent focus:ring-amber-100'
                  }`}
                />
                {errors.problemArea && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.problemArea}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Proposed Solution *
                </label>
                <textarea
                  name="proposedSolution"
                  rows={3}
                  value={formData.proposedSolution}
                  onChange={handleChange}
                  placeholder="Explain your innovative technical/business solution..."
                  className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                    errors.proposedSolution
                      ? 'border-red-400 focus:ring-red-200'
                      : 'border-slate-300 focus:border-accent focus:ring-amber-100'
                  }`}
                />
                {errors.proposedSolution && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.proposedSolution}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Expected Impact *
                </label>
                <textarea
                  name="expectedImpact"
                  rows={3}
                  value={formData.expectedImpact}
                  onChange={handleChange}
                  placeholder="Detail the expected social, economic, or technological impact..."
                  className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                    errors.expectedImpact
                      ? 'border-red-400 focus:ring-red-200'
                      : 'border-slate-300 focus:border-accent focus:ring-amber-100'
                  }`}
                />
                {errors.expectedImpact && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.expectedImpact}
                  </p>
                )}
              </div>
            </div>

            {/* 8. DECLARATION */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 md:p-6">
              <div className="mb-3 flex items-center gap-2.5 border-b border-slate-200 pb-3 text-slate-900">
                <ShieldAlert className="text-accent" size={20} />
                <h3 className="font-heading text-lg font-bold">
                  8. Declaration
                </h3>
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="declarationAccepted"
                  checked={formData.declarationAccepted}
                  onChange={handleChange}
                  className="mt-1 h-4 w-4 rounded accent-primary shrink-0"
                />
                <span className="text-xs font-medium leading-relaxed text-slate-700">
                  I confirm that the information provided is accurate and that my
                  team agrees to follow the rules, guidelines, deadlines, and
                  evaluation procedures of IPL 2026.
                </span>
              </label>
              {errors.declarationAccepted && (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  {errors.declarationAccepted}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex items-center justify-end gap-4 border-t border-slate-200 pt-6">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-amber-600 hover:shadow-xl disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <MechanicalLoader size={18} className="text-current" />
                    Submitting...
                  </>
                ) : isNewIdeaMode ? (
                  'Submit New Idea'
                ) : (
                  'Submit Registration'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
