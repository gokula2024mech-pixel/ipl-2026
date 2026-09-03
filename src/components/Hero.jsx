import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles, X, Timer } from 'lucide-react'
import { TAGLINE, SUB_TAGLINE, REGISTRATION_FORM_URL } from '../data/content'
import { supabase } from '../supabaseClient'
import { getEventState, formatTimelineDate } from '../utils/eventTimeline'

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
  if (!status) return 'ACTIVE'
  const s = String(status).toLowerCase()
  if (s.includes('paused')) return 'PAUSED'
  if (s.includes('active') || s.includes('open') || s === 'running') return 'ACTIVE'
  if (s.includes('upcoming')) return 'UPCOMING'
  if (s.includes('closed') || s.includes('completed') || s.includes('ended')) return 'COMPLETED'
  if (s.includes('expired')) return 'EXPIRED'
  return 'ACTIVE'
}

// Mapped status color
function getStatusColor(status) {
  if (!status) return 'text-emerald-400'
  const s = String(status).toLowerCase()
  if (s.includes('paused')) return 'text-amber-400'
  if (s.includes('active') || s.includes('open') || s === 'running') return 'text-emerald-400'
  if (s.includes('upcoming')) return 'text-blue-400'
  return 'text-slate-400'
}

// Embedded Speedometer/Mechanical Timer Component
// Mathematical gear path generator
function getGearPath(cx, cy, rOut, rIn, teethCount, holeRadius) {
  const points = []
  const angleStep = (Math.PI * 2) / teethCount
  for (let i = 0; i < teethCount; i++) {
    const angle = i * angleStep
    const a1 = angle
    const a2 = angle + angleStep * 0.25
    const a3 = angle + angleStep * 0.5
    const a4 = angle + angleStep * 0.75
    points.push(`${(cx + rIn * Math.cos(a1)).toFixed(2)},${(cy + rIn * Math.sin(a1)).toFixed(2)}`)
    points.push(`${(cx + rOut * Math.cos(a2)).toFixed(2)},${(cy + rOut * Math.sin(a2)).toFixed(2)}`)
    points.push(`${(cx + rOut * Math.cos(a3)).toFixed(2)},${(cy + rOut * Math.sin(a3)).toFixed(2)}`)
    points.push(`${(cx + rIn * Math.cos(a4)).toFixed(2)},${(cy + rIn * Math.sin(a4)).toFixed(2)}`)
  }
  const gearOutline = `M ${points.join(' L ')} Z`
  const centerHole = `M ${cx} ${cy} m -${holeRadius} 0 a ${holeRadius} ${holeRadius} 0 1 0 ${holeRadius * 2} 0 a ${holeRadius} ${holeRadius} 0 1 0 -${holeRadius * 2} 0`
  return `${gearOutline} ${centerHole}`
}

// 3-Gear Mechanical System Component
function TimerGears({ className = 'text-accent/15', opacity = '0.08' }) {
  return (
    <svg
      viewBox="0 0 300 120"
      className={`absolute inset-0 w-full h-full pointer-events-none select-none overflow-hidden ${className}`}
      style={{ opacity }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes timer-gear-cw {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes timer-gear-ccw {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        .t-gear-g1 { animation: timer-gear-cw 16s linear infinite; }
        .t-gear-g2 { animation: timer-gear-ccw 10.66s linear infinite; }
        .t-gear-g3 { animation: timer-gear-cw 10.66s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .t-gear-g1, .t-gear-g2, .t-gear-g3 { animation: none !important; }
        }
      `}} />
      <g className="t-gear-g1" style={{ transformOrigin: '150px 60px' }}>
        <path d={getGearPath(150, 60, 50, 42, 18, 12)} fill="currentColor" fillRule="evenodd" />
      </g>
      <g className="t-gear-g2" style={{ transformOrigin: '66px 60px' }}>
        <path d={getGearPath(66, 60, 35, 28, 12, 8)} fill="currentColor" fillRule="evenodd" transform="rotate(10, 66, 60)" />
      </g>
      <g className="t-gear-g3" style={{ transformOrigin: '234px 60px' }}>
        <path d={getGearPath(234, 60, 35, 28, 12, 8)} fill="currentColor" fillRule="evenodd" transform="rotate(10, 234, 60)" />
      </g>
    </svg>
  )
}

// Embedded Speedometer/Mechanical Timer Component
function HeroTimer({
  timeLeft: propTimeLeft,
  showTimer = true,
  isOpen = true,
  onClose,
  onOpen,
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

  const [mobilePopupOpen, setMobilePopupOpen] = useState(false)

  // Reset mobile popup if navigating away from Home
  useEffect(() => {
    if (!showTimer) {
      setMobilePopupOpen(false)
    }
  }, [showTimer])

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
      const config = getEventState(regTimer, dbPhases, Date.now())
      if (!config) return

      let diff = 0
      let needsRefresh = false

      if (config.isPaused) {
        if (config.remainingSeconds) {
          diff = Number(config.remainingSeconds) * 1000
        } else if (config.targetTimeMs) {
          diff = Math.max(0, config.targetTimeMs - Date.now())
        }
      } else if (config.targetTimeMs) {
        diff = config.targetTimeMs - Date.now()
        if (diff <= 0) {
          diff = 0
          needsRefresh = true
        }
      }

      const seconds = Math.max(0, Math.floor((diff / 1000) % 60))
      const minutes = Math.max(0, Math.floor((diff / 1000 / 60) % 60))
      const hours = Math.max(0, Math.floor((diff / (1000 * 60 * 60)) % 24))
      const days = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))

      setLocalTimeLeft({
        days,
        hours,
        minutes,
        seconds,
        label: config.countdownLabel,
        phaseName: config.phaseName,
        statusBadge: config.statusBadge,
        statusDotColor: config.statusDotColor,
        timelineTitle: config.timelineTitle,
        status: config.statusKey,
        isRegistrationOpen: config.isRegistrationOpen,
        scheduled_start_at: config.scheduledStartAt,
        scheduled_end_at: config.scheduledEndAt
      })

      if (needsRefresh) {
        fetchTimerData()
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [dbPhases, regTimer])

  // Calculate safe initial placement based on screensize & overlap checking
  const calculateSafePosition = (timerWidth, timerHeight) => {
    if (!heroContainerRef.current) return { x: 0, y: 96 }

    const containerRect = heroContainerRef.current.getBoundingClientRect()
    const w = containerRect.width
    const h = containerRect.height
    const navbarHeight = 80
    const margin = 12

    // Default position: lower-left quadrant
    // left: approximately 4% of Hero width, top: approximately 58% of Hero height
    const initX = Math.max(margin, w * 0.04)
    const initY = Math.max(navbarHeight + 8, h * 0.58)

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
    if (isOpen && !position && dragRef.current) {
      const rect = dragRef.current.getBoundingClientRect()
      const safePos = calculateSafePosition(rect.width, rect.height)
      setPosition(safePos)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, position])

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

  const days = timeLeft.days || 0
  const hours = timeLeft.hours || 0
  const minutes = timeLeft.minutes || 0
  const seconds = timeLeft.seconds || 0

  const daysStr = String(days).padStart(2, '0')
  const hoursStr = String(hours).padStart(2, '0')
  const minutesStr = String(minutes).padStart(2, '0')
  const secondsStr = String(seconds).padStart(2, '0')

  const statusLabel = getStatusLabel(timeLeft.status)
  const statusColor = getStatusColor(timeLeft.status)
  const phaseLabel = String(timeLeft.timelineTitle || timeLeft.phaseName || (timeLeft.phaseNumber ? `PHASE ${timeLeft.phaseNumber}` : timeLeft.label) || 'REGISTRATION').toUpperCase()

  const startFormatted = formatDateTime(timeLeft.scheduled_start_at)
  const endFormatted = formatDateTime(timeLeft.scheduled_end_at)

  const ariaLabel = `${phaseLabel} phase. ${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds remaining. Starts ${startFormatted} and ends ${endFormatted}. Status: ${statusLabel}.`

  if (!showTimer) {
    return null
  }

  return (
    <>
      {/* DESKTOP TIMER VIEW (md: and above >= 768px) */}
      {isOpen ? (
        <div
          ref={dragRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            position: 'absolute',
            left: position ? `${position.x}px` : '4%',
            top: position ? `${position.y}px` : '58%',
            right: 'auto',
            touchAction: 'none',
            zIndex: 30,
            width: 'min(calc(100vw - 24px), 390px)'
          }}
          className={`hidden md:block select-none cursor-grab active:cursor-grabbing max-w-full md:-rotate-3 md:transform ${
            isDragging ? 'cursor-grabbing' : ''
          }`}
        >
          <div
            className="relative flex flex-col bg-slate-900/95 backdrop-blur-md rounded-3xl p-6 border border-white/10 text-white w-full shrink-0 font-sans shadow-lg select-none"
            aria-label={ariaLabel}
            title={ariaLabel}
            style={{
              boxShadow: '0 0 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onClose?.()
              }}
              aria-label="Close timer"
              title="Minimize timer"
              className="close-btn-class absolute top-4 right-4 flex h-6 w-6 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white hover:text-white transition-all focus:outline-none cursor-pointer z-[101]"
            >
              <X size={12} />
            </button>

            {/* Header: Status & Phase name */}
            <div className="flex items-center justify-between gap-3 mb-4 pr-8 w-full min-w-0">
              <span className="text-[10px] sm:text-xs font-black tracking-wider text-accent uppercase min-w-0 shrink">
                {phaseLabel}
              </span>
              <span className={`text-[8px] sm:text-[10px] font-black tracking-widest uppercase ${statusColor} shrink-0 px-2 py-0.5 bg-white/5 rounded border border-white/5`}>
                {statusLabel}
              </span>
            </div>

            {/* Main Countdown Display */}
            <div className="relative flex flex-col items-center justify-center my-3 py-4 px-3 w-full bg-slate-955/65 border border-white/5 rounded-2xl overflow-hidden shadow-inner">
              <TimerGears className="text-amber-500/10" opacity="0.12" />

              {/* Digit Row */}
              <div className="relative grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center justify-items-center w-full max-w-[280px] font-mono leading-none select-none text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.3)]">
                <span className="text-2xl sm:text-3xl font-black">{daysStr}</span>
                <span className="text-amber-500/60 text-lg sm:text-xl font-bold px-1 animate-pulse">:</span>
                <span className="text-2xl sm:text-3xl font-black">{hoursStr}</span>
                <span className="text-amber-500/60 text-lg sm:text-xl font-bold px-1 animate-pulse">:</span>
                <span className="text-2xl sm:text-3xl font-black">{minutesStr}</span>
                <span className="text-amber-500/60 text-lg sm:text-xl font-bold px-1 animate-pulse">:</span>
                <span className="text-2xl sm:text-3xl font-black">{secondsStr}</span>
              </div>

              {/* Label Row */}
              <div className="relative grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] justify-items-center w-full max-w-[280px] text-[8px] text-slate-400 font-black tracking-widest uppercase mt-2">
                <span>DAY</span>
                <span className="opacity-0 px-1">:</span>
                <span>HR</span>
                <span className="opacity-0 px-1">:</span>
                <span>MIN</span>
                <span className="opacity-0 px-1">:</span>
                <span>SEC</span>
              </div>
            </div>

            {/* Footer Details */}
            <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-col gap-2 text-[10px] text-slate-350 font-semibold w-full">
              <div className="grid grid-cols-[55px_1fr] items-center">
                <span className="text-slate-500 uppercase font-black tracking-wider">START</span>
                <span className="font-mono text-slate-200 text-right">{startFormatted || 'N/A'}</span>
              </div>
              <div className="grid grid-cols-[55px_1fr] items-center">
                <span className="text-slate-500 uppercase font-black tracking-wider">END</span>
                <span className="font-mono text-slate-200 text-right">{endFormatted || 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Desktop Reopen Button (when minimized on desktop) */
        <button
          type="button"
          onClick={onOpen}
          aria-label="Reopen countdown timer"
          title="View IPL 2026 Timer"
          className="hidden md:flex fixed bottom-6 right-6 lg:bottom-8 lg:right-8 z-40 h-11 w-11 items-center justify-center rounded-full bg-slate-900 border-2 border-accent text-accent shadow-lg shadow-amber-500/20 hover:scale-105 hover:bg-slate-800 transition-all cursor-pointer focus:outline-none"
        >
          <Timer size={20} className="text-accent animate-pulse" />
        </button>
      )}

      {/* MOBILE TIMER VIEW (< 768px) */}
      {/* Mobile Floating Compact Timer Button */}
      <button
        type="button"
        onClick={() => setMobilePopupOpen(true)}
        aria-label="Open IPL 2026 countdown timer"
        title="View IPL 2026 Timer"
        className="md:hidden fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 border-2 border-accent text-accent shadow-lg shadow-amber-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer focus:outline-none"
      >
        <Timer size={20} className="text-accent animate-pulse" />
      </button>

      {/* Mobile Modal Popup with Outside Click Detection */}
      {mobilePopupOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setMobilePopupOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="IPL 2026 Timer Details"
        >
          <div
            className="relative w-full max-w-[360px] flex flex-col bg-slate-900/95 backdrop-blur-md rounded-3xl p-5 border border-white/10 text-white font-sans shadow-2xl select-none"
            onClick={(e) => e.stopPropagation()}
            style={{
              boxShadow: '0 0 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setMobilePopupOpen(false)}
              aria-label="Close timer popup"
              title="Close timer"
              className="close-btn-class absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all focus:outline-none cursor-pointer z-10"
            >
              <X size={14} />
            </button>

            {/* Header: Status & Phase name */}
            <div className="flex items-center justify-between gap-3 mb-3 pr-8 w-full min-w-0">
              <span className="text-[11px] font-black tracking-wider text-accent uppercase min-w-0 shrink">
                {phaseLabel}
              </span>
              <span className={`text-[9px] font-black tracking-widest uppercase ${statusColor} shrink-0 px-2 py-0.5 bg-white/5 rounded border border-white/5`}>
                {statusLabel}
              </span>
            </div>

            {/* Main Countdown Display */}
            <div className="relative flex flex-col items-center justify-center my-2 py-4 px-3 w-full bg-slate-955/65 border border-white/5 rounded-2xl overflow-hidden shadow-inner">
              <TimerGears className="text-amber-500/10" opacity="0.12" />

              {/* Digit Row */}
              <div className="relative grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center justify-items-center w-full max-w-[280px] font-mono leading-none select-none text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.3)]">
                <span className="text-2xl sm:text-3xl font-black">{daysStr}</span>
                <span className="text-amber-500/60 text-lg sm:text-xl font-bold px-1 animate-pulse">:</span>
                <span className="text-2xl sm:text-3xl font-black">{hoursStr}</span>
                <span className="text-amber-500/60 text-lg sm:text-xl font-bold px-1 animate-pulse">:</span>
                <span className="text-2xl sm:text-3xl font-black">{minutesStr}</span>
                <span className="text-amber-500/60 text-lg sm:text-xl font-bold px-1 animate-pulse">:</span>
                <span className="text-2xl sm:text-3xl font-black">{secondsStr}</span>
              </div>

              {/* Label Row */}
              <div className="relative grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] justify-items-center w-full max-w-[280px] text-[8px] text-slate-400 font-black tracking-widest uppercase mt-2">
                <span>DAY</span>
                <span className="opacity-0 px-1">:</span>
                <span>HR</span>
                <span className="opacity-0 px-1">:</span>
                <span>MIN</span>
                <span className="opacity-0 px-1">:</span>
                <span>SEC</span>
              </div>
            </div>

            {/* Footer Details */}
            <div className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-1.5 text-[10px] text-slate-350 font-semibold w-full">
              <div className="grid grid-cols-[55px_1fr] items-center">
                <span className="text-slate-500 uppercase font-black tracking-wider">START</span>
                <span className="font-mono text-slate-200 text-right">{startFormatted || 'N/A'}</span>
              </div>
              <div className="grid grid-cols-[55px_1fr] items-center">
                <span className="text-slate-500 uppercase font-black tracking-wider">END</span>
                <span className="font-mono text-slate-200 text-right">{endFormatted || 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function Hero({
  onRegisterClick,
  timeLeft,
  profile: _profile,
  onMySubmissionsClick,
  showTimer = true,
  timerPanelOpen = true,
  onTimerPanelToggle
}) {
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
      {/* Background Video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover object-center pointer-events-none z-0"
      >
        <source src="/assets/hero-background.mp4" type="video/mp4" />
      </video>

      {/* Dark Blue Overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[#102d78]/35 z-1" />

      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{ zIndex: 2 }}
      >
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-amber-500/15 blur-3xl" />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 opacity-10"
        >
          <svg viewBox="0 0 600 600" fill="none" className="h-full w-full">
            <circle
              cx="300"
              cy="300"
              r="280"
              stroke="white"
              strokeWidth="0.5"
              strokeDasharray="8 12"
            />
            <circle
              cx="300"
              cy="300"
              r="200"
              stroke="white"
              strokeWidth="0.5"
              strokeDasharray="4 8"
            />
            <circle
              cx="300"
              cy="300"
              r="120"
              stroke="white"
              strokeWidth="0.5"
            />
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

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-16 md:px-6 lg:px-8 lg:py-24 w-full flex flex-col items-center text-center">
        {/* Centered Hero Content Block */}
        <motion.div
          ref={heroContentRef}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center w-full"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm text-blue-100 backdrop-blur-sm">
            <Sparkles size={16} className="text-accent" aria-hidden="true" />
            <span>Innovation Program 2026</span>
          </div>

          <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl lg:text-6xl w-full max-w-full break-words px-2">
            <span className="block text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
              IPL 2026
            </span>
            <span className="block text-2xl sm:text-3xl md:text-4xl lg:text-5xl text-blue-100 mt-2">
              Innovative Product League
            </span>
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

          {/* CTA Buttons - Register Now is ALWAYS visible */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row w-full px-4">
            <a
              href={REGISTRATION_FORM_URL}
              onClick={handleRegister}
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-full bg-accent px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-amber-500/20 transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:bg-amber-600 hover:shadow-xl hover:shadow-amber-500/35 active:scale-[0.97] active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-primary animate-cta-glow cursor-pointer"
            >
              <span>Register Now</span>
              <ArrowRight
                size={18}
                aria-hidden="true"
                className="transition-transform duration-300 ease-out group-hover:translate-x-1.5"
              />
            </a>

            <button
              type="button"
              onClick={onMySubmissionsClick}
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-full bg-accent px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-amber-500/20 transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:bg-amber-600 hover:shadow-xl hover:shadow-amber-500/35 active:scale-[0.97] active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-primary animate-cta-glow cursor-pointer"
            >
              <span>My Submissions</span>
              <ArrowRight
                size={18}
                aria-hidden="true"
                className="transition-transform duration-300 ease-out group-hover:translate-x-1.5"
              />
            </button>
          </div>
        </motion.div>
      </div>

      {/* Floating Draggable Timer Card */}
      <HeroTimer
        timeLeft={timeLeft}
        showTimer={showTimer}
        isOpen={timerPanelOpen}
        onClose={() => onTimerPanelToggle?.(false)}
        onOpen={() => onTimerPanelToggle?.(true)}
        position={timerPosition}
        setPosition={setTimerPosition}
        heroContentRef={heroContentRef}
        heroContainerRef={heroContainerRef}
      />
    </section>
  );
}
