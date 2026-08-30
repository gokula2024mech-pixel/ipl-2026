import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles, X, Timer } from 'lucide-react'
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

function getStatusLabel(status) {
  if (status === 'running' || status === 'paused') return 'ACTIVE'
  if (status === 'upcoming') return 'UPCOMING'
  if (status === 'closed' || status === 'completed') return 'COMPLETED'
  return 'EXPIRED'
}

// Mapped status color
function getStatusColor(status) {
  if (status === 'running' || status === 'paused') return 'text-emerald-400'
  if (status === 'upcoming') return 'text-blue-400'
  return 'text-slate-400'
}

// Embedded Speedometer/Mechanical Timer Component
function HeroTimer({
  timeLeft: propTimeLeft,
  isCollapsed,
  setIsCollapsed,
  position,
  setPosition,
  heroContentRef,
  heroContainerRef
}) {
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
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef(null)
  const startDragPos = useRef({ x: 0, y: 0 })

  const fetchTimerData = async () => {
    try {
      const { data: regData, error: regError } = await supabase
        .from('registration_timer')
        .select('*')
        .maybeSingle()

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

  const getActiveTimerConfig = () => {
    if (!regTimer || dbPhases.length === 0) return null

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

    return null
  }

  useEffect(() => {
    fetchTimerData()

    const regChannel = supabase
      .channel('hero-timer-registration')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_timer' }, () => {
        fetchTimerData()
      })
      .subscribe()

    const phasesChannel = supabase
      .channel('hero-timer-phases')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phases' }, () => {
        fetchTimerData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(regChannel)
      supabase.removeChannel(phasesChannel)
    }
  }, [])

  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbPhases, regTimer])

  // Auto-collapse when scrolling away from Hero section
  useEffect(() => {
    const handleScroll = () => {
      if (typeof window !== 'undefined' && window.scrollY > 10) {
        setIsCollapsed(true)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    if (typeof window !== 'undefined' && window.scrollY > 10) {
      setIsCollapsed(true)
    }
    return () => window.removeEventListener('scroll', handleScroll)
  }, [setIsCollapsed])

  // Calculate safe initial placement based on screensize & overlap checking
  const calculateSafePosition = (timerWidth, timerHeight) => {
    if (!heroContainerRef.current) return { x: 0, y: 96 }

    const containerRect = heroContainerRef.current.getBoundingClientRect()
    const w = containerRect.width
    const h = containerRect.height
    const navbarHeight = 80
    const margin = 12

    // Default top-right position
    const initX = Math.max(margin, w - timerWidth - margin - 16)
    const initY = navbarHeight + 8

    // On mobile, check if this overlaps with the centered hero content
    if (w < 768 && heroContentRef && heroContentRef.current) {
      const heroRect = heroContentRef.current.getBoundingClientRect()

      const relHeroRect = {
        left: heroRect.left - containerRect.left,
        right: heroRect.right - containerRect.left,
        top: heroRect.top - containerRect.top,
        bottom: heroRect.bottom - containerRect.top
      }

      // Predefined candidate positions (relative to container)
      const candidates = [
        { x: w - timerWidth - margin, y: navbarHeight + 8 }, // top-right
        { x: margin, y: h - timerHeight - margin },          // bottom-left
        { x: w - timerWidth - margin, y: h - timerHeight - margin }, // bottom-right
        { x: margin, y: navbarHeight + 8 }                   // top-left
      ]

      const safeCandidates = candidates.filter(c => {
        const timerRect = {
          left: c.x,
          right: c.x + timerWidth,
          top: c.y,
          bottom: c.y + timerHeight
        }
        // Collision check
        const overlap = !(
          timerRect.right < relHeroRect.left ||
          timerRect.left > relHeroRect.right ||
          timerRect.bottom < relHeroRect.top ||
          timerRect.top > relHeroRect.bottom
        )
        return !overlap
      })

      if (safeCandidates.length > 0) {
        return { x: safeCandidates[0].x, y: safeCandidates[0].y }
      }
    }

    return { x: initX, y: initY }
  }

  // Set initial safe position on mount
  useEffect(() => {
    if (!isCollapsed && !position && dragRef.current) {
      const rect = dragRef.current.getBoundingClientRect()
      const safePos = calculateSafePosition(rect.width, rect.height)
      setPosition(safePos)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollapsed, position])

  // Dragging interaction events
  const handlePointerDown = (e) => {
    if (e.target.closest('.close-btn-class')) return

    if (dragRef.current && heroContainerRef.current) {
      dragRef.current.setPointerCapture(e.pointerId)
      setIsDragging(true)

      const cardRect = dragRef.current.getBoundingClientRect()
      startDragPos.current = {
        x: e.clientX - cardRect.left,
        y: e.clientY - cardRect.top
      }
    }
  }

  const handlePointerMove = (e) => {
    if (!isDragging || !dragRef.current || !heroContainerRef.current) return

    const containerRect = heroContainerRef.current.getBoundingClientRect()
    const cardRect = dragRef.current.getBoundingClientRect()

    let newX = (e.clientX - containerRect.left) - startDragPos.current.x
    let newY = (e.clientY - containerRect.top) - startDragPos.current.y

    const margin = 12
    const navbarHeight = 80

    const maxX = containerRect.width - cardRect.width - margin
    const maxY = containerRect.height - cardRect.height - margin

    newX = Math.max(margin, Math.min(newX, maxX))
    newY = Math.max(navbarHeight + 8, Math.min(newY, maxY))

    setPosition({ x: newX, y: newY })
  }

  const handlePointerUp = (e) => {
    if (isDragging) {
      setIsDragging(false)
      if (dragRef.current) {
        dragRef.current.releasePointerCapture(e.pointerId)
      }
    }
  }

  // Handle window resizing and layout changes
  useEffect(() => {
    const handleResize = () => {
      if (position && dragRef.current && heroContainerRef.current) {
        const containerRect = heroContainerRef.current.getBoundingClientRect()
        const cardRect = dragRef.current.getBoundingClientRect()
        const margin = 12
        const navbarHeight = 80

        const maxX = containerRect.width - cardRect.width - margin
        const maxY = containerRect.height - cardRect.height - margin

        const clampedX = Math.max(margin, Math.min(position.x, maxX))
        const clampedY = Math.max(navbarHeight + 8, Math.min(position.y, maxY))

        if (clampedX !== position.x || clampedY !== position.y) {
          setPosition({ x: clampedX, y: clampedY })
        }
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [position, setPosition, heroContainerRef])

  if (!timeLeft) return null

  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={() => setIsCollapsed(false)}
        aria-label="Open timer"
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[100] flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-slate-950/80 hover:bg-slate-900 border border-white/10 text-white shadow-lg hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer animate-pulse"
      >
        <Timer size={20} className="text-accent" />
      </button>
    )
  }

  const totalHours = (timeLeft.days || 0) * 24 + (timeLeft.hours || 0)
  const minutes = timeLeft.minutes || 0
  const seconds = timeLeft.seconds || 0

  const totalHoursStr = String(totalHours).padStart(2, '0')
  const minutesStr = String(minutes).padStart(2, '0')
  const secondsStr = String(seconds).padStart(2, '0')

  const start = new Date(timeLeft.scheduled_start_at).getTime()
  const end = new Date(timeLeft.scheduled_end_at).getTime()
  const total = end - start
  const elapsed = Date.now() - start
  let percent = 0
  if (total > 0) {
    percent = Math.min(100, Math.max(0, (elapsed / total) * 100))
  }
  const needleAngle = -225 + (percent / 100) * 270

  const statusLabel = getStatusLabel(timeLeft.status)
  const statusColor = getStatusColor(timeLeft.status)
  const phaseLabel = String(timeLeft.label || 'REGISTRATION').toUpperCase()

  const startFormatted = formatDateTime(timeLeft.scheduled_start_at)
  const endFormatted = formatDateTime(timeLeft.scheduled_end_at)

  const ariaLabel = `${phaseLabel} phase. ${totalHours} hours, ${minutes} minutes, ${seconds} seconds remaining. Starts ${startFormatted} and ends ${endFormatted}. Status: ${statusLabel}.`

  return (
    <div
      ref={dragRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'absolute',
        left: position ? `${position.x}px` : 'auto',
        top: position ? `${position.y}px` : '96px',
        right: position ? 'auto' : '16px',
        touchAction: 'none',
        zIndex: 99,
        width: 'min(calc(100vw - 24px), 310px)'
      }}
      className={`select-none cursor-grab active:cursor-grabbing max-w-full ${
        isDragging ? 'cursor-grabbing' : ''
      }`}
    >
      <div
        className="relative flex items-center gap-3.5 bg-slate-955/80 backdrop-blur-md rounded-2xl p-3 border border-white/10 text-white w-full shrink-0 font-sans shadow-lg select-none"
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setIsCollapsed(true)
          }}
          aria-label="Close timer"
          className="close-btn-class absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white hover:text-white transition-all focus:outline-none cursor-pointer z-[101]"
        >
          <X size={12} />
        </button>

        {/* Speedometer Dial Gauge */}
        <div className="shrink-0 flex items-center justify-center">
          <svg className="w-16 h-16 sm:w-24 sm:h-24" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
            <circle cx="50" cy="50" r="41" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />

            <path
              d="M 21.7 78.3 A 40 40 0 1 1 78.3 78.3"
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="4"
              strokeLinecap="round"
            />

            <path
              d="M 21.7 78.3 A 40 40 0 1 1 78.3 78.3"
              fill="none"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="3.5"
              strokeDasharray="1.5 5.5"
              strokeLinecap="round"
            />

            <circle cx="50" cy="50" r="6" fill="#1e293b" />

            <line
              x1="50"
              y1="50"
              x2="50"
              y2="15"
              stroke="#f59e0b"
              strokeWidth="2.5"
              strokeLinecap="round"
              transform={`rotate(${needleAngle} 50 50)`}
              className="transition-transform duration-1000 ease-out"
            />

            <circle cx="50" cy="50" r="4.5" fill="#f59e0b" />
            <circle cx="50" cy="50" r="2" fill="#b45309" />
          </svg>
        </div>

        {/* Text Details */}
        <div className="flex-grow min-w-0 flex flex-col justify-between text-left pr-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="text-[9px] sm:text-[10px] font-black tracking-wider text-accent truncate uppercase">
                {phaseLabel}
              </span>
              <span className={`text-[8px] sm:text-[9px] font-black tracking-widest uppercase ${statusColor} shrink-0 px-1.5 py-0.5 bg-white/5 rounded-sm border border-white/5`}>
                {statusLabel}
              </span>
            </div>

            <div className="text-lg sm:text-2xl font-black text-slate-100 tracking-tight font-mono leading-none my-1 select-none">
              {totalHoursStr} : {minutesStr} : {secondsStr}
            </div>
          </div>

          <div className="mt-1 pt-1.5 border-t border-white/5 flex flex-col gap-0.5 text-[8px] sm:text-[9px] leading-tight text-slate-400 font-medium">
            <div className="flex justify-between items-center">
              <span className="text-[7px] sm:text-[8px] text-slate-500 uppercase font-bold tracking-wider mr-2">START</span>
              <span className="font-mono text-slate-300">{startFormatted || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[7px] sm:text-[8px] text-slate-500 uppercase font-bold tracking-wider mr-2">END</span>
              <span className="font-mono text-slate-300">{endFormatted || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Hero({ onRegisterClick, timeLeft }) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [timerPosition, setTimerPosition] = useState(null)
  const heroContentRef = useRef(null)
  const heroContainerRef = useRef(null)

  const handleRegister = (e) => {
    if (onRegisterClick) {
      e.preventDefault()
      onRegisterClick()
    }
  }

  return (
    <section
      ref={heroContainerRef}
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
          ref={heroContentRef}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center w-full"
        >
          {/* Mobile IPL Logo */}
          <img
            src="/logo.png"
            alt="IPL Logo"
            className="h-16 w-auto mb-6 block md:hidden object-contain max-w-full"
          />

          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm text-blue-100 backdrop-blur-sm">
            <Sparkles size={16} className="text-accent" aria-hidden="true" />
            <span>Innovation Program 2026</span>
          </div>

          <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl lg:text-6xl w-full max-w-full break-words px-2">
            <span className="block text-3xl sm:text-4xl md:text-5xl lg:text-6xl">IPL 2026</span>
            <span className="block text-2xl sm:text-3xl md:text-4xl lg:text-5xl text-blue-100 mt-2">Innovative Product League</span>
          </h1>

          <p className="mt-6 text-base sm:text-lg font-medium text-amber-300 md:text-xl px-2 max-w-full break-words leading-relaxed">
            {TAGLINE}
          </p>
          <p className="mt-2 text-sm sm:text-base text-blue-100 md:text-lg px-2 max-w-full break-words leading-relaxed">
            {SUB_TAGLINE}
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3 w-full px-2">
            {STATS.map((stat, i) => (
              <motion.span
                key={stat}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs sm:text-sm font-medium text-white backdrop-blur-sm whitespace-normal text-center"
              >
                {stat}
              </motion.span>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row w-full px-4">
            <a
              href={REGISTRATION_FORM_URL}
              onClick={handleRegister}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-accent px-8 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-amber-600 hover:shadow-xl cursor-pointer"
            >
              Register Now
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a
              href="#about"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border-2 border-white/30 bg-white/10 px-8 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/50 hover:bg-white/20 shrink-0"
            >
              Explore the Program
            </a>
          </div>
        </motion.div>
      </div>

      {/* Floating Draggable Timer Card */}
      <HeroTimer
        timeLeft={timeLeft}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        position={timerPosition}
        setPosition={setTimerPosition}
        heroContentRef={heroContentRef}
        heroContainerRef={heroContainerRef}
      />
    </section>
  )
}
