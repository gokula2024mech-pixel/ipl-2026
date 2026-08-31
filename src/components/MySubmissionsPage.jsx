import { useState, useEffect } from 'react'
import { Award, Lightbulb, Users, AlertCircle, Download, Upload, FileText, AlertTriangle, ArrowLeft, ArrowRight, Calendar, Edit3 } from 'lucide-react'
import MechanicalLoader from './MechanicalLoader'
import { supabase } from '../supabaseClient'

const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')
const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl.slice(0, -4) : rawApiUrl

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

function normalizeMentorDepartment(val) {
  if (!val) return '';
  const s = val.trim().toLowerCase().replace(/\s+/g, ' ');

  // 1. Check AIML
  if (
    s.includes('aiml') ||
    s.includes('machine learning') ||
    s.includes('machine language') ||
    s.includes('ai&ml') ||
    s.includes('ai & ml') ||
    s.includes('ai/ml') ||
    s.includes('ai and ml')
  ) {
    return 'Artificial Intelligence and Machine Learning';
  }

  // 2. Check AIDS
  if (
    s.includes('aids') ||
    s.includes('data science') ||
    s.includes('ai&ds') ||
    s.includes('ai & ds') ||
    s.includes('ai/ds') ||
    s.includes('ai and ds')
  ) {
    return 'Artificial Intelligence and Data Science';
  }

  // 3. Check CSBS
  if (
    s.includes('csbs') ||
    s.includes('business system')
  ) {
    return 'Computer Science and Business System';
  }

  // 4. Check Cyber Security
  if (
    s.includes('cyber security') ||
    s.includes('cybersecurity')
  ) {
    return 'Cyber Security';
  }

  // 5. Check CCE
  if (
    s.includes('cce') ||
    s.includes('computer and communication') ||
    s.includes('computer & communication')
  ) {
    return 'Computer and Communication Engineering';
  }

  // 6. Check ECE
  if (
    s.includes('ece') ||
    s.includes('electronics and communication') ||
    s.includes('electronics & communication') ||
    s.includes('electrical and communication')
  ) {
    return 'Electronics and Communication Engineering';
  }

  // 7. Check EEE
  if (
    s.includes('eee') ||
    s.includes('electrical and electronics') ||
    s.includes('electrical and electronic') ||
    s.includes('electrical & electronics') ||
    s.includes('electrical & electronic')
  ) {
    return 'Electrical and Electronics Engineering';
  }

  // 8. Check CSE
  if (
    s.includes('cse') ||
    s.includes('computer science') ||
    s.includes('computer scinece') ||
    s.includes('computer and science')
  ) {
    return 'Computer Science and Engineering';
  }

  // 9. Check IT
  if (
    s.includes('information technology') ||
    /\bit\b/.test(s)
  ) {
    return 'Information Technology';
  }

  // 10. Check Mechanical
  if (
    s.includes('mech') ||
    s.includes('mechanical')
  ) {
    return 'Mechanical Engineering';
  }

  return val;
}

export default function MySubmissionsPage({ onBackToHome, selectedPhase = 'my_submissions', setSelectedPhase }) {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [phasesList, setPhasesList] = useState([])

  const [phase1Active, setPhase1Active] = useState(false)
  const [phase1Deadline, setPhase1Deadline] = useState(null)
  const [phase1Submissions, setPhase1Submissions] = useState([])
  const [activeTemplates, setActiveTemplates] = useState([])

  const [uploadingDocId, setUploadingDocId] = useState(null)
  const [downloadingTemplateDocType, setDownloadingTemplateDocType] = useState(null)
  const [currentPageIndex, setCurrentPageIndex] = useState(0)

  // Patent classification selection
  const [selectedCategory, setSelectedCategory] = useState('Hardware')
  const [selectedPatentType, setSelectedPatentType] = useState('Design Patent')

  // Edit Team Details states
  const [isEditing, setIsEditing] = useState(false)
  const [editProjectTitle, setEditProjectTitle] = useState('')
  const [editProblemArea, setEditProblemArea] = useState('')
  const [editProposedSolution, setEditProposedSolution] = useState('')
  const [editExpectedImpact, setEditExpectedImpact] = useState('')
  const [editInnovationDomain, setEditInnovationDomain] = useState('')
  const [editSdgGoals, setEditSdgGoals] = useState([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('')
  const [saveErrorMsg, setSaveErrorMsg] = useState('')

  // Clean up editing mode when selected team changes
  useEffect(() => {
    setIsEditing(false)
    setSaveSuccessMsg('')
    setSaveErrorMsg('')
  }, [currentPageIndex])

  const startEditing = () => {
    if (!currentPage) return
    const team = currentPage.team
    const idea = currentPage.idea

    setEditProjectTitle(idea ? idea.product_title : team.projectTitle || '')
    setEditInnovationDomain(idea ? idea.innovation_domain : team.innovationDomain || '')
    setEditProblemArea(idea ? idea.problem_area : team.problemArea || '')
    setEditProposedSolution(idea ? idea.proposed_solution : team.proposedSolution || '')
    setEditExpectedImpact(idea ? idea.expected_impact : team.expectedImpact || '')
    setEditSdgGoals(team.sdgGoals || [])
    setIsEditing(true)
    setSaveSuccessMsg('')
    setSaveErrorMsg('')
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setSaveSuccessMsg('')
    setSaveErrorMsg('')
  }

  const handleSaveChanges = async (e) => {
    e.preventDefault()
    if (!currentPage) return

    if (!editProjectTitle.trim()) {
      setSaveErrorMsg('Project Title is required.')
      return
    }
    if (!editProblemArea.trim()) {
      setSaveErrorMsg('Problem Area is required.')
      return
    }
    if (!editProposedSolution.trim()) {
      setSaveErrorMsg('Proposed Solution is required.')
      return
    }
    if (!editExpectedImpact.trim()) {
      setSaveErrorMsg('Expected Impact is required.')
      return
    }
    if (!editInnovationDomain.trim()) {
      setSaveErrorMsg('Innovation Domain is required.')
      return
    }

    setIsSaving(true)
    setSaveErrorMsg('')
    setSaveSuccessMsg('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Authentication session expired. Please log in again.')

      const regId = currentPage.team.registrationId

      const response = await fetch(`${API_BASE_URL}/api/registrations/${regId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          projectTitle: editProjectTitle,
          problemArea: editProblemArea,
          proposedSolution: editProposedSolution,
          expectedImpact: editExpectedImpact,
          innovationDomain: editInnovationDomain,
          sdgGoals: editSdgGoals
        })
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to update team details. Please try again.')
      }

      setSaveSuccessMsg('Team details updated successfully.')
      setIsEditing(false)

      // Refresh data to show updated fields immediately
      await fetchSubmissions()

      // Auto-hide success message after 4 seconds
      setTimeout(() => setSaveSuccessMsg(''), 4000)
    } catch (err) {
      setSaveErrorMsg(err.message || 'Unable to update team details. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    fetchSubmissions()
  }, [])

  const fetchSubmissions = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('Authentication required. Please log in.')
      }

      setUserEmail(session?.user?.email || '')

      // 1. Fetch registrations list
      const response = await fetch(`${API_BASE_URL}/api/my-submissions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error('Unable to retrieve submissions.')
      }

      const data = await response.json()
      if (data.success) {
        setSubmissions(data.submissions || [])
      } else {
        throw new Error(data.message || 'Unable to retrieve submissions.')
      }

      // 2. Fetch all phases timer info
      const { data: phasesData } = await supabase
        .from('phases')
        .select('*')
        .order('phase_number', { ascending: true })
      setPhasesList(phasesData || [])

      // Sync Phase 1 states
      const phase1Config = phasesData?.find(p => p.phase_number === 1)
      setPhase1Active(phase1Config?.timer_status === 'running')
      setPhase1Deadline(phase1Config?.scheduled_end_at || null)

      // 3. Fetch active templates dynamically from Google Drive templetes folder
      try {
        const templatesRes = await fetch(`${API_BASE_URL}/api/patents/templates`)
        if (templatesRes.ok) {
          const templatesData = await templatesRes.json()
          if (templatesData.success && templatesData.templates) {
            setActiveTemplates(templatesData.templates)
          }
        }
      } catch (tmplErr) {
        console.warn('[MySubmissions] Failed to fetch patent templates:', tmplErr)
      }

    } catch (err) {
      console.error('[MySubmissions] Error fetching submissions:', err)
      setError(err.message || 'Unable to load details.')
    } finally {
      setLoading(false)
    }
  }

  // Flatten submissions: ONE PAGE = ONE IDEA
  const pages = []
  submissions.forEach((sub) => {
    if (!sub.ideas || sub.ideas.length === 0) {
      pages.push({
        team: sub,
        idea: null
      })
    } else {
      sub.ideas.forEach((idea) => {
        pages.push({
          team: sub,
          idea
        })
      })
    }
  })

  const totalPages = pages.length
  const currentPage = totalPages > 0 ? pages[currentPageIndex] : null
  const activeRegId = currentPage ? currentPage.team.registrationId : null

  useEffect(() => {
    if (activeRegId) {
      fetchPhase1SubmissionsForReg(activeRegId)
    }
  }, [activeRegId, selectedPhase])

  const fetchPhase1SubmissionsForReg = async (regId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const subsRes = await fetch(`${API_BASE_URL}/api/phase1/submissions?registrationId=${regId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (subsRes.ok) {
        const subsData = await subsRes.json()
        if (subsData.success) {
          setPhase1Submissions(subsData.submissions || [])
        }
      }
    } catch (e) {
      console.error('Error fetching submissions for reg:', e)
    }
  }

  const handleDownloadTemplate = async (templateId, filename) => {
    try {
      setDownloadingTemplateDocType(templateId)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const response = await fetch(`${API_BASE_URL}/api/patents/templates/${templateId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })

      if (!response.ok) {
        throw new Error('Unable to download template.')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || 'template.docx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert(err.message || 'Failed to download template.')
    } finally {
      setDownloadingTemplateDocType(null)
    }
  }

  const handleDownload = async (fileId, originalName) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const response = await fetch(`${API_BASE_URL}/api/patents/file/${fileId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to download document')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = originalName
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert(err.message)
    }
  }

  const handleUpload = async (e, template) => {
    const file = e.target.files[0]
    if (!file) return

    setUploadingDocId(template.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Authentication required.')

      const dept = currentPage?.team?.leaderDepartment || currentPage?.team?.mentorDepartment || 'Mechanical Engineering'

      const formData = new FormData()
      formData.append('file', file)
      formData.append('phase', 'phase 1')
      formData.append('department', dept)
      formData.append('category', selectedCategory)
      formData.append('patentType', selectedPatentType)
      formData.append('teamId', activeRegId)
      formData.append('templateId', template.id)

      const response = await fetch(`${API_BASE_URL}/api/patents/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        if (result.code === 'FILE_EXISTS') {
          alert('This document has already been uploaded for this team in Google Drive.')
          return
        }
        throw new Error(result.message || 'File upload failed.')
      }

      alert('Document uploaded successfully to Google Drive!')
      if (activeRegId) {
        await fetchPhase1SubmissionsForReg(activeRegId)
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setUploadingDocId(null)
      e.target.value = ''
    }
  }

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'N/A'
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return 'N/A'
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const pad = (n) => String(n).padStart(2, '0')

    const day = d.getDate()
    const month = months[d.getMonth()]
    const year = d.getFullYear()
    let hours = d.getHours()
    const minutes = pad(d.getMinutes())
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12
    hours = hours ? hours : 12

    return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    } catch (err) {
      return 'N/A'
    }
  }

  const renderMemberRow = (label, member) => {
    if (!member || !member.name) return null
    const isYou = member.email && member.email.trim().toLowerCase() === userEmail.trim().toLowerCase()
    return (
      <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl flex flex-col gap-2.5 transition hover:border-slate-305 w-full min-w-0">
        <div className="flex justify-between items-center border-b border-slate-100 pb-1.5 gap-2">
          <span className="text-[9px] font-black text-slate-450 uppercase tracking-widest leading-none">{label}</span>
          {isYou && (
            <span className="bg-amber-50 text-accent text-[9px] font-black px-1.5 py-0.5 rounded border border-amber-100 uppercase select-none shrink-0 leading-none">
              You
            </span>
          )}
        </div>
        <div className="space-y-1">
          <span className="text-xs font-black text-slate-900 block break-words select-text">
            {member.name}
          </span>
          {member.department && (
            <span className="text-[10px] text-slate-500 font-bold block leading-tight break-words select-text">
              {normalizeMentorDepartment(member.department)}
            </span>
          )}
          <span className="text-[10px] text-slate-400 font-semibold block break-all select-text pt-1.5 border-t border-slate-100">
            {member.email}
          </span>
          {member.mobile && (
            <span className="text-[9px] text-slate-400 font-semibold block leading-none select-text mt-0.5">
              Phone: {member.mobile}
            </span>
          )}
        </div>
      </div>
    )
  }

  // Calculate overall Phase 1 submission status for the selected registration
  const getPhase1StatusLabel = () => {
    if (phase1Submissions.length === 0) {
      const phase1Config = phasesList.find(p => p.phase_number === 1)
      if (phase1Config?.timer_status === 'closed' || phase1Config?.timer_status === 'completed') {
        return 'Closed'
      }
      return 'Not Submitted'
    }

    const hasRejected = phase1Submissions.some(s => s.review_status === 'REJECTED')
    if (hasRejected) return 'Resubmission Required'

    const approvedCount = phase1Submissions.filter(s => s.review_status === 'APPROVED').length
    if (approvedCount === 4) return 'Approved'

    const hasPending = phase1Submissions.some(s => s.review_status === 'UPLOADED' || s.review_status === 'UNDER_REVIEW')
    if (hasPending) return 'Under Review'

    return 'Submitted'
  }

  const _phase1Config = phasesList.find(p => p.phase_number === 1)
  const phase2Config = phasesList.find(p => p.phase_number === 2)
  const phase3Config = phasesList.find(p => p.phase_number === 3)
  return (
    <div className="min-h-screen bg-slate-50 pt-28 pb-10 px-4 md:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">

        {/* Header bar */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <Award className="text-accent" size={24} /> Submissions Panel
            </h1>
            <p className="text-sm text-slate-500 mt-1 font-medium">
              View your registered ideas and upload patent documents.
            </p>
          </div>
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-sm focus:outline-none"
          >
            ← Back to Home
          </button>
        </div>

        {/* Navigation bar at the top */}
        <div className="flex border-b border-slate-200 mb-6 overflow-x-auto whitespace-nowrap scrollbar-none gap-2">
          {[
            { id: 'my_submissions', label: 'MY SUBMISSIONS' },
            { id: 'phase_1', label: 'PHASE 1' },
            { id: 'phase_2', label: 'PHASE 2' },
            { id: 'phase_3', label: 'PHASE 3' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedPhase(tab.id)}
              className={`px-5 py-3 border-b-2 font-bold text-xs sm:text-sm tracking-wider transition cursor-pointer ${
                selectedPhase === tab.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Team Selector Registry Workspace */}
        {totalPages > 1 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-6">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5">
              Select Active Team / Registry Workspace
            </p>
            <div className="flex flex-wrap gap-2">
              {pages.map((p, idx) => {
                const isActive = currentPageIndex === idx;
                const teamName = p.team.teamName;
                const regId = p.team.registrationId;
                const roleLabel = p.team.userRole === 'Faculty Mentor' ? 'Mentor' : (p.team.userRole === 'Team Leader' ? 'Leader' : 'Member');
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentPageIndex(idx)}
                    className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                      isActive
                        ? 'bg-primary text-white border-primary shadow-md shadow-blue-100 scale-[1.02]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{teamName}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {roleLabel} ({regId})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Workspaces Wrapper */}
        <div>
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-20 flex flex-col items-center justify-center gap-3 text-slate-500">
              <MechanicalLoader size={48} className="text-accent" />
              <p className="text-sm font-black uppercase tracking-wider">Loading details...</p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 flex flex-col items-center text-center gap-3 text-red-500 border-red-100">
              <AlertCircle size={36} />
              <p className="text-base font-semibold">{error}</p>
              <button
                type="button"
                onClick={fetchSubmissions}
                className="mt-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-red-700 transition cursor-pointer"
              >
                Retry Load
              </button>
            </div>
          ) : selectedPhase === 'my_submissions' ? (
            /* ==================== MY SUBMISSIONS PAGE ==================== */
            <div className="space-y-6">

              {totalPages === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 flex flex-col items-center text-center gap-4 text-slate-400">
                  <Users size={48} className="text-slate-300" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">No team submissions found.</p>
                    <p className="text-xs text-slate-500 mt-1">You are not listed in any team registrations.</p>
                  </div>
                </div>
              ) : (
                currentPage && (
                  <div className="space-y-6">

                    {/* Pagination Indicator */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between shadow-sm">
                      <button
                        type="button"
                        onClick={() => setCurrentPageIndex(prev => Math.max(0, prev - 1))}
                        disabled={currentPageIndex === 0}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition disabled:opacity-40 cursor-pointer"
                      >
                        <ArrowLeft size={12} /> Previous
                      </button>
                      <span className="text-xs font-black text-slate-500 uppercase tracking-widest text-center">
                        Registration {currentPageIndex + 1} of {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPageIndex(prev => Math.min(totalPages - 1, prev + 1))}
                        disabled={currentPageIndex === totalPages - 1}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition disabled:opacity-40 cursor-pointer"
                      >
                        Next <ArrowRight size={12} />
                      </button>
                    </div>

                    <div className="grid gap-6 grid-cols-1 lg:grid-cols-3 items-start">

                      {/* Left: Registration Details / Edit Form */}
                      <div className="lg:col-span-2 space-y-6 flex flex-col min-w-0">
                        {/* Team Metadata */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 flex flex-col justify-between min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-3.5 min-w-0">
                            <div className="min-w-0">
                              <h3 className="font-black text-slate-900 text-lg leading-tight select-text break-words">
                                {currentPage.team.teamName}
                              </h3>
                              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mt-1">
                                Registration ID: <span className="text-slate-805 font-black select-all">{currentPage.team.registrationId}</span>
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <span className={`text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full border leading-none ${
                                currentPage.team.userRole === 'Team Leader'
                                  ? 'bg-blue-50 text-primary border-blue-200'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}>
                                Role: {currentPage.team.userRole}
                              </span>
                              {currentPage.team.userRole === 'Team Leader' && !isEditing && (
                                <button
                                  type="button"
                                  onClick={startEditing}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-200 text-xs font-bold text-accent bg-white hover:bg-slate-50 transition cursor-pointer select-none"
                                >
                                  <Edit3 size={12} /> Edit Details
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1 min-w-0">
                            <div className="space-y-1 min-w-0">
                              <span className="text-slate-400 uppercase text-[9px] tracking-wider block font-bold">Registration Date</span>
                              <span className="text-slate-800 text-xs font-bold block">{formatDate(currentPage.team.createdAt)}</span>
                            </div>
                            {currentPage.team.mentor && currentPage.team.mentor.name && (
                              <div className="space-y-1 min-w-0">
                                <span className="text-slate-400 uppercase text-[9px] tracking-wider block font-bold">Faculty Mentor</span>
                                <span className="text-slate-800 text-xs font-bold block select-text break-words">{currentPage.team.mentor.name}</span>
                                <span className="text-[10px] text-slate-500 block font-semibold leading-tight break-words">{normalizeMentorDepartment(currentPage.team.mentor.department)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* SUCCESS / ERROR TOASTS */}
                        {saveSuccessMsg && (
                          <div className="bg-emerald-50 border border-emerald-250 text-emerald-800 text-xs font-bold rounded-xl p-3.5 shadow-sm flex items-center gap-2 animate-fade-in">
                            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></div>
                            {saveSuccessMsg}
                          </div>
                        )}

                        {saveErrorMsg && (
                          <div className="bg-rose-50 border border-rose-250 text-rose-800 text-xs font-bold rounded-xl p-3.5 shadow-sm flex items-center gap-2 animate-fade-in">
                            <div className="h-2 w-2 rounded-full bg-rose-500"></div>
                            {saveErrorMsg}
                          </div>
                        )}

                        {isEditing ? (
                          /* EDIT FORM */
                          <form onSubmit={handleSaveChanges} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5 min-w-0">
                            <h4 className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                              <Edit3 size={14} /> Edit Team Project Details
                            </h4>

                            <div className="space-y-4 min-w-0">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Project Title</label>
                                <input
                                  type="text"
                                  required
                                  value={editProjectTitle}
                                  onChange={(e) => setEditProjectTitle(e.target.value)}
                                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold outline-none focus:border-primary text-slate-800"
                                  placeholder="Enter Project Title"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Innovation Domain</label>
                                <select
                                  required
                                  value={editInnovationDomain}
                                  onChange={(e) => setEditInnovationDomain(e.target.value)}
                                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-primary text-slate-800"
                                >
                                  <option value="">Select Domain...</option>
                                  {OFFICIAL_DOMAINS.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Problem Area</label>
                                <textarea
                                  required
                                  rows={4}
                                  value={editProblemArea}
                                  onChange={(e) => setEditProblemArea(e.target.value)}
                                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold outline-none focus:border-primary text-slate-800"
                                  placeholder="Describe the problem area"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Proposed Solution</label>
                                <textarea
                                  required
                                  rows={4}
                                  value={editProposedSolution}
                                  onChange={(e) => setEditProposedSolution(e.target.value)}
                                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold outline-none focus:border-primary text-slate-800"
                                  placeholder="Describe your proposed solution"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Expected Impact</label>
                                <textarea
                                  required
                                  rows={4}
                                  value={editExpectedImpact}
                                  onChange={(e) => setEditExpectedImpact(e.target.value)}
                                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold outline-none focus:border-primary text-slate-800"
                                  placeholder="Describe expected impact"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">SDG Goals (Select all that apply)</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-200/60 rounded-xl max-h-48 overflow-y-auto">
                                  {[
                                    "1 - No Poverty",
                                    "2 - Zero Hunger",
                                    "3 - Good Health and Well-Being",
                                    "4 - Quality Education",
                                    "5 - Gender Equality",
                                    "6 - Clean Water and Sanitation",
                                    "7 - Affordable and Clean Energy",
                                    "8 - Decent Work and Economic Growth",
                                    "9 - Industry, Innovation and Infrastructure",
                                    "10 - Reduced Inequalities",
                                    "11 - Sustainable Cities and Communities",
                                    "12 - Responsible Consumption and Production",
                                    "13 - Climate Action",
                                    "14 - Life Below Water",
                                    "15 - Life on Land",
                                    "16 - Peace, Justice and Strong Institutions",
                                    "17 - Partnerships for the Goals"
                                  ].map((goal) => {
                                    const isChecked = editSdgGoals.includes(goal);
                                    return (
                                      <label key={goal} className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer select-none">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setEditSdgGoals(prev => [...prev, goal]);
                                            } else {
                                              setEditSdgGoals(prev => prev.filter(g => g !== goal));
                                            }
                                          }}
                                          className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                                        />
                                        <span>{goal}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={cancelEditing}
                                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 cursor-pointer transition disabled:opacity-40"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={isSaving}
                                className="px-5 py-2 rounded-xl bg-accent hover:bg-amber-600 text-xs font-bold text-white shadow transition cursor-pointer flex items-center gap-2 disabled:opacity-40"
                              >
                                {isSaving ? (
                                  <>
                                    <MechanicalLoader size={12} className="text-current animate-spin" /> Saving...
                                  </>
                                ) : (
                                  'Save Changes'
                                )}
                              </button>
                            </div>
                          </form>
                        ) : (
                          /* PROJECT DETAILS VIEW CARD */
                          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5 min-w-0">
                            <h4 className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                              <Lightbulb size={14} /> Project Details
                            </h4>
                            {(!currentPage.idea && !currentPage.team.projectTitle) ? (
                              <p className="text-sm text-slate-500 font-medium italic">No idea submitted yet.</p>
                            ) : (
                              <div className="space-y-4 min-w-0">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                                  <div className="space-y-1.5 min-w-0">
                                    <span className="text-slate-400 uppercase text-[9px] tracking-wider block font-bold">Project Title</span>
                                    <span className="text-slate-850 font-extrabold block text-xs select-text leading-snug break-words">
                                      {currentPage.idea ? currentPage.idea.product_title : currentPage.team.projectTitle || 'N/A'}
                                    </span>
                                  </div>
                                  <div className="space-y-1.5 min-w-0">
                                    <span className="text-slate-400 uppercase text-[9px] tracking-wider block font-bold">Innovation Domain</span>
                                    <span className="text-slate-850 font-semibold block text-xs leading-snug break-words">
                                      {currentPage.idea ? currentPage.idea.innovation_domain : currentPage.team.innovationDomain || 'N/A'}
                                    </span>
                                  </div>
                                </div>
                                <div className="space-y-1.5 min-w-0">
                                  <span className="text-slate-400 uppercase text-[9px] tracking-wider block font-bold">Problem Area</span>
                                  <div className="text-xs text-slate-705 font-medium leading-relaxed bg-slate-50 border border-slate-100 p-3.5 rounded-xl select-text mt-1 break-words max-h-32 overflow-y-auto w-full">
                                    {currentPage.idea ? currentPage.idea.problem_area : currentPage.team.problemArea || 'N/A'}
                                  </div>
                                </div>
                                <div className="space-y-1.5 min-w-0">
                                  <span className="text-slate-400 uppercase text-[9px] tracking-wider block font-bold">Proposed Solution</span>
                                  <div className="text-xs text-slate-705 font-medium leading-relaxed bg-slate-50 border border-slate-100 p-3.5 rounded-xl select-text mt-1 break-words max-h-32 overflow-y-auto w-full">
                                    {currentPage.idea ? currentPage.idea.proposed_solution : currentPage.team.proposedSolution || 'N/A'}
                                  </div>
                                </div>
                                <div className="space-y-1.5 min-w-0">
                                  <span className="text-slate-400 uppercase text-[9px] tracking-wider block font-bold">Expected Impact</span>
                                  <div className="text-xs text-slate-705 font-medium leading-relaxed bg-slate-50 border border-slate-100 p-3.5 rounded-xl select-text mt-1 break-words max-h-32 overflow-y-auto w-full">
                                    {currentPage.idea ? currentPage.idea.expected_impact : currentPage.team.expectedImpact || 'N/A'}
                                  </div>
                                </div>
                                {currentPage.team.sdgGoals && currentPage.team.sdgGoals.length > 0 && (
                                  <div className="space-y-1.5 min-w-0">
                                    <span className="text-slate-400 uppercase text-[9px] tracking-wider block font-bold">SDG Goals</span>
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                      {currentPage.team.sdgGoals.map((goal) => (
                                        <span key={goal} className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-600 font-bold leading-none">
                                          {goal}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right: Compact Status Summary & Members */}
                      <div className="space-y-6 flex flex-col">
                        {/* Compact Submission Summary */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
                            Submission Summary
                          </h4>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center py-1 font-semibold text-slate-700">
                              <span className="text-xs">Phase 1</span>
                              <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded border leading-none ${
                                getPhase1StatusLabel() === 'Approved'
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : getPhase1StatusLabel() === 'Resubmission Required'
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : getPhase1StatusLabel() === 'Under Review' || getPhase1StatusLabel() === 'Submitted'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}>
                                {getPhase1StatusLabel()}
                              </span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-t border-slate-50 font-semibold text-slate-700">
                              <span className="text-xs">Phase 2</span>
                              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded border bg-slate-50 text-slate-400 border-slate-200 leading-none">
                                Not Submitted
                              </span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-t border-slate-50 font-semibold text-slate-700">
                              <span className="text-xs">Phase 3</span>
                              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded border bg-slate-50 text-slate-400 border-slate-200 leading-none">
                                Not Started
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Team Members List */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                            <Users size={14} /> Team Members
                          </h4>
                          <div className="space-y-3">
                            {renderMemberRow('Leader', currentPage.team.members.leader)}
                            {renderMemberRow('Member 2', currentPage.team.members.member2)}
                            {renderMemberRow('Member 3', currentPage.team.members.member3)}
                            {currentPage.team.members.member4 && renderMemberRow('Member 4', currentPage.team.members.member4)}
                          </div>
                        </div>
                      </div>

                    </div>

                  </div>
                )
              )}

            </div>
          ) : selectedPhase === 'phase_1' ? (
            /* ==================== PHASE 1 PAGE ==================== */
            <div className="space-y-6">

              {/* Pager Indicator (Only show if user belongs to multiple teams) */}
              {totalPages > 1 && currentPage && (
                <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between shadow-sm">
                  <button
                    type="button"
                    onClick={() => setCurrentPageIndex(prev => Math.max(0, prev - 1))}
                    disabled={currentPageIndex === 0}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer animate-none"
                  >
                    <ArrowLeft size={10} /> Prev Team
                  </button>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider text-center">
                    Viewing Team: {currentPage.team.teamName} (ID: {currentPage.team.registrationId})
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPageIndex(prev => Math.min(totalPages - 1, prev + 1))}
                    disabled={currentPageIndex === totalPages - 1}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer animate-none"
                  >
                    Next Team <ArrowRight size={10} />
                  </button>
                </div>
              )}

              {/* Title & Instructions */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">
                      Phase 1 – Document Submission & Patent Mapping
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      Official patent document templates and submission gateway. Download the official templates below, fill them out with your innovation details, and upload the completed documents for review.
                    </p>
                  </div>
                  <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border tracking-wide shrink-0 ${
                    phase1Active
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {phase1Active ? 'Submissions Open' : 'Submissions Closed'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-650 font-semibold pt-1">
                  <Calendar size={14} className="text-slate-400" />
                  <span>Deadline: <strong className="text-slate-800">{formatDateTime(phase1Deadline)}</strong></span>
                </div>
              </div>

              {/* Patent Classification & Destination Controls */}
              {currentPage && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center justify-between">
                    <span>Patent Classification & Destination</span>
                    <span className="text-[10px] font-medium text-slate-400 normal-case">
                      Team ID: <strong className="text-slate-700 font-bold">{activeRegId}</strong>
                    </span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Category
                      </label>
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-primary cursor-pointer"
                      >
                        <option value="Hardware">Hardware</option>
                        <option value="Software">Software</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Patent Type
                      </label>
                      <select
                        value={selectedPatentType}
                        onChange={(e) => setSelectedPatentType(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-primary cursor-pointer"
                      >
                        <option value="Design Patent">Design Patent</option>
                        <option value="Utility Patent">Utility Patent</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2 md:col-span-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Department Destination
                      </label>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 truncate">
                        {currentPage.team.leaderDepartment || 'Mechanical Engineering'}
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                    <span>Target Folder Path:</span>
                    <span className="font-mono text-[10px] font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                      phase 1 / {currentPage.team.leaderDepartment || 'Mechanical Engineering'} / {selectedCategory} / {selectedPatentType} / {activeRegId}
                    </span>
                  </div>
                </div>
              )}

              {/* Official Templates Grid */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={14} /> Official Phase 1 Templates
                  </h4>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Dynamic source: Google Drive / templetes
                  </span>
                </div>

                {activeTemplates.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    <MechanicalLoader size={16} className="inline mr-2 animate-spin text-slate-400" />
                    Loading official templates from Google Drive...
                  </div>
                ) : (
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                    {activeTemplates.map((tmpl) => {
                      const isDownloading = downloadingTemplateDocType === tmpl.id

                      return (
                        <div key={tmpl.id} className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl flex flex-col justify-between gap-3 font-medium shadow-sm">
                          <div>
                            <span className="font-bold text-slate-900 text-xs md:text-sm block">{tmpl.name}</span>
                            <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                              {tmpl.size ? `${(tmpl.size / 1024).toFixed(1)} KB • Word Document` : 'Official Document Template'}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={isDownloading}
                            onClick={() => handleDownloadTemplate(tmpl.id, tmpl.name)}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition cursor-pointer disabled:opacity-50 w-full focus:outline-none"
                          >
                            {isDownloading ? (
                              <>
                                <MechanicalLoader size={12} className="text-current" /> Downloading...
                              </>
                            ) : (
                              <>
                                <Download size={12} /> Download Template
                              </>
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Document Submissions list */}
              {currentPage ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h4 className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-1.5">
                      <FileText size={14} /> Phase 1 Document Submission
                    </h4>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-sm border ${
                      phase1Active
                        ? 'bg-green-50 text-green-755 border-green-200'
                        : 'bg-red-50 text-red-755 border-red-200'
                    }`}>
                      {phase1Active ? 'Submissions Open' : 'Submissions Closed'}
                    </span>
                  </div>

                  {activeTemplates.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      Loading submission options...
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {activeTemplates.map((tmpl) => {
                        const expectedFileName = `${activeRegId}_${tmpl.name}`
                        const isUploading = uploadingDocId === tmpl.id

                        return (
                          <div key={tmpl.id} className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="min-w-0">
                              <span className="font-bold text-slate-900 text-xs sm:text-sm block leading-tight">{tmpl.name}</span>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                                <span>Required filename:</span>
                                <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono font-bold text-slate-700 select-all">
                                  {expectedFileName}
                                </code>
                              </div>
                            </div>

                            <div className="shrink-0 w-full sm:w-auto">
                              {phase1Active ? (
                                <label className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-xs font-bold text-white shadow hover:bg-amber-600 transition cursor-pointer select-none">
                                  {isUploading ? (
                                    <>
                                      <MechanicalLoader size={12} className="text-current" /> Uploading...
                                    </>
                                  ) : (
                                    <>
                                      <Upload size={12} /> Upload Document
                                    </>
                                  )}
                                  <input
                                    type="file"
                                    disabled={isUploading}
                                    onChange={(e) => handleUpload(e, tmpl)}
                                    className="hidden"
                                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                                  />
                                </label>
                              ) : (
                                <span className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                                  <AlertTriangle size={10} /> Submissions Closed
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center text-slate-400">
                  Select a valid registration to submit documents.
                </div>
              )}

            </div>
          ) : selectedPhase === 'phase_2' ? (
            /* ==================== PHASE 2 PAGE ==================== */
            <div className="space-y-6">

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">
                      Phase 2 – Product Prototyping & Validation
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      Prototyping development guidelines and testing phase workspace. Detail documents for this phase are currently in design.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-650 font-semibold pt-1">
                  <Calendar size={14} className="text-slate-400" />
                  <span>Deadline: <strong className="text-slate-800">{formatDateTime(phase2Config?.scheduled_end_at)}</strong></span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 flex flex-col items-center justify-center text-center gap-4">
                <FileText size={48} className="text-slate-300" />
                <div>
                  <h3 className="text-base font-black text-slate-900">Phase 2 Details</h3>
                  <p className="text-xs text-slate-500 mt-1 font-semibold">
                    Phase 2 details will be available soon. Please check back later.
                  </p>
                </div>
              </div>

            </div>
          ) : (
            /* ==================== PHASE 3 PAGE ==================== */
            <div className="space-y-6">

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">
                      Phase 3 – Business Planning & Pitching
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      Final Pitch deck formatting templates and presentation gateway.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-650 font-semibold pt-1">
                  <Calendar size={14} className="text-slate-400" />
                  <span>Deadline: <strong className="text-slate-800">{formatDateTime(phase3Config?.scheduled_end_at)}</strong></span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 flex flex-col items-center justify-center text-center gap-4">
                <FileText size={48} className="text-slate-300" />
                <div>
                  <h3 className="text-base font-black text-slate-900">Phase 3 Details</h3>
                  <p className="text-xs text-slate-500 mt-1 font-semibold">
                    Phase 3 details will be available soon. Please check back later.
                  </p>
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  )
}
