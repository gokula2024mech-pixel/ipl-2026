import { useState, useEffect } from 'react'
import { CalendarDays, ExternalLink } from 'lucide-react'
import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'
import { REGISTRATION_FORM_URL } from '../data/content'
import { supabase } from '../supabaseClient'

const ELIGIBILITY = [
  { label: 'Departments', value: 'All Engineering' },
  { label: 'Eligible Students', value: 'UG' },
  { label: 'Team Size', value: '3' },
  { label: 'Faculty Mentor', value: 'Mandatory' },
]

export default function Registration({ onRegisterClick }) {
  const [regTimer, setRegTimer] = useState(null)
  const [regCountdown, setRegCountdown] = useState(null)

  useEffect(() => {
    const fetchRegTimer = async () => {
      try {
        const { data, error } = await supabase
          .from("registration_timer")
          .select("*")
          .maybeSingle()
        if (!error && data) {
          setRegTimer(data)
        }
      } catch (err) {
        console.error("Error loading registration timer:", err)
      }
    }
    fetchRegTimer()
  }, [])

  // Local ticker countdown
  useEffect(() => {
    if (!regTimer) return

    const interval = setInterval(() => {
      if (regTimer.is_timer_running && regTimer.scheduled_end_at) {
        const end = new Date(regTimer.scheduled_end_at).getTime()
        let diff = end - Date.now()
        if (regTimer.is_timer_paused && regTimer.remaining_seconds) {
          diff = Number(regTimer.remaining_seconds) * 1000
        }

        if (diff <= 0) {
          setRegCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Completed" })
          if (regTimer.timer_status === "running") {
            regTimer.timer_status = "completed"
            regTimer.is_timer_running = false
            regTimer.is_timer_paused = false
            setRegTimer({ ...regTimer })
          }
        } else {
          const seconds = Math.floor((diff / 1000) % 60)
          const minutes = Math.floor((diff / 1000 / 60) % 60)
          const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
          const days = Math.floor(diff / (1000 * 60 * 60 * 24))

          let statusText = "In Progress"
          const totalSeconds = diff / 1000
          if (totalSeconds <= 3600) {
            statusText = "Ending Shortly"
          } else if (totalSeconds <= 86400) {
            statusText = "Ending Soon"
          }

          setRegCountdown({ days, hours, minutes, seconds, statusText })
        }
      } else if (regTimer.timer_status === "paused") {
        const diff = Number(regTimer.remaining_seconds || 0) * 1000
        const seconds = Math.floor((diff / 1000) % 60)
        const minutes = Math.floor((diff / 1000 / 60) % 60)
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
        const days = Math.floor(diff / (1000 * 60 * 60 * 24))
        setRegCountdown({ days, hours, minutes, seconds, statusText: "Paused" })
      } else if (regTimer.timer_status === "completed") {
        setRegCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Completed" })
      } else if (regTimer.timer_status === "closed") {
        setRegCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Closed" })
      } else {
        setRegCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Upcoming" })
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [regTimer])

  const handleRegister = (e) => {
    if (onRegisterClick) {
      e.preventDefault()
      onRegisterClick()
    }
  }

  return (
    <section id="registration" className="bg-slate-50 py-20 md:py-28">
      <div className="mx-auto max-w-2xl px-4 md:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Registration"
          title="Register Your Team"
          subtitle="Join IPL 2026 and start your innovation journey."
        />

        <SectionReveal>
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm md:p-10">
            {regTimer && regTimer.timer_status !== 'upcoming' ? (
              <div className="mb-8 flex flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-6 py-6">
                <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                  {regTimer.timer_status === 'paused' ? 'REGISTRATION PAUSED' :
                   regTimer.timer_status === 'completed' || regTimer.timer_status === 'closed' ? 'REGISTRATION CLOSED' :
                   'REGISTRATION CLOSES IN'}
                </p>

                {regTimer.timer_status !== 'completed' && regTimer.timer_status !== 'closed' && regCountdown && (
                  <p className="font-mono text-2xl font-bold text-slate-900 mt-2 tracking-widest">
                    {`${String(regCountdown.days).padStart(2, "0")}d : ` +
                     `${String(regCountdown.hours).padStart(2, "0")}h : ` +
                     `${String(regCountdown.minutes).padStart(2, "0")}m : ` +
                     `${String(regCountdown.seconds).padStart(2, "0")}s`}
                  </p>
                )}

                <div className="mt-2 flex justify-center">
                  <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${
                    regTimer.timer_status === 'paused' ? 'bg-amber-100 text-amber-800 ring-amber-600/20' :
                    regTimer.timer_status === 'completed' || regTimer.timer_status === 'closed' ? 'bg-slate-100 text-slate-800 ring-slate-600/20' :
                    regCountdown?.statusText === 'Ending Shortly' ? 'bg-red-100 text-red-700 ring-red-600/20 animate-pulse' :
                    regCountdown?.statusText === 'Ending Soon' ? 'bg-amber-100 text-amber-700 ring-amber-600/20 animate-pulse' :
                    'bg-green-100 text-green-700 ring-green-600/20'
                  }`}>
                    {regTimer.timer_status === 'paused' ? 'Paused' :
                     regTimer.timer_status === 'completed' ? 'Completed' :
                     regTimer.timer_status === 'closed' ? 'Closed' :
                     regCountdown?.statusText || 'In Progress'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mb-8 flex items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-6 py-4">
                <CalendarDays size={28} className="text-accent" aria-hidden="true" />
                <p className="text-base font-semibold text-slate-800 md:text-lg">
                  Registration opens on{' '}
                  <span className="font-heading text-xl text-primary md:text-2xl">18-Aug-2026</span>
                </p>
              </div>
            )}

            <div className="mb-8 rounded-xl border border-slate-200 bg-slate-50 p-6 text-left">
              <p className="mb-4 text-center font-heading text-lg font-bold text-slate-900">
                Eligibility Recap
              </p>
              <ul className="space-y-3">
                {ELIGIBILITY.map(({ label, value }) => (
                  <li
                    key={label}
                    className="flex items-center justify-between rounded-lg bg-white px-4 py-3 text-sm"
                  >
                    <span className="font-medium text-slate-600">{label}</span>
                    <span className="font-semibold text-slate-900">{value}</span>
                  </li>
                ))}
              </ul>
            </div>

            <a
              href={REGISTRATION_FORM_URL}
              onClick={handleRegister}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-10 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-amber-600 hover:shadow-xl"
            >
              Register Now
              <ExternalLink size={20} aria-hidden="true" />
            </a>
          </div>
        </SectionReveal>
      </div>
    </section>
  )
}
