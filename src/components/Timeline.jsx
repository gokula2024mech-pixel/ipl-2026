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
     DESKTOP SINGLE CONTINUOUS JOURNEY PATH COORDINATES
     Canvas: 1280 x 1420. Center line: X = 640.
     ONE continuous vertical S-curve journey flowing down the center:
     Start (640, 50) -> Node 0 (590, 160) -> Node 1 (690, 380) ->
     Node 2 (570, 600) -> Node 3 (710, 820) -> Node 4 (560, 1040) ->
     Node 5 (720, 1260) -> End (640, 1370)
     Every segment maintains vertical tangents (dx/dy = 0) at nodes,
     guaranteeing C1 continuity with ZERO kinks and ZERO branches.
     ========================================================= */
  const DESKTOP_SEGMENTS = useMemo(() => [
    // Seg 0: START (640, 50) -> Registration Node 0 (590, 160)
    { p0: [640, 50], c1: [640, 100], c2: [590, 110], p3: [590, 160] },
    // Seg 1: Node 0 (590, 160) -> Ideation Node 1 (690, 380) [gentle wave right]
    { p0: [590, 160], c1: [590, 260], c2: [690, 280], p3: [690, 380] },
    // Seg 2: Node 1 (690, 380) -> Prototype Node 2 (570, 600) [gentle wave left]
    { p0: [690, 380], c1: [690, 480], c2: [570, 500], p3: [570, 600] },
    // Seg 3: Node 2 (570, 600) -> Refinement Node 3 (710, 820) [gentle wave right]
    { p0: [570, 600], c1: [570, 700], c2: [710, 720], p3: [710, 820] },
    // Seg 4: Node 3 (710, 820) -> Pitch Prep Node 4 (560, 1040) [gentle wave left]
    { p0: [710, 820], c1: [710, 920], c2: [560, 940], p3: [560, 1040] },
    // Seg 5: Node 4 (560, 1040) -> Final Expo Node 5 (720, 1260) [gentle wave right]
    { p0: [560, 1040], c1: [560, 1140], c2: [720, 1160], p3: [720, 1260] },
    // Seg 6: Node 5 (720, 1260) -> GRAND FINALE Trophy (640, 1370) [return to center]
    { p0: [720, 1260], c1: [720, 1310], c2: [640, 1320], p3: [640, 1370] },
  ], [])

  // Structured desktop milestone nodes configuration
  // Cards strictly alternate Left and Right positions
  // Distance between card and node is uniformly 100px with ZERO road crossing
  const DESKTOP_NODES = useMemo(() => [
    { idx: 0, x: 590, y: 160, isLeft: true, cardLeft: 140, color: '#10b981', label: '1' },
    { idx: 1, x: 690, y: 380, isLeft: false, cardLeft: 790, color: '#0284c7', label: '2' },
    { idx: 2, x: 570, y: 600, isLeft: true, cardLeft: 120, color: '#f59e0b', label: '3' },
    { idx: 3, x: 710, y: 820, isLeft: false, cardLeft: 810, color: '#a855f7', label: '4' },
    { idx: 4, x: 560, y: 1040, isLeft: true, cardLeft: 110, color: '#0ea5e9', label: '5' },
    { idx: 5, x: 720, y: 1260, isLeft: false, cardLeft: 820, color: '#eab308', label: '6' },
  ], [])

  // Full continuous SVG path data string
  const masterPathD = useMemo(() => {
    return DESKTOP_SEGMENTS.map((seg, i) => {
      const prefix = i === 0 ? `M ${seg.p0[0]} ${seg.p0[1]}` : ''
      return `${prefix} C ${seg.c1[0]} ${seg.c1[1]}, ${seg.c2[0]} ${seg.c2[1]}, ${seg.p3[0]} ${seg.p3[1]}`
    }).join(' ')
  }, [DESKTOP_SEGMENTS])

  // Calculate character (x, y, tilt) along the active desktop segment
  const desktopCharacterPos = useMemo(() => {
    const segIdx = Math.min(Math.max(0, activeMilestoneIndex), DESKTOP_SEGMENTS.length - 1)
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

    let tilt = (Math.atan2(dx, dy) * 180) / Math.PI
    const clampedTilt = Math.max(-8, Math.min(8, tilt))

    return { x, y, tilt: clampedTilt, flip: dx < -2 }
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
        @keyframes journeyShimmer {
          0% { stroke-dashoffset: 36; }
          100% { stroke-dashoffset: 0; }
        }
        .student-walking {
          animation: studentWalkCycle 0.45s ease-in-out infinite;
        }
        .journey-shimmer-active {
          stroke-dasharray: 6 12;
          animation: journeyShimmer 1.2s linear infinite;
        }
      `}</style>

      <div className="mx-auto w-[96vw] max-w-[1440px] px-2 sm:px-4 md:px-6 lg:px-8">
        <SectionHeading
          eyebrow="TIMELINE"
          title="Your 4-Week Journey"
          subtitle="Key milestones from registration to the final expo."
        />

        {/* =========================================================
            DESKTOP EVENT JOURNEY ROADMAP (Hidden on < 1024px)
            Balanced 1280 x 1420 Canvas with ONE Continuous Central S-Curve Journey
            ========================================================= */}
        <div className="hidden lg:block relative w-full max-w-[1280px] h-[1420px] mx-auto select-none mt-6">
          
          {/* Continuous Full SVG Event Journey Path */}
          <svg
            viewBox="0 0 1280 1420"
            className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
          >
            <defs>
              {/* Subtle Ambient Glow for the Path */}
              <filter id="pathAmbientGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

              {/* Master Gradient for Progress Path */}
              <linearGradient id="journeyMasterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="25%" stopColor="#0284c7" />
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="75%" stopColor="#8b5cf6" />
                <stop offset="90%" stopColor="#0ea5e9" />
                <stop offset="100%" stopColor="#eab308" />
              </linearGradient>

              {/* Active Milestone Segment Gradient */}
              <linearGradient id="activeMilestoneGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="50%" stopColor="#0284c7" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
            </defs>

            {/* 1. Soft Ambient Halo along the Continuous Path */}
            <path
              d={masterPathD}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.10"
              filter="url(#pathAmbientGlow)"
            />

            {/* 2. Base Guide Path: ONE continuous line connecting start to finish */}
            <path
              d={masterPathD}
              fill="none"
              stroke="#cbd5e1"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.70"
            />

            {/* 3. Illuminated Completed & Active Segments */}
            {DESKTOP_SEGMENTS.map((seg, idx) => {
              const isPast = idx < activeMilestoneIndex
              const isCurrent = idx === activeMilestoneIndex
              if (!isPast && !isCurrent) return null

              const pathD = `M ${seg.p0[0]} ${seg.p0[1]} C ${seg.c1[0]} ${seg.c1[1]}, ${seg.c2[0]} ${seg.c2[1]}, ${seg.p3[0]} ${seg.p3[1]}`

              return (
                <g key={`prog-seg-${idx}`}>
                  {/* Glowing Progress Stroke */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isCurrent ? 'url(#activeMilestoneGrad)' : '#10b981'}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={isCurrent ? '1' : '0.9'}
                  />

                  {/* Shimmering Core Pulse on Active Segment */}
                  {isCurrent && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="journey-shimmer-active"
                      opacity="0.95"
                    />
                  )}
                </g>
              )
            })}

            {/* 4. Subtle, Minimal Alignment Guide Lines from Nodes to Cards */}
            {DESKTOP_NODES.map((node) => {
              const isPast = node.idx < activeMilestoneIndex
              const isCurrent = node.idx === activeMilestoneIndex
              const isHovered = hoveredIndex === node.idx
              const strokeColor = isHovered
                ? node.color
                : isPast
                ? '#10b981'
                : isCurrent
                ? '#0284c7'
                : '#cbd5e1'
              const nodeEdgeX = node.isLeft ? node.x - 18 : node.x + 18
              const cardEdgeX = node.isLeft ? node.cardLeft + 350 : node.cardLeft

              return (
                <line
                  key={`guide-line-${node.idx}`}
                  x1={nodeEdgeX}
                  y1={node.y}
                  x2={cardEdgeX}
                  y2={node.y}
                  stroke={strokeColor}
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  opacity={isHovered ? '0.9' : isCurrent ? '0.7' : '0.45'}
                  className="transition-colors duration-300"
                />
              )
            })}

            {/* 5. Clean Circular Milestone Nodes Positioned Directly ON the Continuous Path */}
            {[
              { x: 640, y: 50, idx: -1, label: 'START' },
              ...DESKTOP_NODES,
              { x: 640, y: 1370, idx: 6, label: 'END' },
            ].map(({ x, y, idx, label }) => {
              const isStart = idx === -1
              const isEnd = idx === 6
              const status = idx >= 0 && idx < 6 ? milestoneStatuses[idx] : isStart ? 'completed' : 'upcoming'
              const isHovered = hoveredIndex === idx
              const isCurrent = idx === activeMilestoneIndex

              return (
                <g key={`station-${idx}`} transform={`translate(${x}, ${y})`}>
                  {/* Subtle Pulse Aura for Active Milestone */}
                  {isCurrent && (
                    <>
                      <circle
                        r={24}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="1.5"
                        className="animate-ping opacity-50"
                      />
                      <circle
                        r={20}
                        fill="none"
                        stroke="#0284c7"
                        strokeWidth="1.5"
                        opacity="0.25"
                      />
                    </>
                  )}

                  {/* Outer Node Circle */}
                  <circle
                    r={isHovered ? 18 : 15}
                    fill={status === 'completed' || isStart ? '#ecfdf5' : isCurrent ? '#f0f9ff' : '#ffffff'}
                    stroke={status === 'completed' || isStart ? '#10b981' : isCurrent ? '#0284c7' : isEnd ? '#eab308' : '#cbd5e1'}
                    strokeWidth={isCurrent || isHovered ? 3 : 2}
                    className="transition-all duration-300 drop-shadow-xs"
                  />

                  {/* Core Indicator */}
                  {status === 'completed' || isStart ? (
                    <circle r={9} fill="#059669" />
                  ) : isCurrent ? (
                    <circle r={8} fill="#0284c7" />
                  ) : isEnd ? (
                    <circle r={8} fill="#ca8a04" />
                  ) : (
                    <circle r={6} fill="#94a3b8" opacity="0.6" />
                  )}

                  {/* Phase Number or Checkmark */}
                  {status === 'completed' ? (
                    <path
                      d="M -3 0 L -1 3 L 4 -2"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : (
                    !isStart && !isEnd && (
                      <text
                        x="0"
                        y="3"
                        textAnchor="middle"
                        fill={isCurrent ? '#ffffff' : '#64748b'}
                        fontSize="9"
                        fontWeight="800"
                        fontFamily="monospace"
                      >
                        {label}
                      </text>
                    )
                  )}
                </g>
              )
            })}
          </svg>

          {/* =========================================================
              ANIMATED 3D CARTOON STUDENT
              Travels along continuous central journey to active milestone
              ========================================================= */}
          <div
            className={`absolute z-20 pointer-events-none transition-transform duration-75 ${isWalking ? 'student-walking' : ''}`}
            style={{
              left: `${desktopCharacterPos.x}px`,
              top: `${desktopCharacterPos.y}px`,
              transform: `translate(-50%, -90%) rotate(${desktopCharacterPos.tilt}deg) ${desktopCharacterPos.flip ? 'scaleX(-1)' : ''}`,
            }}
          >
            {/* Soft Contact Ground Shadow */}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-10 h-3 bg-slate-950/20 rounded-full blur-[2px]" />
            
            {/* 3D Student Character */}
            <img
              src={studentImg}
              alt="IPL Student Character"
              className="w-16 h-20 object-contain drop-shadow-md select-none"
              draggable="false"
            />
          </div>

          {/* =========================================================
              TOP START BADGE (Centered directly on the journey start)
              ========================================================= */}
          <div className="absolute left-1/2 -translate-x-1/2 top-[10px] z-10 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white border-2 border-emerald-300 shadow-sm">
              <Flag size={16} className="text-emerald-600 fill-emerald-500" />
            </div>
            <span className="rounded-full bg-slate-900 text-white font-mono font-black text-xs px-3 py-1 uppercase tracking-widest shadow-xs">
              START
            </span>
          </div>

          {/* =========================================================
              MILESTONE CARDS (Alternating Left & Right with Zero Road Crossings)
              ========================================================= */}
          {DESKTOP_NODES.map((node) => (
            <div
              key={`desktop-card-${node.idx}`}
              className="absolute w-[350px] z-10 transition-all duration-300"
              style={{
                left: `${node.cardLeft}px`,
                top: `${node.y}px`,
                transform: 'translateY(-50%)'
              }}
              onMouseEnter={() => setHoveredIndex(node.idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <MilestoneCard
                event={TIMELINE_EVENTS[node.idx]}
                index={node.idx}
                status={milestoneStatuses[node.idx]}
                isHovered={hoveredIndex === node.idx}
                iconConfig={MILESTONE_ICONS[node.idx]}
              />
            </div>
          ))}

          {/* =========================================================
              BOTTOM GRAND FINALE END BADGE (Centered on journey finish)
              ========================================================= */}
          <div className="absolute left-1/2 -translate-x-1/2 top-[1395px] z-10 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white border-2 border-amber-400 shadow-md">
              <Trophy size={18} className="text-amber-500 fill-amber-400" />
            </div>
            <span className="rounded-full bg-slate-900 text-white font-mono font-black text-xs px-3.5 py-1.5 uppercase tracking-widest shadow-xs">
              END
            </span>
          </div>

        </div>

        {/* =========================================================
            MOBILE RESPONSIVE CONTINUOUS VERTICAL JOURNEY (< 1024px)
            Clean single-column vertical roadmap with continuous path spine
            ========================================================= */}
        <div className="block lg:hidden relative mx-auto max-w-xl mt-6 px-2 sm:px-4">
          
          {/* Top START Badge */}
          <div className="flex items-center gap-2.5 mb-6 pl-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white border-2 border-emerald-300 shadow-sm shrink-0">
              <Flag size={16} className="text-emerald-600 fill-emerald-500" />
            </div>
            <span className="rounded-full bg-slate-900 text-white font-mono font-black text-xs px-3 py-1 uppercase tracking-widest shadow-xs">
              START
            </span>
          </div>

          {/* Mobile Milestones with Continuous Path Spine */}
          <div className="relative pl-6 sm:pl-8">
            {/* Single Continuous Vertical Guide Spine */}
            <div className="absolute left-[13px] sm:left-[17px] top-3 bottom-6 w-0.5 bg-slate-200" />

            <div className="space-y-6 sm:space-y-8">
              {TIMELINE_EVENTS.map((event, idx) => {
                const status = milestoneStatuses[idx]
                const isCurrent = idx === activeMilestoneIndex

                return (
                  <div key={`mob-${event.title}`} className="relative flex items-start">
                    {/* Node Marker centered on continuous vertical spine */}
                    <div className="absolute -left-[27px] sm:-left-[31px] top-4 -translate-x-1/2 z-10">
                      <div className={`h-7 w-7 rounded-full border-2 flex items-center justify-center shadow-xs transition-colors ${
                        status === 'completed'
                          ? 'bg-emerald-500 border-white text-white'
                          : status === 'in_progress'
                          ? 'bg-blue-600 border-white text-white ring-4 ring-blue-100 animate-pulse'
                          : 'bg-white border-slate-300 text-slate-500'
                      }`}>
                        {status === 'completed' ? (
                          <CheckCircle2 size={13} className="stroke-[3]" />
                        ) : (
                          <span className="font-mono text-[10px] font-black">{idx + 1}</span>
                        )}
                      </div>
                    </div>

                    {/* Milestone Card */}
                    <div className="flex-1 min-w-0 pl-2">
                      {isCurrent && (
                        <div className="mb-2.5 flex items-center gap-2 bg-blue-50/95 border border-blue-200/90 rounded-xl px-3 py-1.5 w-fit shadow-2xs">
                          <img
                            src={studentImg}
                            alt="Student Character"
                            className="w-6 h-8 object-contain shrink-0"
                          />
                          <span className="text-[10px] font-black text-blue-900 uppercase tracking-wider">
                            Current Program Phase
                          </span>
                        </div>
                      )}

                      <MilestoneCard
                        event={event}
                        index={idx}
                        status={status}
                        isHovered={false}
                        iconConfig={MILESTONE_ICONS[idx]}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bottom END Badge */}
          <div className="flex items-center gap-2.5 mt-8 pl-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white border-2 border-amber-400 shadow-md shrink-0">
              <Trophy size={18} className="text-amber-500 fill-amber-400" />
            </div>
            <span className="rounded-full bg-slate-900 text-white font-mono font-black text-xs px-3.5 py-1.5 uppercase tracking-widest shadow-xs">
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