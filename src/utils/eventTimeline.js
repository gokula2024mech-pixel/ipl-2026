/**
 * Unified Event Timeline and Active Timer Resolution Engine for IPL 2026.
 * 
 * THE CURRENT ADMIN-CONTROLLED ACTIVE TIMER IS THE ABSOLUTE SOURCE OF TRUTH.
 * Calendar dates must NEVER override the administrator's active or paused timer state.
 * 
 * Resolution Priority:
 * 1. Running Timers (Registration, Phase 1, Phase 2, Phase 3)
 *    - If any timer is explicitly running, it is the ACTIVE public state.
 *    - If multiple are running, the one with the latest last_started_at / activation takes precedence.
 * 2. Paused Timers (when no timer is running)
 *    - If any timer is explicitly paused, it is the ACTIVE public state (paused).
 *    - If multiple are paused, the one with the latest paused_at / last_started_at takes precedence.
 * 3. Automated / Upcoming Schedule (when no timer is running or paused)
 *    - Upcoming registration / Upcoming phase / Completed event.
 */

export const formatTimelineDate = (dateStr) => {
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

export function getEventState(regTimer, dbPhases = [], serverTimeMs = Date.now()) {
  if (!regTimer && (!dbPhases || dbPhases.length === 0)) {
    return {
      statusKey: 'loading',
      statusBadge: 'LOADING...',
      statusDotColor: 'bg-slate-400',
      countdownLabel: 'COUNTDOWN',
      timelineTitle: 'TIMELINE',
      targetTimeMs: null,
      scheduledStartAt: null,
      scheduledEndAt: null,
      isPaused: false,
      remainingSeconds: null,
      isRegistrationOpen: false,
      activePhaseNumber: null,
      phaseName: 'Loading...'
    }
  }

  const now = serverTimeMs
  const getTime = (dateStr) => (dateStr ? new Date(dateStr).getTime() : null)

  // 1. Build normalized candidates
  const candidates = []

  // Candidate Registration
  if (regTimer) {
    const regStart = getTime(regTimer.scheduled_start_at)
    const regEnd = getTime(regTimer.scheduled_end_at)
    const lastStarted = getTime(regTimer.last_started_at) || getTime(regTimer.created_at) || 0
    const pausedAt = getTime(regTimer.paused_at) || lastStarted || 0

    const isExplicitRunning = (regTimer.timer_status === 'running' || regTimer.is_timer_running === true) && (!regEnd || now < regEnd)
    const isExplicitPaused = regTimer.timer_status === 'paused' || (regTimer.is_timer_paused === true && regTimer.timer_status !== 'closed' && regTimer.timer_status !== 'completed')

    candidates.push({
      type: 'REGISTRATION',
      id: regTimer.id,
      phaseNumber: null,
      name: 'Registration',
      timerStatus: regTimer.timer_status,
      isRunning: isExplicitRunning,
      isPaused: isExplicitPaused,
      remainingSeconds: regTimer.remaining_seconds,
      scheduledStartAt: regTimer.scheduled_start_at,
      scheduledEndAt: regTimer.scheduled_end_at,
      startMs: regStart,
      endMs: regEnd,
      lastStartedMs: lastStarted,
      pausedAtMs: pausedAt,
      isRegistrationOpen: isExplicitRunning || isExplicitPaused,
      rawObj: regTimer
    })
  }

  // Candidate Phases (1, 2, 3)
  const sortedPhases = [...(dbPhases || [])].sort((a, b) => (a.phase_number || 0) - (b.phase_number || 0))
  for (const phase of sortedPhases) {
    const pStart = getTime(phase.scheduled_start_at)
    const pEnd = getTime(phase.scheduled_end_at)
    const lastStarted = getTime(phase.last_started_at) || getTime(phase.created_at) || 0
    const pausedAt = getTime(phase.paused_at) || lastStarted || 0

    const isExplicitRunning = (phase.timer_status === 'running' || phase.is_timer_running === true) && (!pEnd || now < pEnd)
    const isExplicitPaused = phase.timer_status === 'paused' || (phase.is_timer_paused === true && phase.timer_status !== 'closed' && phase.timer_status !== 'completed')

    candidates.push({
      type: `PHASE_${phase.phase_number || 1}`,
      id: phase.id,
      phaseNumber: phase.phase_number || 1,
      name: phase.name || `Phase ${phase.phase_number || 1}`,
      timerStatus: phase.timer_status,
      isRunning: isExplicitRunning,
      isPaused: isExplicitPaused,
      remainingSeconds: phase.remaining_seconds,
      scheduledStartAt: phase.scheduled_start_at,
      scheduledEndAt: phase.scheduled_end_at,
      startMs: pStart,
      endMs: pEnd,
      lastStartedMs: lastStarted,
      pausedAtMs: pausedAt,
      isRegistrationOpen: false,
      rawObj: phase
    })
  }

  // =========================================================================
  // PRIORITY 1: Check for Running Timers (Admin explicitly started/running)
  // =========================================================================
  const runningCandidates = candidates.filter(c => c.isRunning)
  if (runningCandidates.length > 0) {
    // Sort by lastStartedMs descending (the most recently started/resumed takes precedence)
    runningCandidates.sort((a, b) => b.lastStartedMs - a.lastStartedMs)
    const active = runningCandidates[0]

    if (active.type === 'REGISTRATION') {
      return {
        statusKey: 'registration_open',
        phaseNumber: null,
        phaseName: 'Registration',
        statusBadge: '● REGISTRATION OPEN',
        statusDotColor: 'bg-green-500 animate-pulse',
        countdownLabel: 'REGISTRATION CLOSES IN',
        timelineTitle: 'REGISTRATION',
        targetTimeMs: active.endMs,
        scheduledStartAt: active.scheduledStartAt,
        scheduledEndAt: active.scheduledEndAt,
        isPaused: false,
        remainingSeconds: null,
        isRegistrationOpen: true,
        activePhaseNumber: null,
      }
    }

    // Phase Active
    const phaseNum = active.phaseNumber
    return {
      statusKey: `phase_${phaseNum}_active`,
      phaseNumber: phaseNum,
      phaseName: active.name,
      statusBadge: `● PHASE ${phaseNum} ACTIVE`,
      statusDotColor: 'bg-emerald-500 animate-pulse',
      countdownLabel: `PHASE ${phaseNum} ENDS IN`,
      timelineTitle: `PHASE ${phaseNum}`,
      targetTimeMs: active.endMs,
      scheduledStartAt: active.scheduledStartAt,
      scheduledEndAt: active.scheduledEndAt,
      isPaused: false,
      remainingSeconds: null,
      isRegistrationOpen: false,
      activePhaseNumber: phaseNum,
      phaseObj: active.rawObj
    }
  }

  // =========================================================================
  // PRIORITY 2: Check for Paused Timers (when NO timer is running)
  // =========================================================================
  const pausedCandidates = candidates.filter(c => c.isPaused)
  if (pausedCandidates.length > 0) {
    // Sort by most recently paused/started
    pausedCandidates.sort((a, b) => Math.max(b.pausedAtMs, b.lastStartedMs) - Math.max(a.pausedAtMs, a.lastStartedMs))
    const active = pausedCandidates[0]

    if (active.type === 'REGISTRATION') {
      return {
        statusKey: 'registration_paused',
        phaseNumber: null,
        phaseName: 'Registration',
        statusBadge: '● REGISTRATION PAUSED',
        statusDotColor: 'bg-amber-500',
        countdownLabel: 'REGISTRATION PAUSED',
        timelineTitle: 'REGISTRATION',
        targetTimeMs: null,
        scheduledStartAt: active.scheduledStartAt,
        scheduledEndAt: active.scheduledEndAt,
        isPaused: true,
        remainingSeconds: active.remainingSeconds,
        isRegistrationOpen: true,
        activePhaseNumber: null,
      }
    }

    // Phase Paused
    const phaseNum = active.phaseNumber
    return {
      statusKey: `phase_${phaseNum}_paused`,
      phaseNumber: phaseNum,
      phaseName: active.name,
      statusBadge: `● PHASE ${phaseNum} PAUSED`,
      statusDotColor: 'bg-amber-500',
      countdownLabel: `PHASE ${phaseNum} PAUSED`,
      timelineTitle: `PHASE ${phaseNum}`,
      targetTimeMs: null,
      scheduledStartAt: active.scheduledStartAt,
      scheduledEndAt: active.scheduledEndAt,
      isPaused: true,
      remainingSeconds: active.remainingSeconds,
      isRegistrationOpen: false,
      activePhaseNumber: phaseNum,
      phaseObj: active.rawObj
    }
  }

  // =========================================================================
  // PRIORITY 3: Automated Schedule & Completed State (when idle / non-running)
  // =========================================================================
  const lastPhase = sortedPhases[sortedPhases.length - 1]
  const lastPhaseEnd = getTime(lastPhase?.scheduled_end_at)
  const isAllPhasesCompleted = lastPhase && (
    (lastPhaseEnd && now >= lastPhaseEnd) ||
    sortedPhases.every(p => p.timer_status === 'completed' || p.timer_status === 'closed')
  )

  if (isAllPhasesCompleted) {
    return {
      statusKey: 'event_completed',
      phaseNumber: null,
      phaseName: 'Event Completed',
      statusBadge: '● EVENT COMPLETED',
      statusDotColor: 'bg-slate-400',
      countdownLabel: 'EVENT COMPLETED',
      timelineTitle: 'IPL 2026',
      targetTimeMs: null,
      scheduledStartAt: lastPhase?.scheduled_start_at,
      scheduledEndAt: lastPhase?.scheduled_end_at,
      isPaused: false,
      remainingSeconds: 0,
      isRegistrationOpen: false,
      activePhaseNumber: null,
    }
  }

  // Upcoming Phase Check
  const upcomingPhase = sortedPhases.find(p => {
    const pStart = getTime(p.scheduled_start_at)
    return p.timer_status === 'upcoming' || (pStart && now < pStart)
  })

  if (upcomingPhase) {
    const phaseNum = upcomingPhase.phase_number || 1
    const pStartMs = getTime(upcomingPhase.scheduled_start_at)
    const pEndMs = getTime(upcomingPhase.scheduled_end_at)
    const isRegClosed = regTimer?.timer_status === 'closed' || regTimer?.timer_status === 'completed' || (getTime(regTimer?.scheduled_end_at) && now >= getTime(regTimer?.scheduled_end_at))

    return {
      statusKey: `phase_${phaseNum}_upcoming`,
      phaseNumber: phaseNum,
      phaseName: upcomingPhase.name || `Phase ${phaseNum}`,
      statusBadge: isRegClosed ? '● REGISTRATION CLOSED' : `● PHASE ${phaseNum} UPCOMING`,
      statusDotColor: isRegClosed ? 'bg-red-600' : 'bg-amber-500',
      countdownLabel: `PHASE ${phaseNum} STARTS IN`,
      timelineTitle: `PHASE ${phaseNum}`,
      targetTimeMs: pStartMs,
      scheduledStartAt: upcomingPhase.scheduled_start_at,
      scheduledEndAt: upcomingPhase.scheduled_end_at,
      isPaused: false,
      remainingSeconds: null,
      isRegistrationOpen: false,
      activePhaseNumber: null,
      phaseObj: upcomingPhase
    }
  }

  // Upcoming Registration Check
  const regStartMs = getTime(regTimer?.scheduled_start_at)
  if (regTimer?.timer_status === 'upcoming' || (regStartMs && now < regStartMs)) {
    return {
      statusKey: 'registration_upcoming',
      phaseNumber: null,
      phaseName: 'Registration',
      statusBadge: '● REGISTRATION UPCOMING',
      statusDotColor: 'bg-amber-500',
      countdownLabel: 'REGISTRATION STARTS IN',
      timelineTitle: 'REGISTRATION',
      targetTimeMs: regStartMs,
      scheduledStartAt: regTimer?.scheduled_start_at,
      scheduledEndAt: regTimer?.scheduled_end_at,
      isPaused: false,
      remainingSeconds: null,
      isRegistrationOpen: false,
      activePhaseNumber: null,
    }
  }

  // Fallback: Registration Closed
  return {
    statusKey: 'registration_closed',
    phaseNumber: null,
    phaseName: 'Registration Closed',
    statusBadge: '● REGISTRATION CLOSED',
    statusDotColor: 'bg-red-600',
    countdownLabel: 'REGISTRATION CLOSED',
    timelineTitle: 'REGISTRATION',
    targetTimeMs: null,
    scheduledStartAt: regTimer?.scheduled_start_at,
    scheduledEndAt: regTimer?.scheduled_end_at,
    isPaused: false,
    remainingSeconds: 0,
    isRegistrationOpen: false,
    activePhaseNumber: null,
  }
}
