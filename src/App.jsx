import { lazy, Suspense, useState, useEffect, useRef } from 'react'
import EmailGate from './components/EmailGate'
import AdminDashboard from './components/AdminDashboard'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import RegistrationModal from './components/RegistrationModal'
import MySubmissionsModal from './components/MySubmissionsModal'
import EntryCountdown from './components/EntryCountdown'
import { supabase } from './supabaseClient'

const About = lazy(() => import('./components/About'))
const ProgramHighlights = lazy(() => import('./components/ProgramHighlights'))
const Eligibility = lazy(() => import('./components/Eligibility'))
const Domains = lazy(() => import('./components/Domains'))
const WhatYouGain = lazy(() => import('./components/WhatYouGain'))
const FeaturesBenefits = lazy(() => import('./components/FeaturesBenefits'))
const Journey = lazy(() => import('./components/Journey'))
const Judging = lazy(() => import('./components/Judging'))
const Timeline = lazy(() => import('./components/Timeline'))
const Leaderboard = lazy(() => import('./components/Leaderboard'))
const ProgramFlow = lazy(() => import('./components/ProgramFlow'))
const Commercialization = lazy(() => import('./components/Commercialization'))
const IncubationSupport = lazy(() => import('./components/IncubationSupport'))
const Vision = lazy(() => import('./components/Vision'))
const Mindset = lazy(() => import('./components/Mindset'))
const Registration = lazy(() => import('./components/Registration'))
const CTABanner = lazy(() => import('./components/CTABanner'))
const Footer = lazy(() => import('./components/Footer'))

function SectionFallback() {
  return <div className="py-20" aria-hidden="true" />
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loginError, setLoginError] = useState('')
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false)
  const [isMySubmissionsOpen, setIsMySubmissionsOpen] = useState(false)
  const [viewMode, setViewMode] = useState("public")
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
    const getActiveConfig = () => {
      if (!regTimer) return null

      if (regTimer.timer_status === 'running' || regTimer.timer_status === 'paused') {
        return {
          label: 'Registration Open',
          status: regTimer.timer_status,
          paused: regTimer.is_timer_paused,
          remaining_seconds: regTimer.remaining_seconds,
          scheduled_start_at: regTimer.scheduled_start_at,
          scheduled_end_at: regTimer.scheduled_end_at
        }
      }

      const activePhase = dbPhases.find(p => p.timer_status === 'running' || p.timer_status === 'paused')
      if (activePhase) {
        return {
          label: activePhase.name,
          status: activePhase.timer_status,
          paused: activePhase.is_timer_paused,
          remaining_seconds: activePhase.remaining_seconds,
          scheduled_start_at: activePhase.scheduled_start_at,
          scheduled_end_at: activePhase.scheduled_end_at
        }
      }

      if (regTimer.timer_status === 'upcoming') {
        return {
          label: 'Registration',
          status: regTimer.timer_status,
          paused: false,
          remaining_seconds: null,
          scheduled_start_at: regTimer.scheduled_start_at,
          scheduled_end_at: regTimer.scheduled_end_at
        }
      }

      return null
    }

    const timer = setInterval(() => {
      const config = getActiveConfig()
      if (!config) {
        setTimeLeft(prev => ({ ...prev, status: 'closed', label: 'Registration Closed' }))
        return
      }

      let diff = 0
      const currentServerTime = Date.now() + serverOffset

      if (config.status === 'running') {
        const end = new Date(config.scheduled_end_at).getTime()
        diff = end - currentServerTime
        if (config.paused && config.remaining_seconds) {
          diff = Number(config.remaining_seconds) * 1000
        }
        if (diff <= 0) {
          diff = 0
          fetchTimerData()
        }
      } else if (config.status === 'upcoming') {
        const start = new Date(config.scheduled_start_at).getTime()
        diff = start - currentServerTime
        if (diff <= 0) {
          diff = 0
          fetchTimerData()
        }
      } else if (config.status === 'paused') {
        diff = Number(config.remaining_seconds || 0) * 1000
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
        label: config.label,
        status: config.status,
        paused: config.paused
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [dbPhases, regTimer, serverOffset])

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  useEffect(() => {
    if (viewMode === 'public') {
      const hash = window.location.hash
      if (hash && hash !== '#leaderboard') {
        setTimeout(() => {
          const element = document.querySelector(hash)
          if (element) {
            const navbarHeight = 80
            const targetPosition = element.getBoundingClientRect().top + window.scrollY - navbarHeight
            window.scrollTo({
              top: targetPosition,
              behavior: 'smooth'
            })
          }
        }, 150)
      } else if (hash === '#leaderboard') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
  }, [currentHash, viewMode])

  const authGenerationRef = useRef(0)

  const handleOpenRegistration = () => {
    setIsRegistrationOpen(true)
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
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent mx-auto"></div>
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
        onMySubmissionsClick={() => setIsMySubmissionsOpen(true)}
        timeLeft={timeLeft}
      />
      <main>
        {isLeaderboardPage ? (
          <Suspense fallback={
            <div className="flex min-h-[60vh] items-center justify-center bg-white py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent mx-auto"></div>
            </div>
          }>
            <Leaderboard />
          </Suspense>
        ) : (
          <>
            <Hero onRegisterClick={handleOpenRegistration} timeLeft={timeLeft} />
            <Suspense fallback={<SectionFallback />}>
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
            </Suspense>
          </>
        )}
      </main>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>

      <RegistrationModal
        isOpen={isRegistrationOpen}
        onClose={handleCloseRegistration}
      />

      <MySubmissionsModal
        isOpen={isMySubmissionsOpen}
        onClose={() => setIsMySubmissionsOpen(false)}
      />

      {profile?.role === 'admin' && viewMode === 'public' && (
        <button
          type="button"
          onClick={() => setViewMode("admin")}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-amber-600 cursor-pointer"
        >
          Return to Admin Console
        </button>
      )}

    </>
  )
}
