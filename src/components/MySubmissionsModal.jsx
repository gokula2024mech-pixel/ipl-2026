import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Award, Lightbulb, Users, ArrowLeft, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../supabaseClient'

const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')
const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl.slice(0, -4) : rawApiUrl

export default function MySubmissionsModal({ isOpen, onClose }) {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    if (isOpen) {
      fetchSubmissions()
    }
  }, [isOpen])

  // Lock body scrolling when modal is active
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isOpen])

  const fetchSubmissions = async () => {
    setLoading(true)
    setError('')
    setCurrentPageIndex(0)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('Authentication required. Please log in.')
      }

      setUserEmail(session?.user?.email || '')

      const response = await fetch(`${API_BASE_URL}/api/my-submissions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Unable to retrieve submissions from the server.')
      }

      const data = await response.json()
      if (data.success) {
        setSubmissions(data.submissions || [])
      } else {
        throw new Error(data.message || 'Unable to retrieve submissions.')
      }
    } catch (err) {
      console.error('[MySubmissions] Error fetching submissions:', err)
      setError(err.message || 'Unable to load your submissions. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  // Flatten submissions so that: ONE PAGE = ONE IDEA
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

  const renderMemberRow = (label, member) => {
    if (!member || !member.name) return null
    const isYou = member.email && member.email.trim().toLowerCase() === userEmail.trim().toLowerCase()
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-3.5 bg-white border border-slate-100 rounded-xl shadow-xs transition-colors hover:border-slate-200">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{label}</span>
            <span className="text-sm font-extrabold text-slate-900 break-words leading-none select-text">
              {member.name}
            </span>
            {isYou && (
              <span className="bg-amber-50 text-accent text-[9px] font-black px-1.5 py-0.5 rounded-sm border border-amber-100 uppercase select-none">
                You
              </span>
            )}
          </div>
          {member.department && (
            <span className="block text-xs text-slate-500 font-semibold select-text mt-1 break-words">
              {member.department}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400 font-mono break-all select-all sm:text-right" title={member.email}>
          {member.email}
        </span>
      </div>
    )
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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden transition-all duration-300">
        
        {/* ==================== HEADER ==================== */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-950 flex items-center gap-2">
            <Award className="text-accent" size={18} /> My Submissions
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 hover:bg-slate-50 transition-colors focus:outline-none cursor-pointer"
            aria-label="Close submissions modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* ==================== BODY ==================== */}
        <div className="flex-1 overflow-y-auto px-6 py-5 select-none text-slate-800 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
              <Loader2 className="animate-spin text-accent" size={32} />
              <p className="text-xs font-bold uppercase tracking-wider">Loading your submissions...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center text-center py-16 gap-3 text-red-500 bg-red-50/50 rounded-xl p-6 border border-red-100">
              <AlertCircle size={32} />
              <p className="text-sm font-semibold">{error}</p>
              <button
                type="button"
                onClick={fetchSubmissions}
                className="mt-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition cursor-pointer"
              >
                Retry Fetch
              </button>
            </div>
          ) : totalPages === 0 ? (
            <div className="flex flex-col items-center text-center py-20 gap-4 text-slate-400">
              <Users size={48} className="text-slate-300" />
              <div>
                <p className="text-sm font-semibold text-slate-800">No team submissions found.</p>
                <p className="text-xs text-slate-500 mt-1">You are not listed in any team registrations.</p>
              </div>
            </div>
          ) : (
            currentPage && (
              <div className="space-y-6">
                
                {/* Team metadata card */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                    <div className="min-w-0">
                      <h3 className="font-black text-slate-950 text-base break-words leading-tight select-text">
                        {currentPage.team.teamName}
                      </h3>
                      <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mt-0.5">
                        Registration ID: <span className="text-slate-800 font-bold select-all">{currentPage.team.registrationId}</span>
                      </p>
                    </div>
                    <span className={`text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full shrink-0 border w-fit ${
                      currentPage.team.userRole === 'Team Leader'
                        ? 'bg-blue-50 text-primary border-blue-100'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      Role: {currentPage.team.userRole}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 text-xs font-semibold text-slate-500">
                    <div>
                      <span className="text-slate-400 uppercase text-[9px] tracking-wider block">Registration Date</span>
                      <span className="text-slate-800 text-xs font-bold">{formatDate(currentPage.team.createdAt)}</span>
                    </div>
                    {currentPage.team.mentor && currentPage.team.mentor.name && (
                      <div className="sm:border-l sm:border-slate-200/80 sm:pl-6">
                        <span className="text-slate-400 uppercase text-[9px] tracking-wider block">Faculty Mentor</span>
                        <span className="text-slate-800 text-xs font-bold block select-text">
                          {currentPage.team.mentor.name}
                        </span>
                        <span className="text-[10px] text-slate-500 block select-text font-medium mt-0.5 leading-tight">
                          {currentPage.team.mentor.department}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Project details card */}
                <div className="border border-slate-100 rounded-2xl p-5 space-y-5">
                  <h4 className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-50 pb-2">
                    <Lightbulb size={14} /> Project Details
                  </h4>
                  
                  {!currentPage.idea ? (
                    <p className="text-sm text-slate-500 font-medium italic">No ideas submitted yet.</p>
                  ) : (
                    <div className="space-y-5 text-xs md:text-sm">
                      <div className="space-y-1">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project / Idea Title</span>
                        <span className="font-extrabold text-slate-950 leading-snug block select-text text-sm md:text-base break-words">
                          {currentPage.idea.product_title || 'N/A'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1 bg-slate-50/50 p-3 border border-slate-100 rounded-xl">
                          <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Innovation Domain</span>
                          <span className="font-bold text-slate-800 block break-words select-text">
                            {currentPage.idea.innovation_domain || 'N/A'}
                          </span>
                        </div>
                        <div className="space-y-1 bg-slate-50/50 p-3 border border-slate-100 rounded-xl">
                          <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">TRL Level</span>
                          <span className="font-bold text-slate-800 block">
                            {currentPage.idea.trl_level ? `Level ${currentPage.idea.trl_level}` : 'N/A'}
                          </span>
                        </div>
                        <div className="space-y-1 bg-slate-50/50 p-3 border border-slate-100 rounded-xl">
                          <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">SDG Goals</span>
                          <span className="font-bold text-slate-800 block break-words select-text">
                            {currentPage.idea.sdg_goals && Array.isArray(currentPage.idea.sdg_goals)
                              ? currentPage.idea.sdg_goals.join(', ')
                              : currentPage.idea.sdg_goals || 'N/A'}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-3 border-t border-slate-50">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Problem Statement</span>
                        <div className="whitespace-normal break-words text-slate-700 text-xs md:text-sm leading-relaxed bg-slate-50/30 p-3.5 border border-slate-100 rounded-xl select-text">
                          {currentPage.idea.problem_area || 'N/A'}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Proposed Solution</span>
                        <div className="whitespace-normal break-words text-slate-700 text-xs md:text-sm leading-relaxed bg-slate-50/30 p-3.5 border border-slate-100 rounded-xl select-text">
                          {currentPage.idea.proposed_solution || 'N/A'}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expected Impact</span>
                        <div className="whitespace-normal break-words text-slate-700 text-xs md:text-sm leading-relaxed bg-slate-50/30 p-3.5 border border-slate-100 rounded-xl select-text">
                          {currentPage.idea.expected_impact || 'N/A'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Team members list */}
                <div className="border border-slate-100 rounded-2xl p-5 space-y-4 bg-slate-50/30">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <Users size={14} /> Team Members
                  </h4>
                  
                  <div className="space-y-3 font-semibold text-slate-800">
                    {renderMemberRow('Leader', currentPage.team.members.leader)}
                    {renderMemberRow('Member 2', currentPage.team.members.member2)}
                    {renderMemberRow('Member 3', currentPage.team.members.member3)}
                  </div>
                </div>

              </div>
            )
          )}
        </div>

        {/* ==================== FOOTER / PAGINATION ==================== */}
        {totalPages > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <button
              type="button"
              onClick={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentPageIndex === 0 || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none transition cursor-pointer"
            >
              <ArrowLeft size={14} /> Previous
            </button>

            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Idea {currentPageIndex + 1} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPageIndex((prev) => Math.min(totalPages - 1, prev + 1))}
              disabled={currentPageIndex === totalPages - 1 || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none transition cursor-pointer"
            >
              Next <ArrowRight size={14} />
            </button>
          </div>
        )}

      </div>
    </div>,
    document.body
  )
}
