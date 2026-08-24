import { lazy, Suspense, useState, useEffect, useRef } from 'react'
import EmailGate from './components/EmailGate'
import AdminDashboard from './components/AdminDashboard'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import RegistrationModal from './components/RegistrationModal'
import { supabase } from './supabaseClient'
import PublicFloatingTimer from './components/PublicFloatingTimer'

const About = lazy(() => import('./components/About'))
const ProgramHighlights = lazy(() => import('./components/ProgramHighlights'))
const Eligibility = lazy(() => import('./components/Eligibility'))
const Domains = lazy(() => import('./components/Domains'))
const WhatYouGain = lazy(() => import('./components/WhatYouGain'))
const FeaturesBenefits = lazy(() => import('./components/FeaturesBenefits'))
const Journey = lazy(() => import('./components/Journey'))
const TimerSpotlight = lazy(() => import('./components/Journey').then(m => ({ default: m.TimerSpotlight })))
const Judging = lazy(() => import('./components/Judging'))
const Timeline = lazy(() => import('./components/Timeline'))
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
  const [viewMode, setViewMode] = useState("public")

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
    return <EmailGate loginError={loginError} />
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

  return (
    <>
      <Navbar
        onRegisterClick={handleOpenRegistration}
        user={session.user}
        profile={profile}
      />
      <main>
        <Hero onRegisterClick={handleOpenRegistration} />
        <Suspense fallback={<SectionFallback />}>
          <TimerSpotlight />
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
      </main>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>

      <RegistrationModal
        isOpen={isRegistrationOpen}
        onClose={handleCloseRegistration}
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

      {viewMode === "public" && (
        <PublicFloatingTimer isAdminPublicView={profile?.role === 'admin'} />
      )}
    </>
  )
}
