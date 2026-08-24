import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Minimize2, Clock } from 'lucide-react'
import { supabase } from '../supabaseClient'

export default function PublicFloatingTimer({ isAdminPublicView }) {
  const [dbPhases, setDbPhases] = useState([])
  const [countdownStates, setCountdownStates] = useState({})
  const [isMinimized, setIsMinimized] = useState(true) // Start minimized to not block page content
  const [currentIndex, setCurrentIndex] = useState(0)

  // 1. Fetch data on mount
  const fetchPhases = async () => {
    try {
      const { data, error } = await supabase
        .from("phases")
        .select("*")
        .order("phase_number", { ascending: true })
      if (!error && data) {
        setDbPhases(data)
      }
    } catch (err) {
      console.error("Error loading public phases in floating timer:", err)
    }
  }

  useEffect(() => {
    fetchPhases()

    // Realtime channel subscription
    const channel = supabase
      .channel("public-floating-phases")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "phases" },
        () => {
          fetchPhases()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // 2. Local countdown ticker (runs every second, updates local state only)
  useEffect(() => {
    if (dbPhases.length === 0) return

    const interval = setInterval(() => {
      const newStates = {}
      let needsRefresh = false

      dbPhases.forEach((p) => {
        if (p.timer_status === "running" && p.scheduled_end_at) {
          const end = new Date(p.scheduled_end_at).getTime()
          let diff = end - Date.now()
          if (p.is_timer_paused && p.remaining_seconds) {
            diff = Number(p.remaining_seconds) * 1000
          }

          if (diff <= 0) {
            newStates[`phase-${p.id}`] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Completed" }
            p.timer_status = "completed"
            p.is_timer_running = false
            p.is_timer_paused = false
            needsRefresh = true
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

            newStates[`phase-${p.id}`] = { days, hours, minutes, seconds, statusText }
          }
        } else if (p.timer_status === "paused") {
          const diff = Number(p.remaining_seconds || 0) * 1000
          const seconds = Math.floor((diff / 1000) % 60)
          const minutes = Math.floor((diff / 1000 / 60) % 60)
          const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
          const days = Math.floor(diff / (1000 * 60 * 60 * 24))
          newStates[`phase-${p.id}`] = { days, hours, minutes, seconds, statusText: "Paused" }
        } else if (p.timer_status === "completed") {
          newStates[`phase-${p.id}`] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Completed" }
        } else if (p.timer_status === "closed") {
          newStates[`phase-${p.id}`] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Closed" }
        } else {
          newStates[`phase-${p.id}`] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Upcoming" }
        }
      })

      setCountdownStates(newStates)
      if (needsRefresh) {
        setDbPhases([...dbPhases])
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [dbPhases])

  // 3. Assemble active running timers (phases only)
  const runningTimers = []

  dbPhases.forEach((p) => {
    if (p.timer_status === "running" || p.timer_status === "paused") {
      runningTimers.push({
        id: `phase-${p.id}`,
        title: `PHASE ${p.phase_number}`,
        subtitle: p.name,
        countdownKey: `phase-${p.id}`,
        timerStatus: p.timer_status
      })
    }
  })

  // If there are no active running/paused phase timers, do not render anything
  if (runningTimers.length === 0) return null

  // Ensure current index is within bounds
  const activeIndex = Math.min(currentIndex, runningTimers.length - 1)
  const activeTimer = runningTimers[activeIndex >= 0 ? activeIndex : 0]
  const activeCountdown = activeTimer ? countdownStates[activeTimer.countdownKey] : null

  const handlePrev = (e) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev === 0 ? runningTimers.length - 1 : prev - 1))
  }

  const handleNext = (e) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev === runningTimers.length - 1 ? 0 : prev + 1))
  }

  // Determine status color and label
  let statusLabel = "Upcoming"
  let statusColor = "bg-slate-500/20 text-slate-300 ring-slate-500/30"

  if (activeTimer && activeCountdown) {
    const text = activeCountdown.statusText
    if (activeTimer.timerStatus === "paused") {
      statusLabel = "Paused"
      statusColor = "bg-amber-500/20 text-amber-300 ring-amber-500/30"
    } else if (text === "Ending Shortly") {
      statusLabel = "Ending Shortly"
      statusColor = "bg-red-500/25 text-red-300 ring-red-500/30 animate-pulse"
    } else if (text === "Ending Soon") {
      statusLabel = "Ending Soon"
      statusColor = "bg-amber-500/25 text-amber-300 ring-amber-500/30 animate-pulse"
    } else if (text === "Completed") {
      statusLabel = "Completed"
      statusColor = "bg-blue-500/20 text-blue-300 ring-blue-500/30"
    } else if (text === "Closed") {
      statusLabel = "Closed"
      statusColor = "bg-rose-500/20 text-rose-300 ring-rose-500/30"
    } else {
      statusLabel = "In Progress"
      statusColor = "bg-green-500/25 text-green-300 ring-green-500/30"
    }
  }

  return (
    <div className={`fixed ${isAdminPublicView ? 'bottom-24' : 'bottom-6'} right-6 z-40 select-none`}>
      <AnimatePresence mode="wait">
        {isMinimized ? (
          /* Minimized State */
          <motion.button
            key="minimized"
            layoutId="floating-timer-container"
            onClick={() => setIsMinimized(false)}
            title="Expand Timer"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 border border-white/10 shadow-2xl text-accent cursor-pointer hover:bg-slate-800 transition-colors"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
          >
            <Clock size={20} className="animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
          </motion.button>
        ) : (
          /* Expanded Card State */
          <motion.article
            key="expanded"
            layoutId="floating-timer-container"
            className="w-[calc(100vw-32px)] max-w-[360px] md:w-96 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl p-5 text-white"
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-accent" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">IPL 2026 Timers</span>
              </div>
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                title="Minimize"
                className="text-slate-400 hover:text-white transition cursor-pointer p-0.5 rounded"
              >
                <Minimize2 size={16} />
              </button>
            </div>

            {/* Main Content */}
            {activeTimer && (
              <div className="py-1">
                <p className="text-[10px] font-bold text-accent tracking-wider uppercase">
                  {activeTimer.title}
                </p>
                <h4 className="font-heading text-sm font-bold text-white truncate mt-0.5">
                  {activeTimer.subtitle}
                </h4>

                {/* Countdown display */}
                <div className="mt-3 py-2 px-3 rounded-lg bg-white/5 text-center">
                  <p className="font-mono text-base font-bold text-white tracking-widest">
                    {activeCountdown ? (
                      `${String(activeCountdown.days).padStart(2, "0")}d : ` +
                      `${String(activeCountdown.hours).padStart(2, "0")}h : ` +
                      `${String(activeCountdown.minutes).padStart(2, "0")}m : ` +
                      `${String(activeCountdown.seconds).padStart(2, "0")}s`
                    ) : (
                      "--d : --h : --m : --s"
                    )}
                  </p>
                </div>

                {/* Status indicator */}
                <div className="mt-3 flex items-center justify-between">
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${statusColor}`}>
                    {statusLabel}
                  </span>

                  {/* Carousel cycling controls */}
                  {runningTimers.length > 1 && (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <button
                        type="button"
                        onClick={handlePrev}
                        className="hover:text-white p-1 rounded hover:bg-white/5 transition cursor-pointer"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-[10px] font-mono">
                        {activeIndex + 1} / {runningTimers.length}
                      </span>
                      <button
                        type="button"
                        onClick={handleNext}
                        className="hover:text-white p-1 rounded hover:bg-white/5 transition cursor-pointer"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.article>
        )}
      </AnimatePresence>
    </div>
  )
}
