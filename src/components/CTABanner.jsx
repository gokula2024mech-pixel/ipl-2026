import { ArrowRight } from 'lucide-react'
import SectionReveal from './SectionReveal'
import { REGISTRATION_FORM_URL } from '../data/content'

export default function CTABanner() {
  return (
    <section id="cta" className="relative overflow-hidden bg-gradient-to-r from-primary via-blue-800 to-primary py-16 md:py-20">
      <div className="pointer-events-none absolute inset-0 opacity-20" aria-hidden="true">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-400 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-blue-400 blur-3xl" />
      </div>

      <SectionReveal className="relative mx-auto max-w-4xl px-4 text-center md:px-6">
        <h2 className="font-heading text-3xl font-bold text-white md:text-4xl lg:text-5xl">
          Your Idea Can Become a Product.
        </h2>
        <p className="mt-4 text-lg text-blue-100">
          Join IPL 2026 and take the first step from imagination to innovation.
        </p>
        <a
          href={REGISTRATION_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-amber-600 hover:shadow-xl"
        >
          Register Now
          <ArrowRight size={18} aria-hidden="true" />
        </a>
      </SectionReveal>
    </section>
  )
}
