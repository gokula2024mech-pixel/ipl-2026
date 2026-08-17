import { lazy, Suspense, useState } from 'react'
import EmailGate from './components/EmailGate'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import RegistrationModal from './components/RegistrationModal'

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

const SESSION_KEY = 'ipl2026_verified'

function SectionFallback() {
  return <div className="py-20" aria-hidden="true" />
}

export default function App() {
  const [isVerified, setIsVerified] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === 'true',
  )
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false)

  const handleVerified = () => {
    sessionStorage.setItem(SESSION_KEY, 'true')
    setIsVerified(true)
  }

  const handleOpenRegistration = () => {
    setIsRegistrationOpen(true)
  }

  const handleCloseRegistration = () => {
    setIsRegistrationOpen(false)
  }

  if (!isVerified) {
    return <EmailGate onVerified={handleVerified} />
  }

  return (
    <>
      <Navbar onRegisterClick={handleOpenRegistration} />
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
