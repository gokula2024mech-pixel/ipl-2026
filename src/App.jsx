import { useState, useEffect, useRef } from 'react'
import EmailGate from './components/EmailGate'
import AdminDashboard, { clearAdminCache } from './components/AdminDashboard'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import RegistrationModal from './components/RegistrationModal'
import RegistrationClosedModal from './components/RegistrationClosedModal'
import MySubmissionsModal from './components/MySubmissionsModal'
import MySubmissionsPage, { clearSubmissionsCache } from './components/MySubmissionsPage'
import VotingModal from './components/VotingModal'
import EntryCountdown from './components/EntryCountdown'
import MechanicalLoader from './components/MechanicalLoader'
import PublicIdeaPage from './components/PublicIdeaPage'
import IdeaResolutionModal from './components/IdeaResolutionModal'
import { supabase } from './supabaseClient'
import { getEventState } from './utils/eventTimeline'
import {
  getSessionState,
  saveSessionState,
  saveViewScroll,
  getViewScroll,
  clearSessionState,
  isRootOrHomeHash,
  normalizeHash,
  safeFindElement,
  extractVotingTokenFromUrl,
  getPendingVotingToken,
  setPendingVotingToken,
  clearPendingVotingToken,
  cleanVotingUrl,
  extractIdeaIdFromUrl,
  getPendingVoteIdea,
  clearPendingVoteIdea,
  getHasPassedCountdown,
  setHasPassedCountdown,
  getStoredSessionToken,
  getStoredVisitorToken,
  getPendingRegistration,
  setPendingRegistration,
  clearPendingRegistration
} from './utils/sessionNavigationState'

import About from './components/About'
import ProgramHighlights from './components/ProgramHighlights'
import Eligibility from './components/Eligibility'
import Domains from './components/Domains'
import FeaturesBenefits from './components/FeaturesBenefits'
import Journey from './components/Journey'
import Timeline from './components/Timeline'
import ProgramFlow from './components/ProgramFlow'
import Commercialization from './components/Commercialization'
import IncubationSupport from './components/IncubationSupport'
import Vision from './components/Vision'
import Mindset from './components/Mindset'
import Registration from './components/Registration'
import CTABanner from './components/CTABanner'
import Footer from './components/Footer'
import Leaderboard from './components/Leaderboard'

export default function App() {
  const initialSessionState = getSessionState()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAppInitialized, setIsAppInitialized] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false)
  const [isRegistrationClosedModalOpen, setIsRegistrationClosedModalOpen] = useState(false)
  const [isMySubmissionsOpen, setIsMySubmissionsOpen] = useState(false)
  const [isVotingModalOpen, setIsVotingModalOpen] = useState(false)
  const [votingToken, setVotingToken] = useState(() => {
    return extractVotingTokenFromUrl() || getPendingVotingToken() || ''
  })
  const [votingInitialTeamId, setVotingInitialTeamId] = useState('')
  const [votingInitialProductId, setVotingInitialProductId] = useState('')
  const [ideaProductId, setIdeaProductId] = useState(() => extractIdeaIdFromUrl() || '')
  const [ideaResolverInitialIdentifier, setIdeaResolverInitialIdentifier] = useState('')
  const [isIdeaResolverOpen, setIsIdeaResolverOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.hash === '#vote'
    }
    return false
  })
  const [hasPassedCountdown, setHasPassedCountdownState] = useState(() => getHasPassedCountdown())
  const [viewMode, setViewMode] = useState(() => {
    if (extractIdeaIdFromUrl()) return "idea"
    return initialSessionState?.viewMode || "public"
  })
  const [selectedPhase, setSelectedPhase] = useState(() => initialSessionState?.selectedPhase || 'my_submissions')
  const [currentHash, setCurrentHash] = useState(() => normalizeHash(window.location.hash || initialSessionState?.currentHash || ''))
  const resolvingTokenRef = useRef(null)

  // Handle direct QR URL deep-link, #idea, or #vote
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const extractedToken = extractVotingTokenFromUrl()
      const extractedIdeaId = extractIdeaIdFromUrl()

      if (extractedToken && resolvingTokenRef.current !== extractedToken) {
        resolvingTokenRef.current = extractedToken
        const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')
        const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl.slice(0, -4) : rawApiUrl

        fetch(`${API_BASE_URL}/api/ideas/resolve/${encodeURIComponent(extractedToken)}`)
          .then(res => res.json())
          .then(data => {
            if (data && data.success) {
              const type = data.resolution_type
              if (type === 'qr_product' || type === 'qr_team_single' || type === 'direct_product' || type === 'team_single') {
                const targetProductId = data.product_id || data.product?.product_id
                if (targetProductId) {
                  setIdeaProductId(targetProductId)
                  setViewMode('idea')
                  setCurrentHash('#idea?id=' + targetProductId)
                  cleanVotingUrl('#idea?id=' + targetProductId)
                  setShowAuth(false)
                  return
                }
              } else if (type === 'qr_team_multi' || type === 'team_multi') {
                cleanVotingUrl()
                setIdeaResolverInitialIdentifier(extractedToken)
                setIsIdeaResolverOpen(true)
                setShowAuth(false)
                return
              }
            }
            // If resolution did not succeed or returned error
            cleanVotingUrl()
            setIdeaResolverInitialIdentifier(extractedToken)
            setIsIdeaResolverOpen(true)
            setShowAuth(false)
          })
          .catch(err => {
            console.error('[App] Error resolving QR token:', err)
            cleanVotingUrl()
            setIdeaResolverInitialIdentifier(extractedToken)
            setIsIdeaResolverOpen(true)
            setShowAuth(false)
          })
      } else if (extractedIdeaId) {
        setIdeaProductId(extractedIdeaId)
        setViewMode('idea')
      } else if (currentHash === '#vote') {
        setIsIdeaResolverOpen(true)
      }
    }
  }, [currentHash, session]);

  // Timer UI Panel Open/Close state (persists across session)
  const [timerPanelOpen, setTimerPanelOpen] = useState(() => {
    try {
      const saved = sessionStorage.getItem('ipl_timer_panel_open')
      return saved !== null ? JSON.parse(saved) : true
    } catch {
      return true
    }
  })

  const handleToggleTimerPanel = (isOpen) => {
    setTimerPanelOpen(isOpen)
    try {
      sessionStorage.setItem('ipl_timer_panel_open', JSON.stringify(isOpen))
    } catch (e) {
      console.warn('Could not save timer panel state', e)
    }
  }

  // Authoritative Countdown States
  const [regTimer, setRegTimer] = useState(null)
  const [dbPhases, setDbPhases] = useState([])
  const [serverOffset, setServerOffset] = useState(0)
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    label: 'Loading...',
    status: 'loading'
  })
  const [showAuth, setShowAuth] = useState(false)

  // Fetch timer config from Supabase
  const fetchTimerData = async () => {
    try {
      const { data: regData, error: regError } = await supabase
        .from('registration_timer')
        .select('*')
        .maybeSingle()

      const { data: phasesData, error: phasesError } = await supabase
        .from('phases')
        .select('*')
        .order('phase_number', { ascending: true })

      if (!regError && regData) setRegTimer(regData)
      if (!phasesError && phasesData) setDbPhases(phasesData)
    } catch (err) {
      console.error('Error fetching global timer config:', err)
    }
  }

  // Fetch server time offset on mount
  useEffect(() => {
    const fetchServerTime = async () => {
      try {
        const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')
        const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl.slice(0, -4) : rawApiUrl
        const res = await fetch(`${API_BASE_URL}/api/server-time`)
        const data = await res.json()
        if (data.success && data.serverTime) {
          const serverTimeMs = new Date(data.serverTime).getTime()
          const offset = serverTimeMs - Date.now()
          setServerOffset(offset)
        }
      } catch (err) {
        console.error('Error fetching server time offset:', err)
      }
    }
    fetchServerTime()
    fetchTimerData()

    // Record website visit on initial page load / refresh (strictly once per load, immune to internal SPA navigation)
    const recordSiteVisit = async () => {
      try {
        const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')
        const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl.slice(0, -4) : rawApiUrl
        const sessionToken = getStoredSessionToken()
        const visitorToken = getStoredVisitorToken()

        const authHeaders = {}
        try {
          const { data: { session: currentSession } } = await supabase.auth.getSession()
          if (currentSession?.access_token) {
            authHeaders['Authorization'] = `Bearer ${currentSession.access_token}`
          }
        } catch (e) {}

        await fetch(`${API_BASE_URL}/api/analytics/site-visit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
            ...(visitorToken ? { 'x-visitor-token': visitorToken } : {}),
            ...authHeaders
          },
          body: JSON.stringify({
            session_token: sessionToken || undefined,
            visitor_token: visitorToken || undefined
          })
        })
      } catch (err) {
        // Non-blocking telemetry
      }
    }
    recordSiteVisit()

    // Subscriptions
    const phasesChannel = supabase
      .channel('app-global-phases')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phases' }, () => {
        fetchTimerData()
      })
      .subscribe()

    const regChannel = supabase
      .channel('app-global-registration')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_timer' }, () => {
        fetchTimerData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(phasesChannel)
      supabase.removeChannel(regChannel)
    }
  }, [])

  // Authoritative global countdown timer interval
  useEffect(() => {
    const timer = setInterval(() => {
      const currentServerTime = Date.now() + (serverOffset || 0)
      const config = getEventState(regTimer, dbPhases, currentServerTime)
      if (!config) return

      let diff = 0
      if (config.isPaused) {
        if (config.remainingSeconds) {
          diff = Number(config.remainingSeconds) * 1000
        } else if (config.targetTimeMs) {
          diff = Math.max(0, config.targetTimeMs - currentServerTime)
        }
      } else if (config.targetTimeMs) {
        diff = config.targetTimeMs - currentServerTime
        if (diff <= 0) {
          diff = 0
          fetchTimerData()
        }
      }

      const seconds = Math.max(0, Math.floor((diff / 1000) % 60))
      const minutes = Math.max(0, Math.floor((diff / 1000 / 60) % 60))
      const hours = Math.max(0, Math.floor((diff / (1000 * 60 * 60)) % 24))
      const days = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))

      setTimeLeft({
        days,
        hours,
        minutes,
        seconds,
        label: config.countdownLabel,
        phaseName: config.phaseName,
        statusBadge: config.statusBadge,
        statusDotColor: config.statusDotColor,
        timelineTitle: config.timelineTitle,
        status: config.statusKey,
        isRegistrationOpen: config.isRegistrationOpen,
        paused: config.isPaused,
        scheduled_start_at: config.scheduledStartAt,
        scheduled_end_at: config.scheduledEndAt
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [dbPhases, regTimer, serverOffset])

  // Ensure browser native scroll restoration is active for natural tab-switching and navigation
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'auto'
    }
  }, [])

  useEffect(() => {
    const handleHashChange = () => {
      const normalized = normalizeHash(window.location.hash)
      setCurrentHash(normalized)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  // Sync state changes with session navigation state
  useEffect(() => {
    saveSessionState({
      viewMode,
      selectedPhase,
      currentHash: normalizeHash(window.location.hash || currentHash)
    })
  }, [viewMode, selectedPhase, currentHash])

  // Track and passively save scroll position per active view
  useEffect(() => {
    let timeoutId = null
    const handleScroll = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        if (typeof window !== 'undefined') {
          saveViewScroll(viewMode, window.scrollY)
        }
      }, 150)
    }

    const handleLifecycleSave = () => {
      if (typeof window !== 'undefined') {
        saveViewScroll(viewMode, window.scrollY)
        saveSessionState({
          viewMode,
          selectedPhase,
          currentHash: normalizeHash(window.location.hash || currentHash)
        })
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('visibilitychange', handleLifecycleSave)
    window.addEventListener('pagehide', handleLifecycleSave)
    window.addEventListener('beforeunload', handleLifecycleSave)
    window.addEventListener('blur', handleLifecycleSave)

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('visibilitychange', handleLifecycleSave)
      window.removeEventListener('pagehide', handleLifecycleSave)
      window.removeEventListener('beforeunload', handleLifecycleSave)
      window.removeEventListener('blur', handleLifecycleSave)
    }
  }, [viewMode, selectedPhase, currentHash])

  // Restore scroll position or scroll to initial URL hash on page load / view switch / hash change
  useEffect(() => {
    if (!isAppInitialized) return

    if (viewMode === 'public') {
      const rawHash = window.location.hash || currentHash
      
      // If navigating to root / home (bare '#', empty, '#/'), scroll to top smoothly without querying DOM
      if (isRootOrHomeHash(rawHash)) {
        if (rawHash === '#' || rawHash === '#/') {
          try {
            history.replaceState(null, '', window.location.pathname + window.location.search)
          } catch (e) {}
        }
        const savedScroll = getViewScroll('public')
        if (savedScroll && savedScroll > 10 && !rawHash) {
          window.scrollTo({ top: savedScroll, behavior: 'instant' })
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
        return
      }

      const hash = rawHash.trim()
      if (hash && hash !== '#leaderboard' && hash !== '#vote') {
        const target = safeFindElement(hash)
        if (target) {
          const navbarHeight = 80
          const targetPosition = target.getBoundingClientRect().top + window.scrollY - navbarHeight
          setTimeout(() => {
            window.scrollTo({
              top: Math.max(0, targetPosition),
              behavior: 'smooth'
            })
          }, 50)
          return
        }
      }

      const savedScroll = getViewScroll('public')
      if (savedScroll && savedScroll > 10 && !hash) {
        window.scrollTo({ top: savedScroll, behavior: 'instant' })
      }
    } else if (viewMode === 'submissions') {
      const savedScroll = getViewScroll('submissions')
      if (savedScroll && savedScroll > 10) {
        setTimeout(() => {
          window.scrollTo({ top: savedScroll, behavior: 'instant' })
        }, 80)
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' })
      }
    } else if (viewMode === 'admin') {
      const savedScroll = getViewScroll('admin')
      if (savedScroll && savedScroll > 10) {
        setTimeout(() => {
          window.scrollTo({ top: savedScroll, behavior: 'instant' })
        }, 80)
      }
    }
  }, [isAppInitialized, viewMode, currentHash])

  const authGenerationRef = useRef(0)
  const activeUserIdRef = useRef(null)

  const handleOpenRegistration = () => {
    // Check if registration is actively open according to authoritative regTimer state
    const isRunning = regTimer?.timer_status === 'running'
    const now = Date.now() + (serverOffset || 0)
    const start = regTimer?.scheduled_start_at ? new Date(regTimer.scheduled_start_at).getTime() : null
    const end = regTimer?.scheduled_end_at ? new Date(regTimer.scheduled_end_at).getTime() : null

    let isOpen = isRunning
    if (isRunning) {
      if (start && now < start) isOpen = false
      if (end && now > end) isOpen = false
    }

    if (!isOpen) {
      setIsRegistrationClosedModalOpen(true)
      return
    }

    // Gated behind authentication: Unauthenticated visitors must sign in first
    if (!session?.user) {
      setPendingRegistration(true)
      setShowAuth(true)
      return
    }

    // Authenticated user: open registration form directly
    setIsRegistrationOpen(true)
  }

  const handleCloseRegistration = async () => {
    setIsRegistrationOpen(false)
    clearPendingRegistration()
    if (currentHash === '#register' || currentHash === '#registration') {
      setCurrentHash('')
      if (typeof window !== 'undefined' && window.location.hash) {
        try {
          history.replaceState(null, '', window.location.pathname + window.location.search)
        } catch (e) {}
      }
    }
    if (session?.user) {
      const userProfile = await loadProfile(session.user)
      setProfile(userProfile)
    }
  }

  // Auto-restore in-flight pending registration upon successful login
  useEffect(() => {
    if (session?.user && !loading && regTimer) {
      const isPendingReg = getPendingRegistration()
      if (isPendingReg) {
        clearPendingRegistration()
        handleOpenRegistration()
      }
    }
  }, [session, loading, regTimer])

  // Direct URL routing for #register / #registration / ?register=true
  useEffect(() => {
    if (!loading && regTimer) {
      const isRegisterUrl = currentHash === '#register' || currentHash === '#registration' || (typeof window !== 'undefined' && window.location.search.includes('register=true'))
      if (isRegisterUrl) {
        handleOpenRegistration()
      }
    }
  }, [loading, regTimer, currentHash])

  const loadProfile = async (user) => {
    try {
      let profileData = null
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        console.error('[AUTH] loadProfile error:', error.message)
      } else if (data) {
        profileData = data
      }

      // Department resolution hierarchy:
      // 1. Authoritative profiles.department
      // 2. Synchronized user_metadata.department
      const resolvedDept = (profileData?.department || user?.user_metadata?.department || '').trim() || null
      if (resolvedDept) {
        if (profileData) {
          profileData.department = resolvedDept
        } else {
          profileData = { user_id: user.id, email: user.email, department: resolvedDept, role: 'student' }
        }
      }

      return profileData
    } catch (err) {
      console.error('[AUTH] loadProfile error (exception):', err)
      return null
    }
  }

  const handleSession = async (currentSession, eventType) => {
    console.log('[AUTH] current URL:', window.location.href)
    const hasHashToken = window.location.hash.includes('access_token=')
    console.log('[AUTH] URL hash contains access_token:', hasHashToken)

    try {
      const storedKeys = Object.keys(localStorage).filter(k => k.includes('supabase.auth.token'))
      if (storedKeys.length > 0) {
        const storedVal = localStorage.getItem(storedKeys[0])
        console.log('[AUTH] localStorage Supabase session:', !!storedVal)
      } else {
        console.log('[AUTH] localStorage Supabase session:', false)
      }
    } catch (e) {
      console.error('[AUTH] Error reading localStorage:', e)
    }

    console.log(`[AUTH] handleSession called, eventType: ${eventType}, sessionExists: ${!!currentSession}`)

    // If session is signed out or null
    if (!currentSession || eventType === "SIGNED_OUT") {
      // If we are in the middle of an OAuth callback (hash contains access_token),
      // do NOT reset the state or clear the loading screen yet. We wait for the SIGNED_IN event.
      if (window.location.hash.includes('access_token=')) {
        return
      }

      const generation = ++authGenerationRef.current
      activeUserIdRef.current = null
      setSession(null)
      setProfile(null)
      setViewMode("public")
      clearSessionState()
      clearSubmissionsCache()
      clearAdminCache()
      setLoading(false)
      setIsAppInitialized(true)
      return
    }

    // Guard: If the user is already authenticated and active (e.g. returning from mobile native file picker
    // or tab refocus), update session silently without triggering a full unmounting loading screen.
    const isSameActiveUser = activeUserIdRef.current && activeUserIdRef.current === currentSession.user.id
    if (isSameActiveUser) {
      setSession(currentSession)
      return
    }

    // Now we have a valid newly establishing session (cold start, initial load, or new sign-in).
    if (
      eventType === "SIGNED_IN" ||
      eventType === "INITIAL_SESSION" ||
      eventType === "INITIAL_LOAD"
    ) {
      const generation = ++authGenerationRef.current
      activeUserIdRef.current = currentSession.user.id

      // Only show global loading on cold initial application startup
      if (!isAppInitialized) {
        setLoading(true)
      }
      const email = currentSession.user.email || ''

      // Email domain validation
      if (!email.toLowerCase().endsWith('@sece.ac.in')) {
        // If this request is still current
        if (generation === authGenerationRef.current) {
          setLoginError('Please sign in using your @sece.ac.in college account.')
          activeUserIdRef.current = null
          setSession(null)
          setProfile(null)
          setViewMode("public")
          clearSessionState()
          await supabase.auth.signOut()
          setLoading(false)
          setIsAppInitialized(true)
        }
        return
      }

      setLoginError('')

      // Fetch profile
      const userProfile = await loadProfile(currentSession.user)

      // Guard check: is this async result still representing the current generation?
      if (generation === authGenerationRef.current) {
        activeUserIdRef.current = currentSession.user.id
        setSession(currentSession)
        setProfile(userProfile)

        const savedState = getSessionState()
        let finalViewMode = "public"

        // If new sign-in, record authenticated visit
        if (eventType === "SIGNED_IN" && currentSession?.access_token) {
          try {
            const rawApiUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')
            const API_BASE_URL = rawApiUrl.endsWith('/api') ? rawApiUrl.slice(0, -4) : rawApiUrl
            const sessionToken = getStoredSessionToken()
            const visitorToken = getStoredVisitorToken()
            fetch(`${API_BASE_URL}/api/analytics/site-visit`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
                ...(visitorToken ? { 'x-visitor-token': visitorToken } : {}),
                'Authorization': `Bearer ${currentSession.access_token}`
              },
              body: JSON.stringify({
                session_token: sessionToken || undefined,
                visitor_token: visitorToken || undefined
              })
            }).catch(() => {})
          } catch (e) {}
        }

        // Account mismatch check: if stored state belongs to another user email, reset it
        if (savedState?.userEmail && savedState.userEmail !== currentSession.user.email) {
          clearSessionState()
        }

        // Role-safe restoration
        if (savedState?.viewMode === "admin") {
          finalViewMode = userProfile?.role === "admin" ? "admin" : "public"
        } else if (savedState?.viewMode === "submissions") {
          finalViewMode = "submissions"
        } else if (savedState?.viewMode === "public") {
          finalViewMode = "public"
        } else {
          // Default when no session state exists (e.g. fresh session start)
          finalViewMode = userProfile?.role === "admin" ? "admin" : "public"
        }

        setViewMode(finalViewMode)
        if (savedState?.selectedPhase) {
          setSelectedPhase(savedState.selectedPhase)
        }

        saveSessionState({
          viewMode: finalViewMode,
          selectedPhase: savedState?.selectedPhase || selectedPhase,
          userEmail: currentSession.user.email
        })

        // Check if there was an in-flight pending vote idea
        const pendingVote = getPendingVoteIdea()
        if (pendingVote && pendingVote.productId) {
          clearPendingVoteIdea()
          setIdeaProductId(pendingVote.productId)
          setViewMode("idea")
          setCurrentHash('#idea?id=' + pendingVote.productId)
          setVotingInitialTeamId(pendingVote.teamId || '')
          setVotingInitialProductId(pendingVote.productId || '')
          setIsVotingModalOpen(true)
        } else {
          // Check if there was an in-flight direct QR voting token
          const pendingToken = extractVotingTokenFromUrl() || getPendingVotingToken()
          if (pendingToken) {
            setVotingToken(pendingToken)
            setIsVotingModalOpen(true)
          }
        }

        setLoading(false)
        setIsAppInitialized(true)
      }
    }
    else if (eventType === "TOKEN_REFRESHED") {
      const generation = authGenerationRef.current
      setSession(currentSession)

      // Load profile silently in background without triggering loading screen
      const userProfile = await loadProfile(currentSession.user)
      if (generation === authGenerationRef.current) {
        setProfile(userProfile)
      }
    }
    else {
      // Any other events (fallback)
      setSession(currentSession)
    }
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      handleSession(initialSession, "INITIAL_LOAD")
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (newSession) {
        handleSession(newSession, event)
      } else {
        handleSession(null, event)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  if (!isAppInitialized && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary">
        <div className="text-center text-white">
          <MechanicalLoader size={48} className="text-accent mx-auto" />
          <p className="mt-4 font-heading font-medium">Loading session...</p>
        </div>
      </div>
    )
  }

  const isPhaseRunning = Boolean(timeLeft?.status?.endsWith('_active') || timeLeft?.status === 'registration_open')

  if (!session) {
    if (showAuth) {
      return (
        <EmailGate
          loginError={loginError}
          onBack={() => {
            setShowAuth(false)
            clearPendingRegistration()
            if (currentHash === '#register' || currentHash === '#registration') {
              setCurrentHash('')
              if (typeof window !== 'undefined' && window.location.hash) {
                try {
                  history.replaceState(null, '', window.location.pathname + window.location.search)
                } catch (e) {}
              }
            }
          }}
        />
      )
    }

    // Protected views strictly require authentication
    if (viewMode === 'submissions' || viewMode === 'admin') {
      return (
        <EmailGate
          loginError={loginError}
          onBack={() => setViewMode('public')}
        />
      )
    }

    // Active Phase / Countdown Gate:
    // When a phase is running, unauthenticated visitors see EntryCountdown on initial visit.
    // Direct idea links, #vote, or QR scans bypass countdown.
    const isDirectPublicRoute = Boolean(currentHash.startsWith('#idea') || extractIdeaIdFromUrl() || currentHash === '#vote' || extractVotingTokenFromUrl() || currentHash === '#register' || currentHash === '#registration')
    if (isPhaseRunning && !hasPassedCountdown && !isDirectPublicRoute) {
      return (
        <EntryCountdown
          onEnter={() => {
            setHasPassedCountdownState(true)
            setHasPassedCountdown(true)
          }}
          serverOffset={serverOffset}
        />
      )
    }
  }

  // Centralized Application Active View Source of Truth
  const getActiveView = () => {
    if (loading) return 'loading'
    if (!session && showAuth) return 'login'
    if (profile?.role === 'admin' && viewMode === 'admin') return 'admin'
    if (viewMode === 'submissions') return 'my_submissions'
    if (viewMode === 'idea') return 'idea'
    if (isRegistrationOpen) return 'registration'
    if (isRegistrationClosedModalOpen) return 'registration_closed'
    if (isMySubmissionsOpen) return 'my_submissions_modal'
    if (currentHash === '#leaderboard') return 'leaderboard'
    return 'home'
  }

  const activeView = getActiveView()
  const isHomeView = activeView === 'home'

  if (profile?.role === 'admin' && viewMode === 'admin') {
    return (
      <AdminDashboard
        user={session.user}
        profile={profile}
        onViewPublicPortal={() => setViewMode("public")}
      />
    )
  }

  const isLeaderboardPage = currentHash === '#leaderboard'

  return (
    <>
      <Navbar
        onRegisterClick={handleOpenRegistration}
        onSignInClick={() => setShowAuth(true)}
        user={session?.user}
        profile={profile}
        onProfileUpdate={async () => {
          if (session?.user) {
            const userProfile = await loadProfile(session.user)
            setProfile(userProfile)
          }
        }}
        onMySubmissionsClick={(phase = 'my_submissions') => {
          if (!session) {
            setShowAuth(true)
            return
          }
          setSelectedPhase(phase)
          setViewMode("submissions")
        }}
        onNavClick={(href) => {
          if (viewMode !== "public") {
            setViewMode("public")
          }
          if (currentHash === "#leaderboard") {
            setCurrentHash(normalizeHash(href))
          } else {
            setCurrentHash(normalizeHash(href))
          }
          if (!normalizeHash(href) && window.location.hash) {
            try {
              history.replaceState(null, '', window.location.pathname + window.location.search)
            } catch (e) {}
          }
        }}
        timeLeft={timeLeft}
        onReturnToAdmin={() => setViewMode("admin")}
        onVoteClick={() => setIsIdeaResolverOpen(true)}
      />
      <main>
        {viewMode === "submissions" ? (
          <MySubmissionsPage
            onBackToHome={() => setViewMode("public")}
            selectedPhase={selectedPhase}
            setSelectedPhase={setSelectedPhase}
            session={session}
            user={session?.user}
          />
        ) : isLeaderboardPage ? (
          <Leaderboard
            user={session?.user}
            session={session}
            profile={profile}
            onProfileUpdate={async () => {
              if (session?.user) {
                const userProfile = await loadProfile(session.user);
                setProfile(userProfile);
              }
            }}
          />
        ) : viewMode === "idea" ? (
          <PublicIdeaPage
            productId={ideaProductId}
            session={session}
            user={session?.user}
            profile={profile}
            onBackToHome={() => {
              setViewMode("public")
              setCurrentHash("")
              try {
                history.replaceState(null, '', window.location.pathname + window.location.search)
              } catch (e) {}
            }}
            onOpenVoteResolver={() => setIsIdeaResolverOpen(true)}
            onTriggerVote={({ teamId, productId }) => {
              setVotingInitialTeamId(teamId)
              setVotingInitialProductId(productId)
              setIsVotingModalOpen(true)
            }}
            onRequireLogin={() => setShowAuth(true)}
          />
        ) : (
          <>
            <Hero
              onRegisterClick={handleOpenRegistration}
              timeLeft={timeLeft}
              profile={profile}
              showTimer={isHomeView}
              timerPanelOpen={timerPanelOpen}
              onTimerPanelToggle={handleToggleTimerPanel}
              onMySubmissionsClick={() => {
                setSelectedPhase('my_submissions')
                setViewMode("submissions")
              }}
            />
            <About />
            <ProgramHighlights />
            <Eligibility />
            <Domains />
            <FeaturesBenefits />
            <Journey />
            <Timeline regTimer={regTimer} dbPhases={dbPhases} serverOffset={serverOffset} />
            <ProgramFlow />
            <Commercialization />
            <IncubationSupport />
            <Vision />
            <Mindset />
            <Registration onRegisterClick={handleOpenRegistration} />
            <CTABanner onRegisterClick={handleOpenRegistration} />
          </>
        )}
      </main>
      <Footer
        onNavClick={(href) => {
          if (viewMode !== "public") {
            setViewMode("public")
          }
          const normalized = normalizeHash(href)
          setCurrentHash(normalized)
          if (!normalized && window.location.hash) {
            try {
              history.replaceState(null, '', window.location.pathname + window.location.search)
            } catch (e) {}
          }
        }}
      />

      <RegistrationModal
        isOpen={Boolean(isRegistrationOpen && session)}
        onClose={handleCloseRegistration}
        onRegistrationClosed={() => setIsRegistrationClosedModalOpen(true)}
      />

      <RegistrationClosedModal
        isOpen={isRegistrationClosedModalOpen}
        onClose={() => setIsRegistrationClosedModalOpen(false)}
      />

      <MySubmissionsModal
        isOpen={isMySubmissionsOpen}
        onClose={() => setIsMySubmissionsOpen(false)}
        mode="full"
      />

      {profile?.role === 'admin' && viewMode === 'public' && (
        <button
          type="button"
          onClick={() => setViewMode("admin")}
          className="hidden lg:flex fixed bottom-6 right-6 z-50 items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-amber-600 cursor-pointer"
        >
          Return to Admin Console
        </button>
      )}

      <VotingModal
        isOpen={isVotingModalOpen}
        onClose={() => {
          setIsVotingModalOpen(false)
          setVotingToken('')
          setVotingInitialTeamId('')
          setVotingInitialProductId('')
          clearPendingVotingToken()
          cleanVotingUrl()
        }}
        onTokenConsumed={() => {
          clearPendingVotingToken()
          cleanVotingUrl()
        }}
        initialToken={votingToken}
        initialTeamId={votingInitialTeamId}
        initialProductId={votingInitialProductId}
        user={session?.user}
        session={session}
        profile={profile}
        onProfileUpdate={async (savedDept) => {
          if (savedDept) {
            setProfile(prev => ({ ...(prev || {}), department: savedDept }))
            setSession(prev => prev ? ({
              ...prev,
              user: {
                ...prev.user,
                user_metadata: { ...(prev.user?.user_metadata || {}), department: savedDept }
              }
            }) : prev)
          }
          if (session?.user) {
            const userProfile = await loadProfile(session.user)
            if (userProfile) {
              setProfile(prev => ({
                ...userProfile,
                department: userProfile.department || savedDept || prev?.department
              }))
            }
          }
        }}
        onRequireLogin={() => {
          setIsVotingModalOpen(false)
          setShowAuth(true)
        }}
      />

      <IdeaResolutionModal
        isOpen={isIdeaResolverOpen}
        initialIdentifier={ideaResolverInitialIdentifier}
        onClose={() => {
          setIsIdeaResolverOpen(false)
          setIdeaResolverInitialIdentifier('')
          if (currentHash === '#vote') {
            setCurrentHash('')
            try {
              history.replaceState(null, '', window.location.pathname + window.location.search)
            } catch (e) {}
          }
        }}
        onSelectProduct={(chosenProductId) => {
          setIdeaProductId(chosenProductId)
          setViewMode("idea")
          setCurrentHash('#idea?id=' + chosenProductId)
          try {
            window.location.hash = '#idea?id=' + chosenProductId
          } catch (e) {}
          setIsIdeaResolverOpen(false)
          setIdeaResolverInitialIdentifier('')
        }}
      />
    </>
  )
}
