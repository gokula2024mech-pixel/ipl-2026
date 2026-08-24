import { lazy, Suspense, useState, useEffect, useRef } from 'react'
import EmailGate from './components/EmailGate'
import AdminDashboard from './components/AdminDashboard'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import RegistrationModal from './components/RegistrationModal'
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

  const lastProcessedUserIdRef = useRef(null)

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

    const currentUserId = currentSession?.user?.id || null
    console.log(`[AUTH] handleSession called, eventType: ${eventType}, currentUserId: ${currentUserId}, lastProcessedUserId: ${lastProcessedUserIdRef.current}`)

    // Lock condition to prevent duplicate executions and races
    if (currentUserId === lastProcessedUserIdRef.current) {
      console.log(`[AUTH] User ID unchanged (${currentUserId}), skipping profile reload.`)
      if (currentSession) {
        setSession(currentSession)
      }
      setLoading(false)
      return
    }

    // Update ref lock
    lastProcessedUserIdRef.current = currentUserId

    if (currentSession?.user) {
      setLoading(true)
      const email = currentSession.user.email || ''
      console.log('[AUTH] session user email:', email)
      
      if (!email.toLowerCase().endsWith('@sece.ac.in')) {
        console.log('[AUTH] signOut called (invalid email domain)')
        setLoginError('Please sign in using your @sece.ac.in college account.')
        setSession(null)
        setProfile(null)
        setViewMode("public")
        lastProcessedUserIdRef.current = null
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      setLoginError('')
      setSession(currentSession)
      
      const userProfile = await loadProfile(currentSession.user)
      setProfile(userProfile)

      // Explicitly adjust viewMode for newly established/re-established sessions
      if (userProfile?.role === "admin") {
        console.log('[AUTH] Setting viewMode to admin')
        setViewMode("admin")
      } else {
        console.log('[AUTH] Setting viewMode to public')
        setViewMode("public")
      }
    } else {
      console.log('[AUTH] Resetting session, profile, and viewMode to public')
      setSession(null)
      setProfile(null)
      setViewMode("public")
    }
    setLoading(false)
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
        setSession(null)
        setProfile(null)
        setViewMode("public")
        lastProcessedUserIdRef.current = null
        setLoading(false)
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
    </>
  )
}
