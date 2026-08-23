import { lazy, Suspense, useState, useEffect } from 'react'
import EmailGate from './components/EmailGate'
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
        console.error('Error fetching profile:', error.message)
      }
      return data
    } catch (err) {
      console.error('Unexpected error loading profile:', err)
      return null
    }
  }

  const handleSession = async (currentSession) => {
    if (currentSession?.user) {
      const email = currentSession.user.email || ''
      if (!email.toLowerCase().endsWith('@sece.ac.in')) {
        setLoginError('Please sign in using your @sece.ac.in college account.')
        setSession(null)
        setProfile(null)
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      setLoginError('')
      setSession(currentSession)
      
      const userProfile = await loadProfile(currentSession.user)
      setProfile(userProfile)
    } else {
      setSession(null)
      setProfile(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      handleSession(initialSession)
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (event === 'SIGNED_IN') {
        handleSession(newSession)
      } else if (event === 'SIGNED_OUT') {
        setSession(null)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
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
    </>
  )
}
