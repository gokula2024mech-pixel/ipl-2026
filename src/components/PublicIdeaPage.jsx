import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import {
  Heart,
  Vote,
  Users,
  Lightbulb,
  Target,
  Sparkles,
  ArrowLeft,
  Copy,
  Check,
  ShieldCheck,
  Award,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  Share2,
  Star,
  Lock
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import MechanicalLoader from './MechanicalLoader'
import {
  getStoredVisitorToken,
  setStoredVisitorToken,
  getStoredSessionToken,
  setPendingVoteIdea
} from '../utils/sessionNavigationState'

const TOAST_DURATION = 5000

export default function PublicIdeaPage({
  productId,
  session,
  user,
  profile,
  onBackToHome,
  onOpenVoteResolver,
  onTriggerVote,
  onRequireLogin
}) {
  const [idea, setIdea] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [liking, setLiking] = useState(false)
  const [hasLiked, setHasLiked] = useState(false)
  const [isVotingActive, setIsVotingActive] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimeoutRef = useRef(null)
  const visitTrackedRef = useRef(false)

  const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')
  const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl.slice(0, -4) : rawApiUrl

  // Authoritative Voting Controls Status
  const fetchVotingStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/voting/status`)
      if (res.ok) {
        const data = await res.json()
        if (data.success && typeof data.is_voting_active === 'boolean') {
          setIsVotingActive(data.is_voting_active)
        }
      }
    } catch (e) {
      console.warn('[PublicIdeaPage] Could not fetch voting status:', e.message)
    }
  }, [API_BASE_URL])

  useEffect(() => {
    fetchVotingStatus()
  }, [fetchVotingStatus])

  const showToast = useCallback((notification) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }
    setToast({ ...notification, id: Date.now() })
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null)
    }, TOAST_DURATION)
  }, [])

  const dismissToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }
    setToast(null)
  }, [])

  // 1. Fetch Idea Details
  const fetchIdeaDetails = useCallback(async (isInitial = false) => {
    if (!productId) {
      setError('No Product ID specified.')
      setLoading(false)
      return
    }

    try {
      if (isInitial) setLoading(true)
      const visitorToken = getStoredVisitorToken()
      const headers = {}
      if (visitorToken) {
        headers['x-visitor-token'] = visitorToken
      }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const res = await fetch(`${API_BASE_URL}/api/ideas/${encodeURIComponent(productId)}`, {
        headers
      })
      const data = await res.json()

      if (!res.ok || !data.success || !data.idea) {
        setError(data.message || 'Innovation idea not found or is currently inactive.')
      } else {
        setIdea(data.idea)
        if (data.idea.viewer_state?.has_liked) {
          setHasLiked(true)
        }
        setError(null)
      }
    } catch (err) {
      console.error('[PublicIdeaPage] Error fetching idea:', err)
      setError('Unable to load innovation idea. Please check your network connection.')
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [productId, session?.access_token, API_BASE_URL])

  useEffect(() => {
    fetchIdeaDetails(true)
  }, [fetchIdeaDetails])

  // 2. Telemetry: Decoupled Visit Impression (Once per page entry, immune to React Strict Mode)
  useEffect(() => {
    if (!productId || visitTrackedRef.current) return
    visitTrackedRef.current = true

    const recordVisit = async () => {
      try {
        const visitorToken = getStoredVisitorToken()
        const sessionToken = getStoredSessionToken()
        const headers = { 'Content-Type': 'application/json' }
        if (visitorToken) {
          headers['x-visitor-token'] = visitorToken
        }
        if (sessionToken) {
          headers['x-session-token'] = sessionToken
        }
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }

        const res = await fetch(`${API_BASE_URL}/api/ideas/${encodeURIComponent(productId)}/visit`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            visitor_token: visitorToken || undefined,
            session_token: sessionToken || undefined
          })
        })
        const data = await res.json()
        if (data.success && data.visitor_token && !visitorToken) {
          setStoredVisitorToken(data.visitor_token)
        }
      } catch (err) {
        // Silent catch: visit telemetry ping skipped
        console.warn('[PublicIdeaPage] Visit telemetry ping skipped:', err.message)
      }
    }

    recordVisit()
  }, [productId, session?.access_token, API_BASE_URL])

  // 3. Supabase Realtime Score & Controls Updates (Product-scoped + Controls)
  useEffect(() => {
    if (!productId) return

    const likesChannel = supabase
      .channel(`rt-likes-${productId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'idea_likes', filter: `product_id=eq.${productId}` },
        () => {
          fetchIdeaDetails(false)
        }
      )
      .subscribe()

    const countsChannel = supabase
      .channel(`rt-counts-${productId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_vote_counts', filter: `product_id=eq.${productId}` },
        () => {
          fetchIdeaDetails(false)
        }
      )
      .subscribe()

    const votesChannel = supabase
      .channel(`rt-votes-${productId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_votes', filter: `product_id=eq.${productId}` },
        () => {
          fetchIdeaDetails(false)
        }
      )
      .subscribe()

    const controlsChannel = supabase
      .channel(`rt-controls-${productId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voting_controls' },
        (payload) => {
          if (payload.new && typeof payload.new.is_voting_active === 'boolean') {
            setIsVotingActive(payload.new.is_voting_active)
          } else {
            fetchVotingStatus()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(likesChannel)
      supabase.removeChannel(countsChannel)
      supabase.removeChannel(votesChannel)
      supabase.removeChannel(controlsChannel)
    }
  }, [productId, fetchIdeaDetails, fetchVotingStatus])

  // 4. Like Submission (Public Action: +1 mark)
  const handleLike = async () => {
    if (liking || hasLiked) return
    setLiking(true)

    try {
      const visitorToken = getStoredVisitorToken()
      const headers = { 'Content-Type': 'application/json' }
      if (visitorToken) {
        headers['x-visitor-token'] = visitorToken
      }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const res = await fetch(`${API_BASE_URL}/api/ideas/${encodeURIComponent(productId)}/like`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ visitor_token: visitorToken || undefined })
      })
      const data = await res.json()

      if (!res.ok) {
        if (res.status === 429) {
          showToast({
            type: 'warning',
            title: 'TOO MANY REQUESTS',
            message: 'Please wait a moment before liking again.'
          })
        } else {
          showToast({
            type: 'error',
            title: 'LIKE FAILED',
            message: data.message || 'Unable to record your like at this time.'
          })
        }
        return
      }

      if (data.visitor_token) {
        setStoredVisitorToken(data.visitor_token)
      }

      if (data.already_liked) {
        setHasLiked(true)
        showToast({
          type: 'warning',
          title: 'ALREADY LIKED',
          message: 'You have already liked this innovation idea!'
        })
      } else {
        setHasLiked(true)
        setIdea((prev) => {
          if (!prev) return prev
          const newLikes = (prev.stats?.likes_count || 0) + 1
          const votes = prev.stats?.votes_count || 0
          return {
            ...prev,
            stats: {
              ...prev.stats,
              likes_count: newLikes,
              total_score: newLikes + votes * 2
            },
            viewer_state: {
              ...prev.viewer_state,
              has_liked: true
            }
          }
        })
        showToast({
          type: 'success',
          title: 'IDEA LIKED (+1)',
          message: 'Thank you for supporting this innovation project!'
        })
      }
    } catch (err) {
      console.error('[PublicIdeaPage] Like error:', err)
      showToast({
        type: 'error',
        title: 'NETWORK ERROR',
        message: 'Could not connect to the voting server. Please try again.'
      })
    } finally {
      setLiking(false)
    }
  }

  // 5. Vote Trigger (Protected Action: +2 marks, SECE Account Required)
  const handleVoteClick = () => {
    if (!idea) return

    if (!isVotingActive) {
      showToast({
        type: 'warning',
        title: 'VOTING CLOSED',
        message: 'Live voting is currently closed by the event administrator.'
      })
      return
    }

    if (idea.viewer_state?.has_voted) {
      showToast({
        type: 'info',
        title: 'ALREADY VOTED',
        message: 'You have already voted for this idea.'
      })
      return
    }

    if (!session || !user) {
      // Save pending vote context before redirecting to Google sign-in
      setPendingVoteIdea({
        productId: idea.product_id,
        teamId: idea.team_id,
        productTitle: idea.product_title,
        teamName: idea.team_name
      })

      if (onRequireLogin) {
        onRequireLogin({
          reason: 'Sign in with your @sece.ac.in account to cast an official vote.'
        })
      }
      return
    }

    // Authenticated: Trigger VotingModal pre-loaded with this team and product
    if (onTriggerVote) {
      onTriggerVote({
        teamId: idea.team_id,
        productId: idea.product_id
      })
    }
  }

  const handleCopyTeamId = () => {
    if (!idea?.team_id) return
    navigator.clipboard.writeText(idea.team_id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    showToast({
      type: 'success',
      title: 'COPIED TO CLIPBOARD',
      message: 'Team ID copied successfully.'
    })
  }

  const handleShare = () => {
    const canonicalUrl = `${window.location.origin}/#idea?id=${encodeURIComponent(productId)}`
    if (navigator.share) {
      navigator.share({
        title: idea?.product_title || 'IPL 2026 Innovation Idea',
        text: `Check out "${idea?.product_title || 'this innovation project'}" by ${idea?.team_name || 'the team'} on IPL 2026!`,
        url: canonicalUrl
      }).catch(() => {})
    } else {
      navigator.clipboard.writeText(canonicalUrl)
      showToast({
        type: 'success',
        title: 'LINK COPIED',
        message: 'Exact Idea Page link copied to clipboard!'
      })
    }
  }

  // Render: Loading State
  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4 pt-24 pb-16">
        <div className="text-center">
          <MechanicalLoader size={48} className="text-accent mx-auto" />
          <p className="mt-4 font-heading font-semibold text-slate-700">Loading innovation idea...</p>
          <p className="text-xs text-slate-500 mt-1">Retrieving verified project data</p>
        </div>
      </div>
    )
  }

  // Render: Error / Not Found State
  if (error || !idea) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4 pt-28 pb-16">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-accent border border-amber-200/80">
            <Lightbulb size={28} />
          </div>
          <h2 className="mt-4 font-heading text-xl font-black text-slate-900">Idea Not Found</h2>
          <p className="mt-2 text-sm text-slate-600">
            {error || 'The innovation idea you are looking for does not exist or may currently be inactive.'}
          </p>
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row justify-center">
            {onOpenVoteResolver && (
              <button
                type="button"
                onClick={onOpenVoteResolver}
                className="rounded-full bg-accent px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-600 transition cursor-pointer"
              >
                Search Another Idea
              </button>
            )}
            <button
              type="button"
              onClick={onBackToHome}
              className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Back to Homepage
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { stats, members } = idea
  const totalScore = stats?.total_score || (stats?.likes_count || 0) + (stats?.votes_count || 0) * 2

  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-16 px-4 md:px-6 lg:px-8 relative">
      {/* Toast Notification */}
      {toast &&
        createPortal(
          <aside
            role="alert"
            aria-live="assertive"
            className="fixed top-20 left-4 right-4 sm:left-auto sm:right-6 z-[99999] max-w-sm sm:max-w-md w-[calc(100vw-2rem)] sm:w-auto animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-auto shadow-2xl rounded-2xl bg-white border border-slate-200 overflow-hidden ring-1 ring-slate-900/10"
          >
            <div className="flex items-start gap-3 p-4">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${
                  toast.type === 'success'
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/80'
                    : toast.type === 'warning'
                    ? 'bg-amber-50 text-amber-600 border border-amber-200/80'
                    : 'bg-rose-50 text-rose-600 border border-rose-200/80'
                }`}
              >
                {toast.type === 'success' ? (
                  <CheckCircle2 size={18} />
                ) : toast.type === 'warning' ? (
                  <AlertTriangle size={18} />
                ) : (
                  <AlertCircle size={18} />
                )}
              </div>

              <div className="min-w-0 flex-1 pr-1">
                <h4 className="text-xs font-black uppercase tracking-wider text-[#0B1B3A] font-heading">
                  {toast.title}
                </h4>
                <p className="text-xs sm:text-sm font-semibold text-slate-700 leading-snug mt-0.5 break-words">
                  {toast.message}
                </p>
              </div>

              <button
                type="button"
                onClick={dismissToast}
                aria-label="Close notification"
                className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0 mt-0.5"
              >
                <X size={14} />
              </button>
            </div>

            <div className="h-1 w-full bg-slate-100 overflow-hidden">
              <div
                key={toast.id}
                className={`h-full animate-toast-progress ${
                  toast.type === 'success'
                    ? 'bg-emerald-500'
                    : toast.type === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ animationDuration: `${TOAST_DURATION}ms` }}
              />
            </div>
          </aside>,
          document.body
        )}

      <div className="mx-auto max-w-5xl space-y-6">
        {/* Navigation Breadcrumbs & Top Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBackToHome}
              aria-label="Back to Homepage"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ArrowLeft size={14} />
              Back to Home
            </button>

            <a
              href="#leaderboard"
              onClick={(e) => {
                if (typeof window !== 'undefined') {
                  window.location.hash = '#leaderboard'
                }
              }}
              aria-label="View Public Leaderboard"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Award size={14} className="text-amber-500" />
              Leaderboard
            </a>

            {onOpenVoteResolver && (
              <button
                type="button"
                onClick={onOpenVoteResolver}
                aria-label="Search or resolve other ideas"
                className="text-xs font-semibold text-accent hover:text-amber-600 transition cursor-pointer px-2 py-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Find Other Ideas
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleShare}
            aria-label="Share this innovation idea URL"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Share2 size={13} />
            Share Idea
          </button>
        </div>

        {/* HERO BANNER CARD */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-8 md:p-10 shadow-xl relative overflow-hidden">
          {/* Subtle Ambient Background */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="relative space-y-6">
            {/* Badges Row */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-extrabold tracking-wide text-primary uppercase">
                <Sparkles size={12} className="text-accent" />
                {idea.innovation_domain || 'Innovation Track'}
              </span>

              {idea.trl_level && (
                <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
                  TRL Level {idea.trl_level}
                </span>
              )}

              {idea.product_number && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                  Product #{idea.product_number}
                </span>
              )}

              {!isVotingActive && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                  <Lock size={11} />
                  Voting Inactive
                </span>
              )}
            </div>

            {/* Product Title & Team Info */}
            <div>
              <h1 className="font-heading text-xl sm:text-3xl md:text-4xl font-black text-slate-900 leading-tight break-words">
                {idea.product_title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
                <span className="font-bold text-slate-900">{idea.team_name}</span>

                {idea.registration_id && (
                  <>
                    <span className="text-slate-300 hidden sm:inline">•</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-mono font-bold text-slate-700">
                      <span className="text-[10px] uppercase font-semibold text-slate-400">Reg ID:</span>
                      {idea.registration_id}
                    </span>
                  </>
                )}

                <span className="text-slate-300 hidden sm:inline">•</span>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>Team ID:</span>
                  <code className="font-mono font-semibold bg-slate-100 px-2 py-0.5 rounded text-slate-700 text-[11px] truncate max-w-[120px] sm:max-w-xs md:max-w-none">
                    {idea.team_id}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyTeamId}
                    aria-label="Copy Team ID to clipboard"
                    className="p-1 text-slate-400 hover:text-slate-600 transition cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
            </div>

            {/* SCORE & CALL TO ACTION PANEL */}
            <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50 to-white p-5 sm:p-6 shadow-inner flex flex-col md:flex-row items-center justify-between gap-6">
              {/* Score Display Area */}
              <div className="flex flex-wrap items-center gap-5 sm:gap-6 w-full md:w-auto justify-around md:justify-start">
                {/* Total Score */}
                <div className="text-center md:text-left">
                  <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400 font-heading">
                    <Star size={11} className="text-amber-500 fill-amber-400" />
                    <span>Total Score</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="font-heading text-3xl sm:text-4xl font-black text-primary">
                      {totalScore}
                    </span>
                    <span className="text-xs font-bold text-slate-400 uppercase">pts</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block font-medium mt-0.5">
                    Score = Likes + (Votes × 2)
                  </span>
                </div>

                <div className="h-10 w-[1px] bg-slate-200 hidden sm:block" />

                {/* Score Breakdown: Likes & Votes */}
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      ❤️ Likes (+1)
                    </span>
                    <span className="font-heading text-xl font-bold text-slate-800 mt-0.5 block">
                      {stats?.likes_count || 0}
                    </span>
                  </div>

                  <div className="text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      🗳️ Votes (+2)
                    </span>
                    <span className="font-heading text-xl font-bold text-slate-800 mt-0.5 block">
                      {stats?.votes_count || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto justify-end">
                {/* LIKE BUTTON (Public - Free to All Visitors) */}
                <motion.button
                  whileHover={{ scale: hasLiked ? 1 : 1.02 }}
                  whileTap={{ scale: hasLiked ? 1 : 0.96 }}
                  type="button"
                  onClick={handleLike}
                  disabled={liking || hasLiked}
                  aria-label={hasLiked ? 'Idea already liked (+1 point)' : liking ? 'Recording like...' : 'Like this idea (+1 point)'}
                  className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-xs font-bold shadow-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 ${
                    hasLiked
                      ? 'bg-rose-50 text-rose-600 border border-rose-200/80 cursor-default shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-300 hover:border-rose-400 hover:text-rose-600 hover:bg-rose-50/50'
                  }`}
                >
                  <Heart
                    size={16}
                    className={`transition-colors ${
                      hasLiked ? 'fill-rose-500 text-rose-500' : liking ? 'animate-pulse text-rose-400' : 'text-slate-400'
                    }`}
                  />
                  <span>
                    {hasLiked
                      ? '❤️ Liked (+1)'
                      : liking
                      ? 'Recording...'
                      : '❤️ Like (+1)'}
                  </span>
                </motion.button>

                {/* VOTE BUTTON (Protected - Requires Google SECE Account) */}
                <motion.button
                  whileHover={{ scale: isVotingActive ? 1.02 : 1 }}
                  whileTap={{ scale: isVotingActive ? 0.96 : 1 }}
                  type="button"
                  disabled={!isVotingActive}
                  onClick={handleVoteClick}
                  aria-label={
                    !isVotingActive
                      ? 'Live voting is currently closed'
                      : idea.viewer_state?.has_voted
                      ? 'You have already voted for this idea'
                      : 'Cast an official vote for this idea (+2 points, requires Google login)'
                  }
                  className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-xs font-extrabold shadow-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                    !isVotingActive
                      ? 'bg-slate-200 text-slate-500 border border-slate-300 hover:bg-slate-300 cursor-not-allowed'
                      : idea.viewer_state?.has_voted
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                      : 'bg-accent hover:bg-amber-600 text-white hover:shadow-lg'
                  }`}
                >
                  {!isVotingActive ? (
                    <Lock size={15} />
                  ) : idea.viewer_state?.has_voted ? (
                    <Check size={15} className="text-emerald-600" />
                  ) : (
                    <Vote size={16} />
                  )}
                  <span>{isVotingActive ? '🗳️ Vote (+2)' : '🗳️ Voting Closed'}</span>
                </motion.button>
              </div>
            </div>
          </div>
        </div>

        {/* DETAILS GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Column: Problem, Solution, Impact (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Problem Area */}
            {idea.problem_area && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-rose-600 font-heading">
                  <Target size={14} />
                  Problem Statement
                </div>
                <p className="mt-3 text-sm text-slate-700 leading-relaxed whitespace-pre-line font-medium">
                  {idea.problem_area}
                </p>
              </div>
            )}

            {/* Proposed Solution */}
            {idea.proposed_solution && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-primary font-heading">
                  <Lightbulb size={14} className="text-accent" />
                  Proposed Solution & Methodology
                </div>
                <p className="mt-3 text-sm text-slate-700 leading-relaxed whitespace-pre-line font-medium">
                  {idea.proposed_solution}
                </p>
              </div>
            )}

            {/* Expected Impact */}
            {idea.expected_impact && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-600 font-heading">
                  <Sparkles size={14} />
                  Expected Impact & Commercial Feasibility
                </div>
                <p className="mt-3 text-sm text-slate-700 leading-relaxed whitespace-pre-line font-medium">
                  {idea.expected_impact}
                </p>
              </div>
            )}

            {/* SDG Goals */}
            {idea.sdg_goals && idea.sdg_goals.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500 block font-heading">
                  United Nations Sustainable Development Goals (SDGs)
                </span>
                <div className="mt-3 flex flex-wrap gap-2">
                  {idea.sdg_goals.map((sdg, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800"
                    >
                      {sdg}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Column: Team Members & Security Notices (1 col) */}
          <div className="space-y-6">
            {/* Verified Team Members (Public-Safe Names and Roles Only) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#0B1B3A] font-heading">
                  <Users size={14} className="text-accent" />
                  Innovation Team
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">
                  {members?.length || 0} Members
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {members && members.length > 0 ? (
                  members.map((member, idx) => {
                    const isLeader = member.is_team_leader || (member.role || '').toLowerCase().includes('leader')
                    const isMentor = (member.role || '').toLowerCase().includes('mentor')
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl bg-slate-50/80 p-3 border border-slate-100"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {member.member_name || member.name || 'Team Member'}
                          </p>
                          <span
                            className={`inline-block text-[10px] font-extrabold uppercase tracking-wide mt-0.5 ${
                              isLeader
                                ? 'text-accent'
                                : isMentor
                                ? 'text-primary'
                                : 'text-slate-500'
                            }`}
                          >
                            {member.role || (isLeader ? 'Team Leader' : isMentor ? 'Mentor' : 'Member')}
                          </span>
                        </div>

                        {isLeader && (
                          <span className="shrink-0 rounded-full bg-amber-100 p-1 text-accent">
                            <Award size={12} />
                          </span>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <p className="text-xs text-slate-500 italic">No public member roster provided.</p>
                )}
              </div>
            </div>

            {/* Voting Transparency & Eligibility Guidance Card */}
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 text-xs text-slate-600 space-y-2.5">
              <div className="flex items-center gap-1.5 font-bold text-primary text-xs uppercase tracking-wider">
                <ShieldCheck size={14} />
                Voting Transparency
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600">
                Community voting awards <strong>+2 points</strong> per vote. Voting requires authentication using your official <code>@sece.ac.in</code> college Google account.
              </p>
              <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside">
                <li>Students cannot vote for their own team.</li>
                <li>Students cannot vote for teams within their department.</li>
                <li>Public Likes (+1 point) are open to all visitors.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
