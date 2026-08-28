import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

// Clean, modern 12-tooth mechanical gear component
const GearSVG = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
    {/* Center Pin */}
    <circle cx="50" cy="50" r="10" />
    <circle cx="50" cy="50" r="3.5" fill="currentColor" />
    {/* Main wheel */}
    <circle cx="50" cy="50" r="35" strokeDasharray="1 3" />
    <circle cx="50" cy="50" r="32" />
    {/* Technical Spokes */}
    {Array.from({ length: 6 }).map((_, i) => {
      const angle = (i * 60 * Math.PI) / 180
      return (
        <line
          key={i}
          x1={50 + 10 * Math.cos(angle)}
          y1={50 + 10 * Math.sin(angle)}
          x2={50 + 32 * Math.cos(angle)}
          y2={50 + 32 * Math.sin(angle)}
          strokeWidth="1.25"
        />
      )
    })}
    {/* Square gear teeth */}
    {Array.from({ length: 12 }).map((_, i) => {
      const angle = (i * 30 * Math.PI) / 180
      const x1 = 50 + 32 * Math.cos(angle)
      const y1 = 50 + 32 * Math.sin(angle)
      const x2 = 50 + 38 * Math.cos(angle)
      const y2 = 50 + 38 * Math.sin(angle)
      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="3.5" />
    })}
  </svg>
)

// Odometer digit drum component
function OdometerDigit({ value, animate = true }) {
  const digit = Number(value) || 0
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mediaQuery.matches)
    const handler = (e) => setReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return (
    <div className="relative h-14 w-9 md:h-20 md:w-12 bg-gradient-to-b from-[#182638] via-[#0b121c] to-[#182638] border border-white/5 rounded text-white font-mono text-3xl md:text-5xl font-extrabold shadow-inner overflow-hidden flex items-center justify-center">
      <div 
        className={`absolute left-0 top-0 w-full ${reducedMotion || !animate ? '' : 'transition-transform duration-800 ease-out'}`}
        style={{ transform: `translateY(-${digit * 10}%)` }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <div key={n} className="h-14 md:h-20 flex items-center justify-center select-none">
            {n}
          </div>
        ))}
      </div>
      {/* 3D cylindrical drum shadow overlay */}
      <div className="absolute inset-x-0 top-0 h-2 md:h-4 bg-gradient-to-b from-black/95 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-2 md:h-4 bg-gradient-to-t from-black/95 to-transparent pointer-events-none" />
      {/* Center divider split */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-white/5 pointer-events-none" />
    </div>
  )
}

// Odometer block grouping two digits inside a technical plate casing
function OdometerBlock({ value, label }) {
  const paddedVal = String(value || 0).padStart(2, '0')
  const d1 = paddedVal[0]
  const d2 = paddedVal[1]

  return (
    <div className="flex flex-col items-center gap-1.5 bg-[#0f1d30]/90 border border-white/10 rounded-xl p-2.5 md:p-3.5 relative shadow-2xl">
      {/* Modern steel corner screws */}
      <div className="absolute top-1 left-1.5 w-1 h-1 rounded-full bg-slate-400 shadow-sm" />
      <div className="absolute top-1 right-1.5 w-1 h-1 rounded-full bg-slate-400 shadow-sm" />
      <div className="absolute bottom-1 left-1.5 w-1 h-1 rounded-full bg-slate-400 shadow-sm" />
      <div className="absolute bottom-1 right-1.5 w-1 h-1 rounded-full bg-slate-400 shadow-sm" />

      <div className="flex gap-1 md:gap-1.5">
        <OdometerDigit value={d1} />
        <OdometerDigit value={d2} />
      </div>
      <span className="text-[9px] md:text-xs font-mono font-bold text-slate-400 tracking-wider uppercase mt-1 md:mt-2">{label}</span>
    </div>
  )
}

export default function EntryCountdown({ onEnter, serverOffset }) {
  const [regTimer, setRegTimer] = useState(null)
  const [dbPhases, setDbPhases] = useState([])
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    label: 'Loading...',
    status: 'loading'
  })
  const [reducedMotion, setReducedMotion] = useState(false)

  // Fetch timer config from Supabase
  const fetchTimer = async () => {
    try {
      const { data: reg, error: regErr } = await supabase
        .from('registration_timer')
        .select('*')
        .maybeSingle()

      const { data: phases, error: phasesErr } = await supabase
        .from('phases')
        .select('*')
        .order('phase_number', { ascending: true })

      if (!regErr && reg) setRegTimer(reg)
      if (!phasesErr && phases) setDbPhases(phases)
    } catch (err) {
      console.error('[Countdown] Failed to fetch config:', err)
    }
  }

  useEffect(() => {
    fetchTimer()

    // Listen to real-time timer changes
    const regSub = supabase
      .channel('public-entry-timer')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_timer' }, () => {
        fetchTimer()
      })
      .subscribe()

    const phasesSub = supabase
      .channel('public-entry-phases')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phases' }, () => {
        fetchTimer()
      })
      .subscribe()

    // Listen to motion query
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(motionQuery.matches)
    const handler = (e) => setReducedMotion(e.matches)
    motionQuery.addEventListener('change', handler)

    return () => {
      supabase.removeChannel(regSub)
      supabase.removeChannel(phasesSub)
      motionQuery.removeEventListener('change', handler)
    }
  }, [])

  // Calculate countdown
  useEffect(() => {
    const getActiveConfig = () => {
      if (!regTimer) return null

      // 1. Check if Registration is running/paused
      if (regTimer.timer_status === 'running' || regTimer.timer_status === 'paused') {
        return {
          label: 'REGISTRATION TIMER',
          status: regTimer.timer_status,
          paused: regTimer.is_timer_paused,
          remaining_seconds: regTimer.remaining_seconds,
          scheduled_start_at: regTimer.scheduled_start_at,
          scheduled_end_at: regTimer.scheduled_end_at
        }
      }

      // 2. Check for active/paused phases
      const activePhase = dbPhases.find((p) => p.timer_status === 'running' || p.timer_status === 'paused')
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

      // 3. Check for upcoming registration
      if (regTimer.timer_status === 'upcoming') {
        return {
          label: 'UPCOMING REGISTRATION',
          status: 'upcoming',
          paused: false,
          remaining_seconds: null,
          scheduled_start_at: regTimer.scheduled_start_at,
          scheduled_end_at: regTimer.scheduled_end_at
        }
      }

      // 4. Default: fallback/closed
      return {
        label: 'REGISTRATION CLOSED',
        status: 'closed',
        paused: false,
        remaining_seconds: 0
      }
    }

    const interval = setInterval(() => {
      const config = getActiveConfig()
      if (!config) return

      let diff = 0
      const currentServerTime = Date.now() + serverOffset

      if (config.status === 'running') {
        const end = new Date(config.scheduled_end_at).getTime()
        diff = end - currentServerTime
        if (config.paused && config.remaining_seconds) {
          diff = Number(config.remaining_seconds) * 1000
        }
        if (diff <= 0) {
          diff = 0
          fetchTimer()
        }
      } else if (config.status === 'upcoming') {
        const start = new Date(config.scheduled_start_at).getTime()
        diff = start - currentServerTime
        if (diff <= 0) {
          diff = 0
          fetchTimer()
        }
      } else if (config.status === 'paused') {
        diff = Number(config.remaining_seconds || 0) * 1000
      }

      const seconds = Math.max(0, Math.floor((diff / 1000) % 60))
      const minutes = Math.max(0, Math.floor((diff / 1000 / 60) % 60))
      const hours = Math.max(0, Math.floor((diff / (1000 * 60 * 60)) % 24))
      const days = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))

      setTimeLeft({
        days,
        hours,
        minutes,
        seconds,
        label: config.label,
        status: config.status,
        paused: config.paused
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [regTimer, dbPhases, serverOffset])

  const handleScrollDown = () => {
    const element = document.getElementById('intro-section')
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // Pre-calculate circular dial markings
  const angles = Array.from({ length: 24 }, (_, i) => i * 15)

  return (
    <div className="relative min-h-screen bg-[#070e17] text-white select-none font-sans overflow-x-hidden">
      
      {/* Inline styles for slow technical animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes spin-reverse-slow {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes needle-swing {
          0% { transform: rotate(-15deg); }
          50% { transform: rotate(15deg); }
          100% { transform: rotate(-15deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 120s linear infinite;
        }
        .animate-spin-reverse-slow {
          animation: spin-reverse-slow 90s linear infinite;
        }
        .animate-needle-swing {
          animation: needle-swing 16s ease-in-out infinite;
        }
      ` }} />

      {/* MODERN TECHNICAL BLUEPRINT GRID BACKGROUND */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-15 z-0" 
        style={{
          backgroundImage: `
            radial-gradient(rgba(255, 255, 255, 0.05) 1.2px, transparent 1.2px),
            linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px, 24px 24px, 24px 24px'
        }}
      />

      {/* FIRST SCREEN CONTAINER */}
      <div className="relative min-h-screen flex flex-col justify-between p-6 md:p-8 z-10 border border-white/5 m-3 md:m-5">
        
        {/* BRANDING HEADER */}
        <div className="text-center mt-3 flex flex-col items-center">
          <img src="/logo.png" alt="IPL Logo" className="h-10 md:h-12 object-contain mb-3" />
          <h1 className="font-heading text-4xl md:text-5xl font-black tracking-widest text-white leading-none uppercase">
            IPL <span className="text-[#F59E0B]">2026</span>
          </h1>
          <p className="text-[10px] md:text-xs font-mono font-bold tracking-[0.3em] text-slate-400 uppercase mt-2">
            Innovative Product League
          </p>
        </div>

        {/* DIAL SCALE GAUGE ASSEMBLY */}
        <div className="relative flex-1 flex flex-col items-center justify-center my-6 max-w-4xl mx-auto w-full">
          
          {/* Subtle Background Gears */}
          <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
            <div className={`absolute bottom-[6%] right-[8%] w-36 h-36 text-white/5 ${reducedMotion ? '' : 'animate-spin-slow'}`}>
              <GearSVG className="w-full h-full" />
            </div>
            <div className={`absolute top-[10%] left-[8%] w-28 h-28 text-white/5 ${reducedMotion ? '' : 'animate-spin-reverse-slow'}`}>
              <GearSVG className="w-full h-full" />
            </div>
            <div className={`absolute top-[6%] left-[26%] w-16 h-16 text-white/5 ${reducedMotion ? '' : 'animate-spin-slow'}`}>
              <GearSVG className="w-full h-full" />
            </div>
          </div>

          {/* CIRCULAR GAUGE DIAL HOUSING */}
          <div className="relative flex items-center justify-center w-full max-w-[480px] aspect-square rounded-full border border-white/5 p-5 bg-[#0f1b2a]/10 shadow-2xl z-10">
            
            {/* SVG Vector Mechanical Details */}
            <svg viewBox="0 0 500 500" className="absolute inset-0 w-full h-full text-white/10 select-none pointer-events-none stroke-white/10">
              {/* Reference Grid lines */}
              <line x1="250" y1="10" x2="250" y2="490" strokeWidth="0.5" strokeDasharray="3 6" opacity="0.3" />
              <line x1="10" y1="250" x2="490" y2="250" strokeWidth="0.5" strokeDasharray="3 6" opacity="0.3" />
              <line x1="50" y1="50" x2="450" y2="450" strokeWidth="0.5" strokeDasharray="2 4" opacity="0.15" />
              <line x1="50" y1="450" x2="450" y2="50" strokeWidth="0.5" strokeDasharray="2 4" opacity="0.15" />

              {/* Concentric housing circles */}
              <circle cx="250" cy="250" r="235" fill="none" strokeWidth="1" opacity="0.5" />
              <circle cx="250" cy="250" r="225" fill="none" strokeWidth="0.75" strokeDasharray="2 5" opacity="0.4" />
              <circle cx="250" cy="250" r="200" fill="none" strokeWidth="1.5" opacity="0.6" />
              <circle cx="250" cy="250" r="160" fill="none" strokeWidth="0.75" opacity="0.3" />

              {/* Roller Bearing Ring */}
              <circle cx="250" cy="250" r="145" fill="none" strokeWidth="8" strokeDasharray="8 8" opacity="0.15" />
              <circle cx="250" cy="250" r="149" fill="none" strokeWidth="0.5" opacity="0.3" />
              <circle cx="250" cy="250" r="141" fill="none" strokeWidth="0.5" opacity="0.3" />

              {/* Dial Scale Tick Marks */}
              {angles.map((angle) => {
                const rad = (angle * Math.PI) / 180
                const x1 = 250 + 200 * Math.cos(rad)
                const y1 = 250 + 200 * Math.sin(rad)
                const x2 = 250 + 215 * Math.cos(rad)
                const y2 = 250 + 215 * Math.sin(rad)
                const isMajor = angle % 90 === 0
                const isMedium = angle % 30 === 0
                return (
                  <line
                    key={angle}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="currentColor"
                    strokeWidth={isMajor ? '2' : isMedium ? '1.25' : '0.75'}
                    opacity={isMajor ? '0.8' : '0.5'}
                  />
                )
              })}

              {/* Angle scale markings */}
              <text x="250" y="45" textAnchor="middle" className="fill-slate-400 font-mono text-[9px] font-bold">0° (NORTH)</text>
              <text x="460" y="254" textAnchor="start" className="fill-slate-400 font-mono text-[9px] font-bold">90°</text>
              <text x="250" y="465" textAnchor="middle" className="fill-slate-400 font-mono text-[9px] font-bold">180°</text>
              <text x="40" y="254" textAnchor="end" className="fill-slate-400 font-mono text-[9px] font-bold">270°</text>

              {/* Technical annotations */}
              <text x="280" y="112" className="fill-slate-400/50 font-mono text-[8px] font-medium">R = 140</text>
              <text x="120" y="288" className="fill-slate-400/50 font-mono text-[8px] font-medium">θ = 45°</text>
              <text x="280" y="288" className="fill-slate-400/50 font-mono text-[8px] font-medium">DRWG: IPL-V1</text>
              <text x="120" y="112" className="fill-slate-400/50 font-mono text-[8px] font-medium">SYS: ONLINE</text>

              {/* Slow Oscillating Indicator Needle */}
              <g className={reducedMotion ? '' : 'animate-needle-swing'} style={{ transformOrigin: '250px 250px' }}>
                <line x1="250" y1="250" x2="250" y2="110" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
                <polygon points="250,96 246,112 254,112" fill="#F59E0B" opacity="0.9" />
              </g>

              {/* Center Axis Pin */}
              <circle cx="250" cy="250" r="6" fill="#070e17" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="250" cy="250" r="2.5" fill="#F59E0B" />
            </svg>

            {/* ODOMETER TIMER REELS GRID */}
            <div className="relative z-10 flex items-center gap-1 md:gap-2">
              <OdometerBlock value={timeLeft.days} label="DAYS" />
              <span className="text-[#F59E0B] font-mono text-xl md:text-3xl font-black -mt-6 select-none animate-pulse">:</span>
              <OdometerBlock value={timeLeft.hours} label="HOURS" />
              <span className="text-[#F59E0B] font-mono text-xl md:text-3xl font-black -mt-6 select-none animate-pulse">:</span>
              <OdometerBlock value={timeLeft.minutes} label="MINUTES" />
              <span className="text-[#F59E0B] font-mono text-xl md:text-3xl font-black -mt-6 select-none animate-pulse">:</span>
              <OdometerBlock value={timeLeft.seconds} label="SECONDS" />
            </div>

          </div>

        </div>

        {/* CONTROLS FOOTER */}
        <div className="flex flex-col items-center gap-4 z-10 select-none">
          
          {/* STATE INDICATOR CHASSIS */}
          {timeLeft.status !== 'loading' && (
            <div className="inline-flex items-center gap-2 border border-white/10 bg-[#0f1b2a]/60 px-4 py-1.5 rounded text-[10px] font-mono font-bold tracking-widest text-slate-300 uppercase mb-1">
              <span className={`w-2 h-2 rounded-full ${
                timeLeft.status === 'paused' ? 'bg-[#F59E0B]' :
                timeLeft.status === 'closed' ? 'bg-red-600' : 'bg-green-500 animate-pulse'
              }`} />
              {timeLeft.status === 'paused' ? '● REGISTRATION PAUSED' :
               timeLeft.status === 'closed' ? '● REGISTRATION CLOSED' : '● REGISTRATION OPEN'}
            </div>
          )}

          {/* BRASS INDUSTRIAL CONTROL BUTTON */}
          <button
            type="button"
            onClick={onEnter}
            className="w-full max-w-sm flex items-center justify-center gap-2 rounded border-2 border-[#F59E0B] bg-[#0b1e36]/80 text-[#F59E0B] hover:bg-[#F59E0B] hover:text-[#0b1e36] px-8 py-3.5 text-xs font-bold font-mono tracking-[0.2em] uppercase cursor-pointer select-none relative shadow-md transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 active:scale-98"
          >
            {/* Rivets on corners */}
            <div className="absolute top-1 left-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 shadow-sm" />
            <div className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 shadow-sm" />
            <div className="absolute bottom-1 left-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 shadow-sm" />
            <div className="absolute bottom-1 right-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 shadow-sm" />
            
            CONTINUE TO IPL 2026 →
          </button>

          {/* SCROLL ANCHOR */}
          <button 
            type="button"
            onClick={handleScrollDown}
            className="flex flex-col items-center gap-1.5 text-[9px] md:text-[10px] font-mono tracking-[0.25em] text-slate-400 hover:text-white transition-colors cursor-pointer mt-4"
          >
            <span>SCROLL TO EXPLORE</span>
            <span className="animate-bounce mt-1 text-[#F59E0B]">↓</span>
          </button>

        </div>

      </div>

      {/* INTRODUCTION SECTION */}
      <div 
        id="intro-section" 
        className="relative min-h-screen flex flex-col justify-center py-20 px-6 md:px-12 max-w-5xl mx-auto border-t border-white/5 z-10"
      >
        <div className="text-left w-full mt-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-[#0f1b2a]/65 border border-white/10 text-slate-200 text-[10px] font-mono font-bold tracking-widest uppercase mb-4">
            ⚙ OVERVIEW
          </div>
          <h2 className="font-heading text-3xl md:text-4xl font-extrabold text-white tracking-wider uppercase">
            Innovative Product League
          </h2>
          {/* Engineering blueprint double line */}
          <div className="my-6 flex items-center gap-1">
            <div className="h-[2px] bg-[#F59E0B] w-8" />
            <div className="h-[1px] bg-white/10 flex-1" />
          </div>
          <p className="text-sm md:text-base text-slate-300 font-medium max-w-2xl leading-relaxed">
            The Innovative Product League is a technical design and prototyping competition. 
            Students transform engineering insights and real-world challenges into functional hardware 
            and software products.
          </p>
        </div>

        {/* 4 DRAFTING CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12 w-full">
          {[
            { num: '01', title: 'IDEATION', desc: 'Turning real-world problems into innovative concepts.' },
            { num: '02', title: 'PROTOTYPE', desc: 'Designing and developing working solutions.' },
            { num: '03', title: 'PRODUCT', desc: 'Building practical engineering products.' },
            { num: '04', title: 'SHOWCASE', desc: 'Presenting innovation and impact.' }
          ].map((card) => (
            <div 
              key={card.num} 
              className="bg-[#0f1e36]/90 border border-white/10 rounded-xl p-6 flex flex-col justify-between relative overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200"
            >
              {/* Corner Screws */}
              <div className="absolute top-1.5 left-1.5 w-1 h-1 rounded-full bg-slate-500/50" />
              <div className="absolute top-1.5 right-1.5 w-1 h-1 rounded-full bg-slate-500/50" />
              <div className="absolute bottom-1.5 left-1.5 w-1 h-1 rounded-full bg-slate-500/50" />
              <div className="absolute bottom-1.5 right-1.5 w-1 h-1 rounded-full bg-slate-500/50" />
              
              <div>
                <span className="block font-mono text-3xl font-black text-[#F59E0B] mb-4">
                  {card.num}
                </span>
                <h3 className="font-heading text-sm font-bold text-white uppercase tracking-wider mb-2">
                  {card.title}
                </h3>
                <p className="text-xs text-slate-300 font-medium leading-relaxed">
                  {card.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

      </div>

    </div>
  )
}
