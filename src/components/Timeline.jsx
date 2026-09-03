import { useState, useEffect, useMemo, useRef } from 'react'
import { Flag, Trophy, Users, Lightbulb, Cpu, Cog, Presentation, Award, CheckCircle2, Sparkles, TrendingUp, ShieldCheck } from 'lucide-react'
import SectionHeading from './SectionHeading'
import { TIMELINE_EVENTS } from '../data/content'
import { getEventState } from '../utils/eventTimeline'
import { supabase } from '../supabaseClient'
import studentImg from '../assets/timeline-student.png'

/* =========================================================
   MILESTONE CARD ICONS CONFIGURATION
   ========================================================= */
const MILESTONE_ICONS = [
  { icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-100/80 border-emerald-200' },
  { icon: Lightbulb, color: 'text-blue-600', bg: 'bg-blue-100/80 border-blue-200' },
  { icon: Cpu, color: 'text-amber-600', bg: 'bg-amber-100/80 border-amber-200' },
  { icon: Cog, color: 'text-purple-600', bg: 'bg-purple-100/80 border-purple-200' },
  { icon: Presentation, color: 'text-sky-600', bg: 'bg-sky-100/80 border-sky-200' },
  { icon: Award, color: 'text-amber-700', bg: 'bg-amber-100 border-amber-300' },
]

export default function Timeline({ regTimer: propRegTimer, dbPhases: propDbPhases, serverOffset: propServerOffset }) {
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [reducedMotion, setReducedMotion] = useState(false)
  
  // Section DOM ref for intersection observer
  const sectionRef = useRef(null)

  // Local active timer resolution state
  const [regTimer, setRegTimer] = useState(propRegTimer || null)
  const [dbPhases, setDbPhases] = useState(propDbPhases || [])
  const [serverOffset, setServerOffset] = useState(propServerOffset || 0)

  // Animation state: ONE-TIME travel from start to destination, then STOP
  const [walkProgress, setWalkProgress] = useState(1) // 0 to 1 along active segment
  const [isWalking, setIsWalking] = useState(false)
  const animationFrameRef = useRef(null)
  const isVisibleRef = useRef(false)

  // Fetch / Sync active event state from Supabase if not supplied by props
  useEffect(() => {
    if (propRegTimer) setRegTimer(propRegTimer)
    if (propDbPhases) setDbPhases(propDbPhases)
    if (propServerOffset !== undefined) setServerOffset(propServerOffset)
  }, [propRegTimer, propDbPhases, propServerOffset])

  useEffect(() => {
    if (propRegTimer && propDbPhases && propDbPhases.length > 0) return

    const fetchTimerConfig = async () => {
      try {
        const { data: rData } = await supabase.from('registration_timer').select('*').maybeSingle()
        const { data: pData } = await supabase.from('phases').select('*').order('phase_number', { ascending: true })
        if (rData) setRegTimer(rData)
        if (pData) setDbPhases(pData)
      } catch (e) {
        console.warn('Timeline timer fetch error:', e)
      }
    }
    fetchTimerConfig()
  }, [propRegTimer, propDbPhases])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      setReducedMotion(mediaQuery.matches)
      const handler = (e) => setReducedMotion(e.matches)
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    }
  }, [])

  // Resolve current active milestone index (0 = Registration, 1 = Phase 1, 2 = Phase 2, 3 = Phase 2 Refinement, 4 = Phase 3 Pitch, 5 = Phase 3 Expo)
  const activeMilestoneIndex = useMemo(() => {
    const currentServerTime = Date.now() + (serverOffset || 0)
    const state = getEventState(regTimer, dbPhases, currentServerTime)

    if (!state || state.statusKey === 'loading') return 1 // Default to Phase 1 active
    if (state.statusKey === 'registration_open' || state.statusKey === 'registration_paused' || state.statusKey === 'registration_upcoming') {
      return 0
    }
    if (state.statusKey?.includes('phase_1') || state.activePhaseNumber === 1) {
      return 1
    }
    if (state.statusKey?.includes('phase_2') || state.activePhaseNumber === 2) {
      return 2
    }
    if (state.statusKey?.includes('phase_3') || state.activePhaseNumber === 3) {
      return 4
    }
    if (state.statusKey === 'event_completed') {
      return 5
    }
    return 1
  }, [regTimer, dbPhases, serverOffset])

  // Compute status for all 6 milestones
  const milestoneStatuses = useMemo(() => {
    return TIMELINE_EVENTS.map((_, idx) => {
      if (idx < activeMilestoneIndex) return 'completed'
      if (idx === activeMilestoneIndex) return 'in_progress'
      return 'upcoming'
    })
  }, [activeMilestoneIndex])

  /* =========================================================
     ONE-TIME FORWARD WALK ANIMATION ENGINE
     Walks once along the active segment to the active milestone,
     then STOPS and stands still. No looping, no oscillation.
     Replays once upon re-entering the viewport.
     ========================================================= */
  const playOneTimeWalk = (durationMs = 2400) => {
    if (reducedMotion) {
      setWalkProgress(1)
      setIsWalking(false)
      return
    }

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)

    let startTime = null
    setWalkProgress(0)
    setIsWalking(true)

    const step = (now) => {
      if (!startTime) startTime = now
      const elapsed = now - startTime
      const t = Math.min(1, elapsed / durationMs)
      // Ease-out cubic for smooth natural arrival
      const easedT = 1 - Math.pow(1 - t, 3)
      setWalkProgress(easedT)

      if (t < 1) {
        animationFrameRef.current = requestAnimationFrame(step)
      } else {
        setWalkProgress(1)
        setIsWalking(false) // Stays permanently still at destination!
      }
    }

    animationFrameRef.current = requestAnimationFrame(step)
  }

  // IntersectionObserver to trigger one-time animation on viewport entry
  useEffect(() => {
    const el = sectionRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      playOneTimeWalk()
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!isVisibleRef.current) {
            isVisibleRef.current = true
            playOneTimeWalk()
          }
        } else {
          isVisibleRef.current = false
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
        }
      },
      { threshold: 0.15 }
    )

    observer.observe(el)
    return () => {
      observer.disconnect()
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [activeMilestoneIndex, reducedMotion])

  /* =========================================================
     DESKTOP SERPENTINE ROADMAP COORDINATES (1440 x 1060 Canvas)
     Exact zig-zag serpentine flow from Reference Image 2
     ========================================================= */
  const DESKTOP_SEGMENTS = useMemo(() => [
    // Segment 0: START (80, 110) -> Registration Node (480, 330)
    { p0: [80, 110], c1: [100, 180], c2: [260, 310], p3: [480, 330] },
    // Segment 1: Registration Node (480, 330) -> Phase 1 Node (860, 420)
    { p0: [480, 330], c1: [580, 340], c2: [720, 380], p3: [860, 420] },
    // Segment 2: Phase 1 Node (860, 420) -> Phase 2 Node (440, 540) [Deep U-turn across from right to left]
    { p0: [860, 420], c1: [980, 440], c2: [600, 580], p3: [440, 540] },
    // Segment 3: Phase 2 Node (440, 540) -> Design Refinement Node (820, 670) [Deep U-turn across from left to right]
    { p0: [440, 540], c1: [400, 570], c2: [740, 660], p3: [820, 670] },
    // Segment 4: Design Refinement Node (820, 670) -> Phase 3 Pitch Node (480, 840) [Deep U-turn across from right to left]
    { p0: [820, 670], c1: [850, 710], c2: [540, 830], p3: [480, 840] },
    // Segment 5: Phase 3 Pitch Node (480, 840) -> END Expo (1100, 890) [Sweeping bottom road to the right]
    { p0: [480, 840], c1: [540, 870], c2: [800, 890], p3: [1100, 890] },
  ], [])

  // Calculate character (x, y, angle) along the active desktop segment
  const desktopCharacterPos = useMemo(() => {
    const segIdx = Math.min(activeMilestoneIndex, DESKTOP_SEGMENTS.length - 1)
    const seg = DESKTOP_SEGMENTS[segIdx]
    const u = reducedMotion ? 1 : walkProgress
    const inv = 1 - u

    // Cubic Bezier interpolation
    const x =
      inv * inv * inv * seg.p0[0] +
      3 * inv * inv * u * seg.c1[0] +
      3 * inv * u * u * seg.c2[0] +
      u * u * u * seg.p3[0]

    const y =
      inv * inv * inv * seg.p0[1] +
      3 * inv * inv * u * seg.c1[1] +
      3 * inv * u * u * seg.c2[1] +
      u * u * u * seg.p3[1]

    // Tangent derivative for facing angle
    const dx =
      3 * inv * inv * (seg.c1[0] - seg.p0[0]) +
      6 * inv * u * (seg.c2[0] - seg.c1[0]) +
      3 * u * u * (seg.p3[0] - seg.c2[0])

    const dy =
      3 * inv * inv * (seg.c1[1] - seg.p0[1]) +
      6 * inv * u * (seg.c2[1] - seg.c1[1]) +
      3 * u * u * (seg.p3[1] - seg.c2[1])

    let angle = (Math.atan2(dy, dx) * 180) / Math.PI
    const clampedAngle = Math.max(-14, Math.min(14, angle))

    return { x, y, angle: clampedAngle, flip: dx < -5 }
  }, [activeMilestoneIndex, walkProgress, DESKTOP_SEGMENTS, reducedMotion])

  return (
    <section
      ref={sectionRef}
      id="timeline"
      className="bg-slate-50/70 py-12 md:py-16 lg:py-20 overflow-hidden relative selection:bg-amber-100"
    >
      <style>{`
        @keyframes studentWalkCycle {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          25% { transform: translateY(-3px) rotate(2deg); }
          50% { transform: translateY(0px) rotate(0deg); }
          75% { transform: translateY(-3px) rotate(-2deg); }
        }
        @keyframes roadPulseFlow {
          0% { stroke-dashoffset: 60; }
          100% { stroke-dashoffset: 0; }
        }
        .student-walking {
          animation: studentWalkCycle 0.45s ease-in-out infinite;
        }
        .road-pulse-active {
          stroke-dasharray: 12 18;
          animation: roadPulseFlow 1.2s linear infinite;
        }
      `}</style>

      <div className="mx-auto w-[96vw] max-w-[1600px] px-2 sm:px-4 md:px-6 lg:px-8">
        <SectionHeading
          eyebrow="TIMELINE"
          title="Your 4-Week Journey"
          subtitle="Key milestones from registration to the final expo."
        />

        {/* =========================================================
            DESKTOP SERPENTINE ROADMAP (Hidden on < 1024px)
            Matches Reference Image 2 visual layout exactly
            ========================================================= */}
        <div className="hidden lg:block relative w-full max-w-[1440px] h-[1060px] mx-auto select-none mt-6">
          
          {/* Continuous Full SVG Winding Roadmap Path */}
          <svg
            viewBox="0 0 1440 1060"
            className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
          >
            <defs>
              {/* Electric Glow Filter */}
              <filter id="electricGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#38bdf8" floodOpacity="0.8" />
              </filter>
              {/* Road Gradient */}
              <linearGradient id="activeRoadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="60%" stopColor="#0284c7" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>

            {/* 1. Road Outer Shadow (Depth) */}
            <path
              d="M 80 110
                 C 100 180, 260 310, 480 330
                 C 580 340, 720 380, 860 420
                 C 980 440, 920 520, 760 550
                 C 600 580, 480 520, 440 540
                 C 400 570, 480 640, 640 650
                 C 740 660, 800 640, 820 670
                 C 850 710, 780 790, 640 810
                 C 540 830, 500 820, 480 840
                 C 540 870, 800 890, 1100 890"
              fill="none"
              stroke="#0f172a"
              strokeWidth="28"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.12"
              transform="translate(0, 8)"
            />

            {/* 2. Main Dark Navy 3D Ribbon Road Body */}
            <path
              d="M 80 110
                 C 100 180, 260 310, 480 330
                 C 580 340, 720 380, 860 420
                 C 980 440, 920 520, 760 550
                 C 600 580, 480 520, 440 540
                 C 400 570, 480 640, 640 650
                 C 740 660, 800 640, 820 670
                 C 850 710, 780 790, 640 810
                 C 540 830, 500 820, 480 840
                 C 540 870, 800 890, 1100 890"
              fill="none"
              stroke="#1e293b"
              strokeWidth="22"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow-sm"
            />

            {/* 3. Road Outer Trim Borders */}
            <path
              d="M 80 110
                 C 100 180, 260 310, 480 330
                 C 580 340, 720 380, 860 420
                 C 980 440, 920 520, 760 550
                 C 600 580, 480 520, 440 540
                 C 400 570, 480 640, 640 650
                 C 740 660, 800 640, 820 670
                 C 850 710, 780 790, 640 810
                 C 540 830, 500 820, 480 840
                 C 540 870, 800 890, 1100 890"
              fill="none"
              stroke="#334155"
              strokeWidth="22"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.5"
            />

            {/* 4. Center Dashed Lane Marking */}
            <path
              d="M 80 110
                 C 100 180, 260 310, 480 330
                 C 580 340, 720 380, 860 420
                 C 980 440, 920 520, 760 550
                 C 600 580, 480 520, 440 540
                 C 400 570, 480 640, 640 650
                 C 740 660, 800 640, 820 670
                 C 850 710, 780 790, 640 810
                 C 540 830, 500 820, 480 840
                 C 540 870, 800 890, 1100 890"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeDasharray="8 10"
              strokeLinecap="round"
              opacity="0.85"
            />

            {/* 5. Active Glowing Segment Overlay (Registration -> Phase 1) */}
            {DESKTOP_SEGMENTS.map((seg, idx) => {
              const isPast = idx < activeMilestoneIndex
              const isCurrent = idx === activeMilestoneIndex
              if (!isPast && !isCurrent) return null

              return (
                <g key={`active-seg-${idx}`}>
                  {/* Glowing Road Overlay */}
                  <path
                    d={`M ${seg.p0[0]} ${seg.p0[1]} C ${seg.c1[0]} ${seg.c1[1]}, ${seg.c2[0]} ${seg.c2[1]}, ${seg.p3[0]} ${seg.p3[1]}`}
                    fill="none"
                    stroke={isCurrent ? 'url(#activeRoadGrad)' : '#10b981'}
                    strokeWidth={isCurrent ? '22' : '22'}
                    strokeLinecap="round"
                    opacity={isCurrent ? '0.9' : '0.75'}
                  />
                  {/* Center Electric Pulse Flow */}
                  <path
                    d={`M ${seg.p0[0]} ${seg.p0[1]} C ${seg.c1[0]} ${seg.c1[1]}, ${seg.c2[0]} ${seg.c2[1]}, ${seg.p3[0]} ${seg.p3[1]}`}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="3.5"
                    className={isCurrent ? 'road-pulse-active' : ''}
                    strokeDasharray={isCurrent ? '12 18' : 'none'}
                    strokeLinecap="round"
                    opacity="1"
                  />
                </g>
              )
            })}

            {/* Milestone Glowing Concentric Ring Nodes on Road */}
            {[
              { x: 80, y: 110, idx: -1, color: '#10b981' }, // Start Node
              { x: 480, y: 330, idx: 0, color: '#10b981' },  // Registration
              { x: 860, y: 420, idx: 1, color: '#0284c7' },  // Phase 1
              { x: 440, y: 540, idx: 2, color: '#f59e0b' },  // Phase 2
              { x: 820, y: 670, idx: 3, color: '#a855f7' },  // Refinement
              { x: 480, y: 840, idx: 4, color: '#0ea5e9' },  // Phase 3
              { x: 1100, y: 890, idx: 5, color: '#eab308' }, // End Node
            ].map(({ x, y, idx, color }) => {
              const isStart = idx === -1
              const isEnd = idx === 5
              const status = idx >= 0 && idx < 5 ? milestoneStatuses[idx] : isStart ? 'completed' : 'upcoming'
              const isHovered = hoveredIndex === idx
              const isCurrent = idx === activeMilestoneIndex

              return (
                <g key={`node-${idx}`} transform={`translate(${x}, ${y})`}>
                  {/* Outer Pulsing Aura for Active Milestone */}
                  {isCurrent && (
                    <circle
                      r={24}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                      className="animate-ping opacity-75"
                    />
                  )}

                  {/* Outer Halo Ring */}
                  <circle
                    r={isHovered ? 18 : 14}
                    fill={status === 'completed' || isStart ? '#ecfdf5' : isCurrent ? '#f0f9ff' : '#ffffff'}
                    stroke={status === 'completed' || isStart ? '#10b981' : isCurrent ? '#0284c7' : isEnd ? '#eab308' : color}
                    strokeWidth={isCurrent || isHovered ? 4 : 3}
                    className="transition-all duration-300 drop-shadow-md"
                  />
                  {/* Inner Solid Core */}
                  <circle
                    r={isHovered ? 9 : 7}
                    fill={status === 'completed' || isStart ? '#059669' : isCurrent ? '#0284c7' : isEnd ? '#ca8a04' : color}
                  />
                </g>
              )
            })}
          </svg>

          {/* =========================================================
              ANIMATED 3D CARTOON STUDENT (REFERENCE IMAGE 3)
              Travels once on active segment, then STANDS facing active phase
              ========================================================= */}
          <div
            className={`absolute z-20 pointer-events-none transition-transform duration-75 ${isWalking ? 'student-walking' : ''}`}
            style={{
              left: `${desktopCharacterPos.x}px`,
              top: `${desktopCharacterPos.y}px`,
              transform: `translate(-50%, -90%) rotate(${desktopCharacterPos.angle}deg) ${desktopCharacterPos.flip ? 'scaleX(-1)' : ''}`,
            }}
          >
            {/* Soft Contact Shadow under feet */}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-12 h-3.5 bg-slate-950/25 rounded-full blur-[2.5px]" />
            
            {/* 3D Cartoon Student Image (Reference Image 3) */}
            <img
              src={studentImg}
              alt="IPL Student Character"
              className="w-20 h-24 object-contain drop-shadow-lg select-none"
              draggable="false"
            />
          </div>

          {/* =========================================================
              START MARKER (Top-Left, aligned with Start Node 80, 110)
              ========================================================= */}
          <div className="absolute left-[20px] top-[50px] z-10 flex items-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white border-2 border-amber-300 shadow-md">
              <Flag size={20} className="text-amber-500 fill-amber-500" />
            </div>
            <span className="rounded-full bg-slate-900 text-white font-mono font-black text-xs px-3.5 py-1.5 uppercase tracking-widest shadow-md">
              START
            </span>
          </div>

          {/* =========================================================
              MILESTONE CARDS (Positioned Around Serpentine Roadmap with Ample Space)
              ========================================================= */}

          {/* 1. Registration & Team Formation (Upper-Left) */}
          <div
            className="absolute left-[110px] top-[70px] w-[350px] z-10"
            onMouseEnter={() => setHoveredIndex(0)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <MilestoneCard
              event={TIMELINE_EVENTS[0]}
              index={0}
              status={milestoneStatuses[0]}
              isHovered={hoveredIndex === 0}
              iconConfig={MILESTONE_ICONS[0]}
            />
          </div>

          {/* 2. Phase 1: Ideation & Concept Design (Upper-Right) */}
          <div
            className="absolute left-[900px] top-[120px] w-[360px] z-10"
            onMouseEnter={() => setHoveredIndex(1)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <MilestoneCard
              event={TIMELINE_EVENTS[1]}
              index={1}
              status={milestoneStatuses[1]}
              isHovered={hoveredIndex === 1}
              iconConfig={MILESTONE_ICONS[1]}
            />
          </div>

          {/* 3. Phase 2: Prototype Development (Middle-Left) */}
          <div
            className="absolute left-[60px] top-[410px] w-[350px] z-10"
            onMouseEnter={() => setHoveredIndex(2)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <MilestoneCard
              event={TIMELINE_EVENTS[2]}
              index={2}
              status={milestoneStatuses[2]}
              isHovered={hoveredIndex === 2}
              iconConfig={MILESTONE_ICONS[2]}
            />
          </div>

          {/* 4. Design Refinement & Testing (Middle-Right) */}
          <div
            className="absolute left-[860px] top-[490px] w-[360px] z-10"
            onMouseEnter={() => setHoveredIndex(3)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <MilestoneCard
              event={TIMELINE_EVENTS[3]}
              index={3}
              status={milestoneStatuses[3]}
              isHovered={hoveredIndex === 3}
              iconConfig={MILESTONE_ICONS[3]}
            />
          </div>

          {/* 5. Phase 3: Pitch Preparation (Lower-Left) */}
          <div
            className="absolute left-[100px] top-[720px] w-[350px] z-10"
            onMouseEnter={() => setHoveredIndex(4)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <MilestoneCard
              event={TIMELINE_EVENTS[4]}
              index={4}
              status={milestoneStatuses[4]}
              isHovered={hoveredIndex === 4}
              iconConfig={MILESTONE_ICONS[4]}
            />
          </div>

          {/* =========================================================
              END MARKER (Bottom-Right, directly attached to End Node 1100, 890)
              ========================================================= */}
          <div className="absolute left-[1125px] top-[865px] -translate-y-1/2 z-10 flex items-center gap-2.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white border-2 border-amber-400 shadow-xl">
              <Trophy size={22} className="text-amber-500 fill-amber-400" />
            </div>
            <span className="rounded-full bg-slate-900 text-white font-mono font-black text-xs px-4 py-2 uppercase tracking-widest shadow-md">
              END
            </span>
          </div>

        </div>

        {/* =========================================================
            MOBILE RESPONSIVE WINDING JOURNEY (< 1024px)
            ========================================================= */}
        <div className="block lg:hidden relative mx-auto max-w-lg mt-6">
          
          {/* Top START Badge */}
          <div className="flex items-center gap-2.5 mb-8 pl-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white border-2 border-amber-300 shadow-md shrink-0">
              <Flag size={18} className="text-amber-500 fill-amber-500" />
            </div>
            <span className="rounded-full bg-slate-900 text-white font-mono font-black text-xs px-3.5 py-1.5 uppercase tracking-widest shadow-md">
              START
            </span>
          </div>

          {/* Mobile Continuous Ribbon Spine */}
          <div className="absolute top-10 bottom-14 left-5 w-2 pointer-events-none z-0 rounded-full bg-slate-800">
            <div className="w-full h-full border-l-2 border-dashed border-white/60" />
          </div>

          {/* Mobile Milestone Cards Stack */}
          <div className="space-y-8 pl-10 relative">
            {TIMELINE_EVENTS.map((event, idx) => {
              const status = milestoneStatuses[idx]
              const isCurrent = idx === activeMilestoneIndex

              return (
                <div key={`mob-${event.title}`} className="relative">
                  {/* Mobile Milestone Node */}
                  <div className="absolute -left-10 top-5 -translate-x-1/2 flex items-center justify-center">
                    <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shadow-xs transition-colors ${
                      status === 'completed'
                        ? 'bg-emerald-500 border-white text-white'
                        : status === 'in_progress'
                        ? 'bg-blue-600 border-white text-white ring-4 ring-blue-100 animate-pulse'
                        : 'bg-white border-slate-400 text-slate-500'
                    }`}>
                      {status === 'completed' ? (
                        <CheckCircle2 size={12} className="stroke-[3]" />
                      ) : (
                        <span className="font-mono text-[9px] font-black">{idx + 1}</span>
                      )}
                    </div>
                  </div>

                  {/* Character Walking on Active Mobile Segment */}
                  {isCurrent && (
                    <div className="mb-2 flex items-center gap-2.5 bg-amber-50/90 border border-amber-200/80 rounded-xl px-3 py-1.5 w-fit shadow-2xs">
                      <img
                        src={studentImg}
                        alt="Student Character"
                        className="w-6 h-8 object-contain"
                      />
                      <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider">
                        Current Program Progress
                      </span>
                    </div>
                  )}

                  {/* Mobile Card */}
                  <MilestoneCard
                    event={event}
                    index={idx}
                    status={status}
                    isHovered={false}
                    iconConfig={MILESTONE_ICONS[idx]}
                  />
                </div>
              )
            })}
          </div>

          {/* Bottom END Badge */}
          <div className="flex items-center gap-2.5 mt-8 pl-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white border-2 border-amber-400 shadow-lg shrink-0">
              <Trophy size={20} className="text-amber-500 fill-amber-400" />
            </div>
            <span className="rounded-full bg-slate-900 text-white font-mono font-black text-xs px-4 py-2 uppercase tracking-widest shadow-md">
              END
            </span>
          </div>

        </div>

      </div>
    </section>
  )
}

/* =========================================================
   REUSABLE MILESTONE CARD COMPONENT (Preserving all content)
   ========================================================= */
function MilestoneCard({ event, index, status, isHovered, iconConfig }) {
  const Icon = iconConfig?.icon || Users

  return (
    <article
      className={`rounded-2xl border bg-white p-5 shadow-sm transition-all duration-300 text-left ${
        isHovered
          ? 'border-accent shadow-xl -translate-y-1.5 ring-2 ring-accent/25'
          : status === 'in_progress'
          ? 'border-blue-300 shadow-md ring-2 ring-blue-100/80'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
      }`}
    >
      {/* Top Header: Date pill & Milestone Icon */}
      <div className="flex items-center justify-between gap-2 mb-3">
        {/* Milestone Icon */}
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl border shadow-2xs ${iconConfig?.bg || 'bg-slate-100 border-slate-200'}`}>
          <Icon size={16} className={iconConfig?.color || 'text-slate-700'} />
        </div>

        {/* Date Badge */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-bold text-blue-800">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          {event.date}
        </span>
      </div>

      {/* Milestone Title */}
      <h3 className="font-heading text-base sm:text-lg font-extrabold text-slate-900 leading-snug">
        {event.title}
      </h3>

      {/* Milestone Description */}
      <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-700 font-normal">
        {event.description}
      </p>

      {/* Patent / IP Information Box */}
      {event.patentTitle && (
        <div className="mt-4 rounded-xl border border-amber-200/90 bg-amber-50/75 p-3 text-left">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded border border-amber-200">
              {event.patentPhase || 'PHASE'}
            </span>
            <span className="text-base leading-none" aria-hidden="true">
              {event.patentIcon}
            </span>
          </div>

          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-xs sm:text-sm font-extrabold text-slate-900">
              {event.patentTitle}
            </span>
          </div>

          <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-700">
            {event.patentDescription}
          </p>
        </div>
      )}

      {/* Status Badge at Bottom of Card */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
        {status === 'completed' && (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider shadow-2xs">
            <CheckCircle2 size={12} className="stroke-[3]" />
            COMPLETED
          </span>
        )}
        {status === 'in_progress' && (
          <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider shadow-2xs animate-pulse">
            <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" />
            IN PROGRESS
          </span>
        )}
        {status === 'upcoming' && (
          <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
            UPCOMING
          </span>
        )}
      </div>
    </article>
  )
}