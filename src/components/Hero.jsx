import { motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { TAGLINE, SUB_TAGLINE, REGISTRATION_FORM_URL } from '../data/content'

const STATS = [
  '3 Phases',
  '4 Weeks',
  '3–4 Members/Team',
  '10+ Innovation Domains',
]

export default function Hero({ onRegisterClick }) {
  const handleRegister = (e) => {
    if (onRegisterClick) {
      e.preventDefault()
      onRegisterClick()
    }
  }

  return (
    <section
      id="hero"
      className="relative flex min-h-screen items-center overflow-hidden bg-primary pt-20"
      aria-label="Hero"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-amber-500/15 blur-3xl" />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
          className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 opacity-10"
        >
          <svg viewBox="0 0 600 600" fill="none" className="h-full w-full">
            <circle cx="300" cy="300" r="280" stroke="white" strokeWidth="0.5" strokeDasharray="8 12" />
            <circle cx="300" cy="300" r="200" stroke="white" strokeWidth="0.5" strokeDasharray="4 8" />
            <circle cx="300" cy="300" r="120" stroke="white" strokeWidth="0.5" />
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <line
                key={deg}
                x1="300"
                y1="300"
                x2={300 + 280 * Math.cos((deg * Math.PI) / 180)}
                y2={300 + 280 * Math.sin((deg * Math.PI) / 180)}
                stroke="white"
                strokeWidth="0.5"
                opacity="0.4"
              />
            ))}
          </svg>
        </motion.div>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-16 md:px-6 lg:px-8 lg:py-24">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-4xl text-center"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm text-blue-100 backdrop-blur-sm">
            <Sparkles size={16} className="text-accent" aria-hidden="true" />
            <span>Innovation Program 2026</span>
          </div>

          <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl lg:text-6xl">
            IPL 2026 — Innovative Product League
          </h1>

          <p className="mt-6 text-lg font-medium text-amber-300 md:text-xl">{TAGLINE}</p>
          <p className="mt-2 text-base text-blue-100 md:text-lg">{SUB_TAGLINE}</p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {STATS.map((stat, i) => (
              <motion.span
                key={stat}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm"
              >
                {stat}
              </motion.span>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={REGISTRATION_FORM_URL}
              onClick={handleRegister}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-amber-600 hover:shadow-xl"
            >
              Register Now
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a
              href="#about"
              className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 bg-white/10 px-8 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/50 hover:bg-white/20"
            >
              Explore the Program
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
