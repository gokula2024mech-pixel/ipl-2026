import { lazy, Suspense, useState, useEffect, useRef } from 'react'
import EmailGate from './components/EmailGate'
import AdminDashboard from './components/AdminDashboard'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import RegistrationModal from './components/RegistrationModal'
import RegistrationClosedModal from './components/RegistrationClosedModal'
import MySubmissionsModal from './components/MySubmissionsModal'
import MySubmissionsPage from './components/MySubmissionsPage'
import EntryCountdown from './components/EntryCountdown'
import MechanicalLoader from './components/MechanicalLoader'
import { supabase } from './supabaseClient'
import { getEventState } from './utils/eventTimeline'

import About from './components/About'
import ProgramHighlights from './components/ProgramHighlights'
import Eligibility from './components/Eligibility'
import Domains from './components/Domains'
import WhatYouGain from './components/WhatYouGain'
import FeaturesBenefits from './components/FeaturesBenefits'
import Journey from './components/Journey'
import Judging from './components/Judging'
import Timeline from './components/Timeline'
import ProgramFlow from './components/ProgramFlow'
import Commercialization from './components/Commercialization'
import IncubationSupport from './components/IncubationSupport'
import Vision from './components/Vision'
import Mindset from './components/Mindset'
import Registration from './components/Registration'
import CTABanner from './components/CTABanner'
import Footer from './components/Footer'

const Leaderboard = lazy(() => import('./components/Leaderboard'))

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loginError, setLoginError] = useState('')
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false)
  const [isRegistrationClosedModalOpen, setIsRegistrationClosedModalOpen] = useState(false)
  const [isMySubmissionsOpen, setIsMySubmissionsOpen] = useState(false)
  const [viewMode, setViewMode] = useState("public")
  const [selectedPhase, setSelectedPhase] = useState('my_submissions')
  const [currentHash, setCurrentHash] = useState(window.location.hash)

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

  const SCROLL_POS_KEY = 'ipl2026_home_scroll_position'

  // Ensure browser native scroll restoration is active for natural tab-switching and navigation
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'auto'
    }
  }, [])

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  // Passively save scroll position for page reloads
  useEffect(() => {
    if (viewMode !== 'public' || currentHash === '#leaderboard') return

    let timeoutId = null
    const handleScroll = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        if (typeof window !== 'undefined' && viewMode === 'public') {
          localStorage.setItem(SCROLL_POS_KEY, String(window.scrollY))
        }
      }, 150)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [viewMode, currentHash])

  // Restore scroll position or scroll to initial URL hash on page load
  useEffect(() => {
    if (viewMode !== 'public' || currentHash === '#leaderboard' || loading) return

    const hash = window.location.hash
    if (hash && hash !== '#leaderboard') {
      const targetId = hash.slice(1)
      const target = document.getElementById(targetId) || document.querySelector(hash)
      if (target) {
        const navbarHeight = 80
        const targetPosition = target.getBoundingClientRect().top + window.scrollY - navbarHeight
        setTimeout(() => {
          window.scrollTo({
            top: Math.max(0, targetPosition),
            behavior: 'smooth'
          })
        }, 150)
        return
      }
    }

    const saved = localStorage.getItem(SCROLL_POS_KEY)
    if (saved && !hash) {
      const targetY = parseFloat(saved)
      if (targetY > 10) {
        window.scrollTo({ top: targetY, behavior: 'instant' })
      }
    }
  }, [loading, viewMode])

  const authGenerationRef = useRef(0)

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

    if (isOpen) {
      setIsRegistrationOpen(true)
    } else {
      setIsRegistrationClosedModalOpen(true)
    }
  }

  const handleCloseRegistration = async () => {
    setIsRegistrationOpen(false)
    if (session?.user) {
      const userProfile = await loadProfile(session.user)
      setProfile(userProfile)
    }
  }

  const loadProfile = async (user) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        console.error('[AUTH] loadProfile error:', error.message)
      } else {
        console.log('[AUTH] loadProfile result:', data)
      }
      return data
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
        console.log(`[AUTH] Ignoring null session during OAuth callback hash parsing (eventType: ${eventType})`)
        return
      }

      const generation = ++authGenerationRef.current
      console.log(`[AUTH] SIGNED_OUT event or null session. Incrementing generation to ${generation}. Resetting states.`)
      setSession(null)
      setProfile(null)
      setViewMode("public")
      setLoading(false)
      return
    }

    // Now we have a valid session.
    // If it is SIGNED_IN, INITIAL_SESSION, or INITIAL_LOAD, we treat it as a new auth lifecycle
    if (
      eventType === "SIGNED_IN" ||
      eventType === "INITIAL_SESSION" ||
      eventType === "INITIAL_LOAD"
    ) {
      const generation = ++authGenerationRef.current
      console.log(`[AUTH] Newly established session via ${eventType}. Incrementing generation to ${generation}.`)

      setLoading(true)
      const email = currentSession.user.email || ''
      console.log('[AUTH] session user email:', email)

      // Email domain validation
      if (!email.toLowerCase().endsWith('@sece.ac.in')) {
        // If this request is still current
        if (generation === authGenerationRef.current) {
          console.log('[AUTH] signOut called (invalid email domain)')
          setLoginError('Please sign in using your @sece.ac.in college account.')
          setSession(null)
          setProfile(null)
          setViewMode("public")
          await supabase.auth.signOut()
          setLoading(false)
        } else {
          console.log(`[AUTH] Stale email domain validation ignored for generation ${generation}. Current is ${authGenerationRef.current}.`)
        }
        return
      }

      setLoginError('')

      // Fetch profile
      const userProfile = await loadProfile(currentSession.user)

      // Guard check: is this async result still representing the current generation?
      if (generation === authGenerationRef.current) {
        setSession(currentSession)
        setProfile(userProfile)

        const finalViewMode = userProfile?.role === "admin" ? "admin" : "public"
        setViewMode(finalViewMode)
        console.log(`[AUTH] Setting viewMode to ${finalViewMode}`)
        setLoading(false)

        if (hasHashToken) {
          console.log('[AUTH] OAuth callback origin:', window.location.origin)
          console.log('[AUTH] OAuth callback URL:', window.location.href.split('#')[0])
          console.log('[AUTH] OAuth callback session exists:', true)
          console.log('[AUTH] OAuth callback user email:', email)
          console.log('[AUTH] OAuth callback profile:', userProfile ? 'exists' : 'null')
          console.log('[AUTH] OAuth callback profile role:', userProfile?.role || 'none')
          console.log('[AUTH] Final viewMode:', finalViewMode)
        }
      } else {
        console.log(`[AUTH] Stale loadProfile result ignored for generation ${generation}. Current is ${authGenerationRef.current}.`)
      }
    }
    else if (eventType === "TOKEN_REFRESHED") {
      const generation = authGenerationRef.current
      console.log(`[AUTH] TOKEN_REFRESHED event. Current generation is ${generation}.`)

      setSession(currentSession)

      // Load profile to make sure profile state is updated (in case of changes)
      const userProfile = await loadProfile(currentSession.user)
      if (generation === authGenerationRef.current) {
        setProfile(userProfile)
        console.log('[AUTH] Profile state updated on TOKEN_REFRESHED (viewMode unchanged)')
      } else {
        console.log(`[AUTH] Stale TOKEN_REFRESHED profile load ignored for generation ${generation}.`)
      }
    }
    else {
      // Any other events (fallback)
      console.log(`[AUTH] Event ${eventType} fallback. Updating session.`)
      setSession(currentSession)
    }
  }

  useEffect(() => {
    console.log('[AUTH] App.jsx useEffect mounting...')

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      console.log('[AUTH] getSession result:', !!initialSession)
      if (initialSession) {
        console.log('[AUTH] getSession user email:', initialSession.user?.email)
      }
      handleSession(initialSession, "INITIAL_LOAD")
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('[AUTH] auth event:', event)
      console.log('[AUTH] newSession exists:', !!newSession)
      if (newSession) {
        console.log('[AUTH] auth state change user email:', newSession.user?.email)
        handleSession(newSession, event)
      } else {
        console.log('[AUTH] clearing session/profile from onAuthStateChange (newSession is null)')
        handleSession(null, event)
      }
    })

    return () => {
      console.log('[AUTH] App.jsx useEffect cleanup unmounting...')
      subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary">
        <div className="text-center text-white">
          <MechanicalLoader size={48} className="text-accent mx-auto" />
          <p className="mt-4 font-heading font-medium">Loading session...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    if (showAuth) {
      return (
        <EmailGate
          loginError={loginError}
          onBack={() => setShowAuth(false)}
        />
      )
    }
    return (
      <EntryCountdown
        onEnter={() => setShowAuth(true)}
        serverOffset={serverOffset}
      />
    )
  }

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
        user={session.user}
        profile={profile}
        onProfileUpdate={async () => {
          if (session?.user) {
            const userProfile = await loadProfile(session.user)
            setProfile(userProfile)
          }
        }}
        onMySubmissionsClick={(phase = 'my_submissions') => {
          setSelectedPhase(phase)
          setViewMode("submissions")
        }}
        timeLeft={timeLeft}
        onReturnToAdmin={() => setViewMode("admin")}
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
          <Suspense fallback={
            <div className="flex min-h-[60vh] items-center justify-center bg-white py-20">
              <MechanicalLoader size={40} className="text-accent mx-auto" />
            </div>
          }>
            <Leaderboard />
          </Suspense>
        ) : (
          <>
            <Hero
              onRegisterClick={handleOpenRegistration}
              timeLeft={timeLeft}
              profile={profile}
              onMySubmissionsClick={() => {
                setSelectedPhase('my_submissions')
                setViewMode("submissions")
              }}
            />
            <About />
            <ProgramHighlights />
            <Eligibility />
            <Domains />
            <WhatYouGain />
            <FeaturesBenefits />
            <Journey />
            <Judging />
            <Timeline />
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
      <Footer />

      <RegistrationModal
        isOpen={isRegistrationOpen}
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

    </>
  )
}
