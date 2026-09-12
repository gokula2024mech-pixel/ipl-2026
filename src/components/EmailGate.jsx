import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../supabaseClient'
import { getPendingVotingToken, setPendingVotingToken, extractVotingTokenFromUrl, getPendingVoteIdea, getPendingRegistration } from '../utils/sessionNavigationState'

export default function EmailGate({ loginError, onBack }) {
  const [error, setError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const pendingToken = getPendingVotingToken() || extractVotingTokenFromUrl()
  const pendingVoteIdea = getPendingVoteIdea()
  const isPendingRegistration = getPendingRegistration()

  const handleGoogleLogin = async () => {
    setError('')
    setIsLoggingIn(false)
    try {
      if (pendingToken) {
        setPendingVotingToken(pendingToken)
      }
      // OAuth redirectTo MUST be a clean origin URL without hash fragments (RFC 6749 Section 3.1.2).
      // Pending navigation context (pendingVoteIdea, pendingToken, isPendingRegistration)
      // is safely preserved in sessionStorage and restored by App.jsx after session establishment.
      const redirectTo = `${window.location.origin}/`

      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      })
      if (authError) {
        setError('Failed to connect to Supabase Auth. Please try again.')
        console.error('OAuth initiation error:', authError)
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      console.error(err)
    }
  }

  const activeError = loginError || error

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
            {pendingVoteIdea ? 'Sign in to Cast Your Vote' : isPendingRegistration ? 'Sign in to Register Your Team' : 'Sri Eshwar College Access'}
          </h1>
          {pendingVoteIdea ? (
            <div className="mt-3 space-y-2 text-center">
              <p className="text-sm font-semibold text-slate-700 leading-snug">
                Sign in with your official <span className="font-mono text-primary font-bold">@sece.ac.in</span> Google account to cast an official vote (+2 points) for{' '}
                <span className="font-bold text-slate-900">{pendingVoteIdea.productTitle || 'this idea'}</span>.
              </p>
              <div className="rounded-xl bg-amber-50/80 border border-amber-200 p-3 text-[12px] text-amber-900 font-medium text-left space-y-1">
                <p className="font-bold text-amber-950 flex items-center gap-1.5">
                  <span>ℹ️</span> Voting Information:
                </p>
                <p>• Official voting requires Google sign-in and is restricted to eligible SECE users.</p>
                <p>• Students cannot vote for their own team or teams in their own department.</p>
                <p>• Public Likes (+1 point) do not require login and are open to all visitors.</p>
              </div>
            </div>
          ) : isPendingRegistration ? (
            <div className="mt-3 space-y-2 text-center">
              <p className="text-sm font-semibold text-slate-700 leading-snug">
                Sign in with your official <span className="font-mono text-primary font-bold">@sece.ac.in</span> Google account to register your team for IPL 2026.
              </p>
              <div className="rounded-xl bg-amber-50/80 border border-amber-200 p-3 text-[12px] text-amber-900 font-medium text-left space-y-1">
                <p className="font-bold text-amber-950 flex items-center gap-1.5">
                  <span>ℹ️</span> Registration Access:
                </p>
                <p>• Team registration requires official Google authentication (@sece.ac.in).</p>
                <p>• After signing in, you will be directed straight to the registration form.</p>
              </div>
            </div>
          ) : pendingToken ? (
            <p className="mt-2 text-sm text-slate-600">
              Sign in with your official @sece.ac.in college email to vote.
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              Please log in with your official college email account to access the IPL 2026 portal.
            </p>
          )}
        </div>

        <div className="space-y-5">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoggingIn}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white py-3 px-4 text-base font-semibold text-slate-700 shadow-md transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-lg disabled:opacity-50 cursor-pointer"
          >
            <svg className="mr-1 h-5 w-5" viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          {activeError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
              <p className="font-bold">Access Denied</p>
              <p className="mt-0.5">{activeError}</p>
            </div>
          )}

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer pt-2 block"
            >
              {pendingVoteIdea ? '← Back to Idea Page' : '← Back to Previous Page'}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
