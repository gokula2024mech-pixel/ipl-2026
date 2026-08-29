import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { TAGLINE, SUB_TAGLINE, REGISTRATION_FORM_URL } from '../data/content'
import { supabase } from '../supabaseClient'

const STATS = [
  '3 Phases',
  '4 Weeks',
  '3 Members/Team',
  '10+ Innovation Domains',
]

const formatDateTime = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const pad = (n) => String(n).padStart(2, '0')

  const day = d.getDate()
  const month = months[d.getMonth()]
  const year = d.getFullYear()
  let hours = d.getHours()
  const minutes = pad(d.getMinutes())
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  hours = hours ? hours : 12

  return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`
}

const renderHeroDates = (timeLeft) => {
  const startStr = timeLeft.scheduled_start_at
  const endStr = timeLeft.scheduled_end_at
  if (!startStr || !endStr) return 'No configured dates'

  const startFormatted = formatDateTime(startStr)
  const endFormatted = formatDateTime(endStr)
  if (!startFormatted || !endFormatted) return 'No configured dates'

  if (timeLeft.status === 'upcoming') {
    return (
      <div className="flex flex-col gap-1 w-full text-slate-500 font-sans">
        <div className="flex justify-between items-center text-[10px]">
          <span className="text-[9px] tracking-wider text-amber-500 font-black uppercase">STARTS</span>
          <span className="font-bold">{startFormatted}</span>
        </div>
        <div className="flex justify-between items-center text-[10px]">
          <span className="text-[9px] tracking-wider text-amber-500 font-black uppercase">ENDS</span>
          <span className="font-bold">{endFormatted}</span>
        </div>
      </div>
    )
  }

  // Active / Paused / Closed
  return (
    <div className="flex flex-col gap-0.5 w-full text-slate-500 font-sans">
      <div className="text-[9px] tracking-wider text-slate-400 font-black uppercase">TIMELINE</div>
      <div className="flex items-center gap-1.5 text-[11px] font-bold">
        <span>{startFormatted}</span>
        <span className="text-amber-500">→</span>
        <span>{endFormatted}</span>
      </div>
    </div>
  )
}

// Embedded Floating Timer Component
function HeroTimer({ timeLeft: propTimeLeft }) {
  const [dbPhases, setDbPhases] = useState([])
  const [regTimer, setRegTimer] = useState(null)
  const [localTimeLeft, setLocalTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    label: 'Registration',
    status: 'upcoming',
    scheduled_start_at: null,
    scheduled_end_at: null
  })

  const timeLeft = propTimeLeft || localTimeLeft

  // Dragging State
  const [dragPosition, setDragPosition] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef(null)
  const cursorOffsetRef = useRef({ x: 0, y: 0 })

  const fetchTimerData = async () => {
    try {
      // 1. Fetch registration timer
      const { data: regData, error: regError } = await supabase
        .from('registration_timer')
        .select('*')
        .maybeSingle()

      // 2. Fetch phases
      const { data: phasesData, error: phasesError } = await supabase
        .from('phases')
        .select('*')
        .order('phase_number', { ascending: true })

      if (!regError && regData) setRegTimer(regData)
      if (!phasesError && phasesData) setDbPhases(phasesData)
    } catch (err) {
      console.error('Error fetching hero timer config:', err)
    }
  }

  // Pointer Event Handlers for Dragging
  const handlePointerDown = (e) => {
    // Only allow left click (mouse) or touch inputs
    if (e.button !== 0 && e.type === 'pointerdown') return

    // Prevent dragging on interactive elements inside the card
    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) {
      return
    }

    const card = dragRef.current
    if (!card) return

    setIsDragging(true)
    card.setPointerCapture(e.pointerId)

    const rect = card.getBoundingClientRect()
    cursorOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }

    setDragPosition({
      left: rect.left,
      top: rect.top
    })
  }

  const handlePointerMove = (e) => {
    if (!isDragging || !dragPosition) return

    const card = dragRef.current
    if (!card) return

    const rect = card.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let newLeft = e.clientX - cursorOffsetRef.current.x
    let newTop = e.clientY - cursorOffsetRef.current.y

    // Constrain position to completely keep card within the viewport bounds
    newLeft = Math.max(0, Math.min(newLeft, viewportWidth - rect.width))
    newTop = Math.max(0, Math.min(newTop, viewportHeight - rect.height))

    setDragPosition({
      left: newLeft,
      top: newTop
    })
  }

  const handlePointerUp = (e) => {
    if (!isDragging) return
    setIsDragging(false)
    const card = dragRef.current
    if (card) {
      card.releasePointerCapture(e.pointerId)
    }
  }

  // Reset custom position on resize so card snaps back to default layout position
  useEffect(() => {
    const handleResize = () => {
      setDragPosition(null)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    fetchTimerData()

    // Realtime channel subscriptions
    const phasesChannel = supabase
      .channel('hero-timer-phases')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phases' }, () => {
        fetchTimerData()
      })
      .subscribe()

    const regChannel = supabase
      .channel('hero-timer-registration')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_timer' }, () => {
        fetchTimerData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(phasesChannel)
      supabase.removeChannel(regChannel)
    }
  }, [])

  useEffect(() => {
    const getActiveTimerConfig = () => {
      if (!regTimer || dbPhases.length === 0) return null

      // 1. If Registration is running or paused
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

      // 2. Find a running or paused phase
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

      // 3. Find next upcoming phase or registration
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

      const upcomingPhase = dbPhases.find(p => p.timer_status === 'upcoming')
      if (upcomingPhase) {
        return {
          label: upcomingPhase.name,
          status: upcomingPhase.timer_status,
          paused: false,
          remaining_seconds: null,
          scheduled_start_at: upcomingPhase.scheduled_start_at,
          scheduled_end_at: upcomingPhase.scheduled_end_at
        }
      }

      // 4. Closed/completed - fallback to the registration timer dates, or the last phase's dates
      if (regTimer.scheduled_start_at && regTimer.scheduled_end_at) {
        return {
          label: 'Registration Closed',
          status: 'closed',
          paused: false,
          remaining_seconds: 0,
          scheduled_start_at: regTimer.scheduled_start_at,
          scheduled_end_at: regTimer.scheduled_end_at
        }
      }

      const lastPhase = dbPhases[dbPhases.length - 1]
      if (lastPhase) {
        return {
          label: 'Registration Closed',
          status: 'closed',
          paused: false,
          remaining_seconds: 0,
          scheduled_start_at: lastPhase.scheduled_start_at,
          scheduled_end_at: lastPhase.scheduled_end_at
        }
      }

      return {
        label: 'Registration Closed',
        status: 'closed',
        paused: false,
        remaining_seconds: 0,
        scheduled_start_at: null,
        scheduled_end_at: null
      }
    }

    const timer = setInterval(() => {
      const config = getActiveTimerConfig()
      if (!config) return

      let diff = 0
      let needsRefresh = false

      if (config.status === 'running') {
        const end = new Date(config.scheduled_end_at).getTime()
        diff = end - Date.now()
        if (config.paused && config.remaining_seconds) {
          diff = Number(config.remaining_seconds) * 1000
        }
        if (diff <= 0) {
          diff = 0
          needsRefresh = true
        }
      } else if (config.status === 'upcoming') {
        const start = new Date(config.scheduled_start_at).getTime()
        diff = start - Date.now()
        if (diff <= 0) {
          diff = 0
          needsRefresh = true
        }
      } else if (config.status === 'paused') {
        diff = Number(config.remaining_seconds || 0) * 1000
      }

      const seconds = Math.floor((diff / 1000) % 60)
      const minutes = Math.floor((diff / 1000 / 60) % 60)
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))

      setLocalTimeLeft({
        days,
        hours,
        minutes,
        seconds,
        label: config.label,
        status: config.status,
        scheduled_start_at: config.scheduled_start_at,
        scheduled_end_at: config.scheduled_end_at
      })

      if (needsRefresh) {
        fetchTimerData()
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [dbPhases, regTimer])

  // Custom styles for dragging behavior with a subtle 2-degree tilt
  const dragStyle = dragPosition
    ? {
        position: 'fixed',
        left: `${dragPosition.left}px`,
        top: `${dragPosition.top}px`,
        margin: 0,
        zIndex: 9999,
        touchAction: 'none',
        transform: 'rotate(-2deg)'
      }
    : {
        touchAction: 'none',
        transform: 'rotate(-2deg)'
      }

  return (
    <div
      ref={dragRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={dragStyle}
      className={`w-full max-w-[320px] bg-white rounded-2xl border border-slate-200/80 border-t-4 border-t-accent p-5 shadow-xl flex flex-col gap-4 text-left select-none shrink-0 ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      } ${
        !dragPosition
          ? 'absolute bottom-6 left-1/2 -translate-x-1/2 top-auto right-auto lg:top-28 lg:right-16 lg:bottom-auto lg:left-auto lg:translate-x-0 z-30'
          : ''
      }`}
    >
      {/* Status Indicators & Title */}
      <div className="flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
            timeLeft.status === 'running' ? 'bg-green-500 animate-pulse' :
            timeLeft.status === 'paused' ? 'bg-amber-500' : 'bg-slate-400'
          }`} />
          <span className="text-xs font-extrabold text-slate-800 tracking-tight truncate" title={timeLeft.label}>
            {timeLeft.label}
          </span>
        </div>
        <span className="text-[10px] font-black text-slate-700 tracking-wider uppercase shrink-0">IPL 2026</span>
      </div>

      {/* Date Range */}
      <div className="text-[11px] font-bold text-slate-400 leading-normal pointer-events-none w-full">
        {renderHeroDates(timeLeft)}
      </div>

      {/* Countdown Grid (Integer Blocks) */}
      <div className="grid grid-cols-4 gap-2 text-center pointer-events-none">
        <div className="bg-slate-50 rounded-lg p-2 border border-slate-100/80">
          <span className="font-mono text-xl font-black text-slate-900 leading-none">
            {String(timeLeft.days).padStart(2, '0')}
          </span>
          <span className="block text-[8px] font-extrabold text-slate-400 tracking-wider mt-1">DAYS</span>
        </div>
        <div className="bg-slate-50 rounded-lg p-2 border border-slate-100/80">
          <span className="font-mono text-xl font-black text-slate-900 leading-none">
            {String(timeLeft.hours).padStart(2, '0')}
          </span>
          <span className="block text-[8px] font-extrabold text-slate-400 tracking-wider mt-1">HOURS</span>
        </div>
        <div className="bg-slate-50 rounded-lg p-2 border border-slate-100/80">
          <span className="font-mono text-xl font-black text-slate-900 leading-none">
            {String(timeLeft.minutes).padStart(2, '0')}
          </span>
          <span className="block text-[8px] font-extrabold text-slate-400 tracking-wider mt-1">MINS</span>
        </div>
        <div className="bg-slate-50 rounded-lg p-2 border border-slate-100/80">
          <span className="font-mono text-xl font-black text-slate-900 leading-none">
            {String(timeLeft.seconds).padStart(2, '0')}
          </span>
          <span className="block text-[8px] font-extrabold text-slate-400 tracking-wider mt-1">SECS</span>
        </div>
      </div>
    </div>
  )
}

export default function Hero({ onRegisterClick, timeLeft }) {
  const handleRegister = (e) => {
    if (onRegisterClick) {
      e.preventDefault()
      onRegisterClick()
    }
  }

  return (
    <section
      id="hero"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-primary pt-24 pb-12"
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

      <div className="relative mx-auto max-w-4xl px-4 py-16 md:px-6 lg:px-8 lg:py-24 w-full flex flex-col items-center text-center">
        {/* Centered Hero Content Block */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center"
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

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row w-full">
            <a
              href={REGISTRATION_FORM_URL}
              onClick={handleRegister}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-amber-600 hover:shadow-xl shrink-0 cursor-pointer"
            >
              Register Now
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a
              href="#about"
              className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 bg-white/10 px-8 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/50 hover:bg-white/20 shrink-0"
            >
              Explore the Program
            </a>
          </div>
        </motion.div>
      </div>

      {/* Floating Draggable Timer Card */}
      <HeroTimer timeLeft={timeLeft} />
    </section>
  )
}
