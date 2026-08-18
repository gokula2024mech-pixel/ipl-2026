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
  Loader2,
} from 'lucide-react'

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

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.ppt', '.pptx']
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')
const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl.slice(0, -4) : rawApiUrl

const SECE_EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@sece\.ac\.in$/i
const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/

export default function RegistrationModal({ isOpen, onClose }) {
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
    innovationDomain: '',
    projectTitle: '',
    problemArea: '',
    proposedSolution: '',
    expectedImpact: '',
    declarationAccepted: false,
  })

  const [selectedFile, setSelectedFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [successData, setSuccessData] = useState(null)
  const [copied, setCopied] = useState(false)

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

      // Append text fields
      Object.keys(effectiveData).forEach((key) => {
        dataPayload.append(key, effectiveData[key])
      })

      // Append file if selected
      if (selectedFile) {
        dataPayload.append('file', selectedFile)
      }

      console.log('[Registration] Sending registration request')

      const response = await fetch(`${API_BASE_URL}/api/registrations`, {
        method: 'POST',
        body: dataPayload,
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Registration submission failed.')
      }

      console.log('[Registration] Submission success:', data)
      setSuccessData(data)
    } catch (err) {
      console.error('[Registration] Submission error:', err)
      setSubmitError(
        err.message ||
          'Failed to connect to backend server. Please make sure the server is running.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopyId = () => {
    if (successData?.registrationId) {
      navigator.clipboard.writeText(successData.registrationId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleClose = () => {
    setSuccessData(null)
    setSubmitError('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/80 p-3 backdrop-blur-sm md:p-6">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 md:px-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-accent">
              IPL 2026 Registration
            </span>
            <h2 className="font-heading text-xl font-bold text-slate-900 md:text-2xl">
              Team Registration Form
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {successData ? (
            /* SUCCESS STATE SCREEN */
            <div className="py-6 text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 size={48} />
              </div>
              <h3 className="font-heading text-2xl font-bold text-slate-900 md:text-3xl">
                🎉 Registration Successful!
              </h3>
              <p className="mx-auto mt-3 max-w-md text-base text-slate-600">
                Your team has been successfully registered for{' '}
                <span className="font-semibold text-slate-800">
                  IPL-2026 — Innovative Product League
                </span>
                .
              </p>

              {/* Registration ID Display Card */}
              <div className="mx-auto my-8 max-w-sm rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Your Registration ID
                </p>
                <div className="mt-2 flex items-center justify-center gap-3">
                  <span className="font-heading text-3xl font-extrabold tracking-tight text-emerald-700">
                    {successData.registrationId}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm transition-all hover:bg-emerald-50"
                  >
                    {copied ? (
                      <>
                        <Check size={16} className="text-emerald-600" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={16} /> Copy ID
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50/80 p-4 max-w-md mx-auto text-sm text-amber-900">
                ⚠️ Please save this Registration ID for future reference and evaluation tracking.
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-8 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:bg-slate-800 hover:shadow-xl"
              >
                Back to Home
              </button>
            </div>
          ) : (
            /* FORM STATE */
            <form onSubmit={handleSubmit} className="space-y-8" noValidate>
              {submitError && (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <AlertCircle size={20} className="mt-0.5 shrink-0 text-red-600" />
                  <div>
                    <p className="font-bold">Submission Error</p>
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
                      placeholder="e.g. Innovators 2026"
                      className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                        errors.teamName
                          ? 'border-red-400 focus:ring-red-200'
                          : 'border-slate-300 focus:border-accent focus:ring-amber-100'
                      }`}
                    />
                    {errors.teamName && (
                      <p className="mt-1 text-xs text-red-600">{errors.teamName}</p>
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
                        placeholder="Full Name"
                        className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                          errors.teamLeaderName
                            ? 'border-red-400 focus:ring-red-200'
                            : 'border-slate-300 focus:border-accent focus:ring-amber-100'
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
                        placeholder="name@sece.ac.in"
                        className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                          errors.teamLeaderEmail
                            ? 'border-red-400 focus:ring-red-200'
                            : 'border-slate-300 focus:border-accent focus:ring-amber-100'
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
                        placeholder="10-digit Indian Mobile No"
                        className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                          errors.teamLeaderMobile
                            ? 'border-red-400 focus:ring-red-200'
                            : 'border-slate-300 focus:border-accent focus:ring-amber-100'
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
                      <input
                        type="text"
                        name="teamLeaderDepartment"
                        value={formData.teamLeaderDepartment}
                        onChange={handleChange}
                        placeholder="eg : Mechanical Department"
                        className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                          errors.teamLeaderDepartment
                            ? 'border-red-400 focus:ring-red-200'
                            : 'border-slate-300 focus:border-accent focus:ring-amber-100'
                        }`}
                      />
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
                        placeholder="Full Name"
                        className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                          errors.member2Name
                            ? 'border-red-400 focus:ring-red-200'
                            : 'border-slate-300 focus:border-accent focus:ring-amber-100'
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
                        placeholder="name@sece.ac.in"
                        className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                          errors.member2Email
                            ? 'border-red-400 focus:ring-red-200'
                            : 'border-slate-300 focus:border-accent focus:ring-amber-100'
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
                        placeholder="10-digit Indian Mobile No"
                        className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                          errors.member2Mobile
                            ? 'border-red-400 focus:ring-red-200'
                            : 'border-slate-300 focus:border-accent focus:ring-amber-100'
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
                      <input
                        type="text"
                        name="member2Department"
                        value={formData.member2Department}
                        onChange={handleChange}
                        placeholder="eg : Mechanical Department"
                        className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                          errors.member2Department
                            ? 'border-red-400 focus:ring-red-200'
                            : 'border-slate-300 focus:border-accent focus:ring-amber-100'
                        }`}
                      />
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
                        placeholder="Full Name"
                        className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                          errors.member3Name
                            ? 'border-red-400 focus:ring-red-200'
                            : 'border-slate-300 focus:border-accent focus:ring-amber-100'
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
                        placeholder="name@sece.ac.in"
                        className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                          errors.member3Email
                            ? 'border-red-400 focus:ring-red-200'
                            : 'border-slate-300 focus:border-accent focus:ring-amber-100'
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
                        placeholder="10-digit Indian Mobile No"
                        className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                          errors.member3Mobile
                            ? 'border-red-400 focus:ring-red-200'
                            : 'border-slate-300 focus:border-accent focus:ring-amber-100'
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
                      <input
                        type="text"
                        name="member3Department"
                        value={formData.member3Department}
                        onChange={handleChange}
                        placeholder="eg : Mechanical Department"
                        className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                          errors.member3Department
                            ? 'border-red-400 focus:ring-red-200'
                            : 'border-slate-300 focus:border-accent focus:ring-amber-100'
                        }`}
                      />
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
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Faculty Mentor Name *
                    </label>
                    <input
                      type="text"
                      name="facultyMentorName"
                      value={formData.facultyMentorName}
                      onChange={handleChange}
                      placeholder="Dr. / Prof. Full Name"
                      className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                        errors.facultyMentorName
                          ? 'border-red-400 focus:ring-red-200'
                          : 'border-slate-300 focus:border-accent focus:ring-amber-100'
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
                    <input
                      type="text"
                      name="facultyMentorDepartment"
                      value={formData.facultyMentorDepartment}
                      onChange={handleChange}
                      placeholder="eg : Mechanical Department"
                      className={`mt-1 w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:ring-2 ${
                        errors.facultyMentorDepartment
                          ? 'border-red-400 focus:ring-red-200'
                          : 'border-slate-300 focus:border-accent focus:ring-amber-100'
                      }`}
                    />
                    {errors.facultyMentorDepartment && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.facultyMentorDepartment}
                      </p>
                    )}
                  </div>
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

              {/* 5. PRODUCT DETAILS */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 md:p-6 space-y-4">
                <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3 text-slate-900">
                  <FileText className="text-accent" size={20} />
                  <h3 className="font-heading text-lg font-bold">
                    5. Product / Project Details
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

              {/* 7. DECLARATION */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 md:p-6">
                <div className="mb-3 flex items-center gap-2.5 border-b border-slate-200 pb-3 text-slate-900">
                  <ShieldAlert className="text-accent" size={20} />
                  <h3 className="font-heading text-lg font-bold">
                    7. Declaration
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
                    evaluation procedures of IPDP 2026. *
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
                      <Loader2 size={18} className="animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Registration'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
