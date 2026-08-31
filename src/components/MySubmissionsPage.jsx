import { useState, useEffect } from 'react'
import { Award, Lightbulb, Users, AlertCircle, Download, Upload, FileText, AlertTriangle, ArrowLeft, ArrowRight, Calendar } from 'lucide-react'
import MechanicalLoader from './MechanicalLoader'
import { supabase } from '../supabaseClient'

const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')
const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl.slice(0, -4) : rawApiUrl

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

      // 3. Fetch active templates
      const templatesRes = await fetch(`${API_BASE_URL}/api/phase1/templates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (templatesRes.ok) {
        const templatesData = await templatesRes.json()
        if (templatesData.success) {
          setActiveTemplates(templatesData.templates || [])
        }
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

  const handleDownloadTemplate = async (documentType, filename) => {
    try {
      setDownloadingTemplateDocType(documentType)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Authentication required.')

      const response = await fetch(`${API_BASE_URL}/api/phase1/template/${documentType}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error('Unable to download template.')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || `${documentType}.docx`
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

      const response = await fetch(`${API_BASE_URL}/api/phase1/document/${fileId}`, {
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

  const handleUpload = async (e, documentType) => {
    const file = e.target.files[0]
    if (!file) return

    setUploadingDocId(documentType)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Authentication required.')

      const formData = new FormData()
      formData.append('file', file)
      formData.append('documentType', documentType)
      formData.append('registrationId', activeRegId)

      const response = await fetch(`${API_BASE_URL}/api/phase1/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'File upload failed.')
      }

      alert('Document uploaded successfully!')
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-3.5 bg-slate-50 border border-slate-100 rounded-xl shadow-xs transition-colors hover:border-slate-200 text-xs font-semibold text-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{label}</span>
            <span className="text-sm font-extrabold text-slate-905 break-words leading-none select-text">
              {member.name}
            </span>
            {isYou && (
              <span className="bg-amber-50 text-accent text-[9px] font-black px-1.5 py-0.5 rounded-sm border border-amber-100 uppercase select-none animate-none">
                You
              </span>
            )}
          </div>
          {member.department && (
            <span className="block text-xs text-slate-550 font-semibold select-text mt-1 break-words leading-tight">
              {normalizeMentorDepartment(member.department)}
            </span>
          )}
        </div>
        <div className="text-slate-500 font-medium select-text sm:text-right mt-1.5 sm:mt-0">
          {member.email} <span className="text-slate-350 mx-1">|</span> {member.mobile}
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
        <div className="flex border-b border-slate-200 mb-8 overflow-x-auto whitespace-nowrap scrollbar-none gap-2">
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
                      
                      {/* Left: Registration Details */}
                      <div className="lg:col-span-2 space-y-6 flex flex-col">
                        {/* Team Metadata */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 flex flex-col justify-between">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                            <div>
                              <h3 className="font-black text-slate-900 text-lg leading-tight select-text">
                                {currentPage.team.teamName}
                              </h3>
                              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mt-1">
                                Registration ID: <span className="text-slate-805 font-black select-all">{currentPage.team.registrationId}</span>
                              </p>
                            </div>
                            <span className={`text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full shrink-0 border w-fit leading-none ${
                              currentPage.team.userRole === 'Team Leader'
                                ? 'bg-blue-50 text-primary border-blue-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}>
                              Role: {currentPage.team.userRole}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs pt-1">
                            <div className="space-y-1">
                              <span className="text-slate-400 uppercase text-[9px] tracking-wider block font-bold">Registration Date</span>
                              <span className="text-slate-800 text-xs font-bold block">{formatDate(currentPage.team.createdAt)}</span>
                            </div>
                            {currentPage.team.mentor && currentPage.team.mentor.name && (
                              <div className="space-y-1">
                                <span className="text-slate-400 uppercase text-[9px] tracking-wider block font-bold">Faculty Mentor</span>
                                <span className="text-slate-800 text-xs font-bold block select-text">{currentPage.team.mentor.name}</span>
                                <span className="text-[10px] text-slate-500 block font-semibold leading-tight">{normalizeMentorDepartment(currentPage.team.mentor.department)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Project Details */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
                          <h4 className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                            <Lightbulb size={14} /> Project Details
                          </h4>
                          {(!currentPage.idea && !currentPage.team.projectTitle) ? (
                            <p className="text-sm text-slate-500 font-medium italic">No idea submitted yet.</p>
                          ) : (
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                  <span className="text-slate-400 uppercase text-[9px] tracking-wider block font-bold">Project Title</span>
                                  <span className="text-slate-850 font-extrabold block text-xs select-text leading-snug">
                                    {currentPage.idea ? currentPage.idea.product_title : currentPage.team.projectTitle || 'N/A'}
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  <span className="text-slate-400 uppercase text-[9px] tracking-wider block font-bold">Innovation Domain</span>
                                  <span className="text-slate-850 font-semibold block text-xs leading-snug">
                                    {currentPage.idea ? currentPage.idea.innovation_domain : currentPage.team.innovationDomain || 'N/A'}
                                  </span>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <span className="text-slate-400 uppercase text-[9px] tracking-wider block font-bold">Problem Area</span>
                                <div className="text-xs text-slate-700 font-medium leading-relaxed bg-slate-50 border border-slate-100 p-3.5 rounded-xl select-text mt-1 break-words max-h-32 overflow-y-auto w-full">
                                  {currentPage.idea ? currentPage.idea.problem_area : currentPage.team.problemArea || 'N/A'}
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <span className="text-slate-400 uppercase text-[9px] tracking-wider block font-bold">Proposed Solution</span>
                                <div className="text-xs text-slate-700 font-medium leading-relaxed bg-slate-50 border border-slate-100 p-3.5 rounded-xl select-text mt-1 break-words max-h-32 overflow-y-auto w-full">
                                  {currentPage.idea ? currentPage.idea.proposed_solution : currentPage.team.proposedSolution || 'N/A'}
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <span className="text-slate-400 uppercase text-[9px] tracking-wider block font-bold">Expected Impact</span>
                                <div className="text-xs text-slate-700 font-medium leading-relaxed bg-slate-50 border border-slate-100 p-3.5 rounded-xl select-text mt-1 break-words max-h-32 overflow-y-auto w-full">
                                  {currentPage.idea ? currentPage.idea.expected_impact : currentPage.team.expectedImpact || 'N/A'}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
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

              {/* Official Templates Grid */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <FileText size={14} /> Official Phase 1 Templates
                </h4>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                  {[
                    { id: 'FORM_2', label: 'Form 2 – To Grant', desc: 'Official Form 2 document template.' },
                    { id: 'FORM_5', label: 'Form 5 – Declaration as to Inventorship', desc: 'Official Form 5 inventorship declaration template.' },
                    { id: 'FIGURE_OF_ABSTRACT', label: 'Figure of Abstract', desc: 'Standard abstract figure drawing template.' },
                    { id: 'LIST_OF_DRAWINGS', label: 'List of Drawings', desc: 'Standard list of patent drawings template.' }
                  ].map((doc) => {
                    const template = activeTemplates.find(t => t.document_type === doc.id)
                    const filename = template ? template.filename : `${doc.id === 'FIGURE_OF_ABSTRACT' ? 'Figure of Abstract.png' : doc.id === 'LIST_OF_DRAWINGS' ? 'List of Drawings.pdf' : doc.id.replace(/_/g, ' ') + '.docx'}`
                    const isDownloading = downloadingTemplateDocType === doc.id

                    return (
                      <div key={doc.id} className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl flex flex-col justify-between gap-3 font-medium shadow-sm">
                        <div>
                          <span className="font-bold text-slate-900 text-xs md:text-sm block">{doc.label}</span>
                          <span className="text-[10px] text-slate-400 font-medium block mt-0.5">{doc.desc}</span>
                        </div>
                        <button
                          type="button"
                          disabled={isDownloading}
                          onClick={() => handleDownloadTemplate(doc.id, filename)}
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

                  <div className="space-y-4">
                    {[
                      { id: 'FORM_2', label: 'Form 2 – To Grant' },
                      { id: 'FORM_5', label: 'Form 5 – Declaration as to Inventorship' },
                      { id: 'FIGURE_OF_ABSTRACT', label: 'Figure of Abstract' },
                      { id: 'LIST_OF_DRAWINGS', label: 'List of Drawings' }
                    ].map((doc) => {
                      const sub = phase1Submissions.find(s => s.document_type === doc.id)
                      const isUploading = uploadingDocId === doc.id

                      let status = 'NOT_UPLOADED'
                      let rejectionReason = ''
                      if (sub) {
                        status = sub.review_status
                        rejectionReason = sub.rejection_reason || ''
                      }

                      return (
                        <div key={doc.id} className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 text-xs sm:text-sm block leading-tight">{doc.label}</span>
                            <div className="flex flex-wrap gap-2 items-center mt-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm border ${
                                status === 'APPROVED'
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : status === 'REJECTED'
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : status === 'UNDER_REVIEW' || status === 'UPLOADED'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}>
                                {status === 'NOT_UPLOADED' ? 'Not Submitted' : status.replace(/_/g, ' ')}
                              </span>

                              {sub && (
                                <button
                                  type="button"
                                  onClick={() => handleDownload(sub.google_drive_file_id, sub.original_filename)}
                                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 truncate select-all underline text-left break-all max-w-[200px] sm:max-w-[300px]"
                                >
                                  {sub.original_filename}
                                </button>
                              )}
                            </div>

                            {status === 'REJECTED' && rejectionReason && (
                              <div className="mt-2 text-[10px] sm:text-xs text-red-650 bg-red-50/30 p-2 rounded border border-red-100 break-words select-text">
                                <span className="font-bold">Rejection Reason:</span> {rejectionReason}
                              </div>
                            )}
                          </div>

                          <div className="shrink-0 w-full sm:w-auto">
                            {phase1Active && (status === 'NOT_UPLOADED' || status === 'REJECTED') ? (
                              <label className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-xs font-bold text-white shadow hover:bg-amber-600 transition cursor-pointer select-none">
                                {isUploading ? (
                                  <>
                                    <MechanicalLoader size={12} className="text-current" /> Uploading...
                                  </>
                                ) : (
                                  <>
                                    <Upload size={12} /> {status === 'REJECTED' ? 'Re-upload Document' : 'Upload Document'}
                                  </>
                                )}
                                <input
                                  type="file"
                                  disabled={isUploading}
                                  onChange={(e) => handleUpload(e, doc.id)}
                                  className="hidden"
                                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                                />
                              </label>
                            ) : (
                              !phase1Active && (status === 'NOT_UPLOADED' || status === 'REJECTED') && (
                                <span className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                                  <AlertTriangle size={10} /> Submissions Closed
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
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
