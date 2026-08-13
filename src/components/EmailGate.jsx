import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, ArrowRight } from 'lucide-react'

const ALLOWED_DOMAIN = '@sece.ac.in'

// Lightweight client-side check only — not real authentication.
// Anyone can bypass this in dev tools; use server-side auth for production protection.
function isValidCollegeEmail(email) {
  return email.trim().toLowerCase().endsWith(ALLOWED_DOMAIN)
}

export default function EmailGate({ onVerified }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }
    if (!isValidCollegeEmail(email)) {
      setError('Please use your official Sri Eshwar College email (@sece.ac.in) to continue.')
      return
    }
    setError('')
    onVerified()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary px-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-amber-500/15 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white p-8 shadow-2xl md:p-10"
      >
        <div className="mb-8 text-center">
          <p className="font-heading text-2xl font-bold text-primary">
            IPL <span className="text-accent">2026</span>
          </p>
          <h1 className="mt-4 font-heading text-xl font-bold text-slate-900 md:text-2xl">
            Sri Eshwar College Access Only
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Enter your official college email to view the program website.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
              Email Address
            </label>
            <div className="relative">
              <Mail
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (error) setError('')
                }}
                placeholder="you@sece.ac.in"
                autoComplete="email"
                className={`w-full rounded-lg border py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:ring-2 focus:ring-primary/20 ${
                  error ? 'border-red-400' : 'border-slate-300 focus:border-primary'
                }`}
              />
            </div>
            {error && (
              <p className="mt-2 text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-base font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-amber-600 hover:shadow-xl"
          >
            Continue
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>
      </motion.div>
    </div>
  )
}
