import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'
import { PHASES } from '../data/content'
import { supabase } from '../supabaseClient'

export function TimerSpotlight() {
  const [dbPhases, setDbPhases] = useState([])
  const [regTimer, setRegTimer] = useState(null)
  const [countdownStates, setCountdownStates] = useState({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [hasDefaultSelected, setHasDefaultSelected] = useState(false)
  const timerRef = useRef(null)

  const fetchData = async () => {
    try {
      // Fetch phases
      const { data: phasesData, error: phasesError } = await supabase
        .from("phases")
        .select("*")
        .order("phase_number", { ascending: true });
      if (!phasesError && phasesData) {
        setDbPhases(phasesData);
      }

      // Fetch registration
      const { data: regData, error: regError } = await supabase
        .from("registration_timer")
        .select("*")
        .maybeSingle();
      if (!regError && regData) {
        setRegTimer(regData);
      }
    } catch (err) {
      console.error("Error loading public timers in spotlight:", err);
    }
  };

  useEffect(() => {
    fetchData();

    // Subscribe to realtime updates on both tables
    const phasesChannel = supabase
      .channel("public-spotlight-phases")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "phases" },
        () => {
          fetchData();
        }
      )
      .subscribe();

    const regChannel = supabase
      .channel("public-spotlight-registration")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registration_timer" },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(phasesChannel);
      supabase.removeChannel(regChannel);
    };
  }, []);

  // Compute default active selection index based on priority on load
  useEffect(() => {
    if (dbPhases.length === 0 || !regTimer || hasDefaultSelected) return;

    // Priority:
    // 1. Registration RUNNING or PAUSED (index 0)
    // 2. Running Phase (index = phase index + 1)
    // 3. Paused Phase (index = phase index + 1)
    // 4. Nearest upcoming phase (index = phase index + 1)
    // 5. Registration fallback (index 0)
    let targetIdx = 0;

    if (regTimer.timer_status === "running" || regTimer.timer_status === "paused") {
      targetIdx = 0;
    } else {
      // Find running phase (indexes 1, 2, 3)
      const runningPhaseIdx = dbPhases.findIndex(p => p.timer_status === "running");
      if (runningPhaseIdx !== -1) {
        targetIdx = runningPhaseIdx + 1;
      } else {
        // Find paused phase
        const pausedPhaseIdx = dbPhases.findIndex(p => p.timer_status === "paused");
        if (pausedPhaseIdx !== -1) {
          targetIdx = pausedPhaseIdx + 1;
        } else {
          // Find nearest upcoming phase
          let nearestUpcoming = null;
          let minDiff = Infinity;
          dbPhases.forEach((p, idx) => {
            if (p.timer_status === 'upcoming' && p.scheduled_start_at) {
              const diff = new Date(p.scheduled_start_at).getTime() - Date.now();
              if (diff > 0 && diff < minDiff) {
                minDiff = diff;
                nearestUpcoming = idx;
              }
            }
          });
          if (nearestUpcoming !== null) {
            targetIdx = nearestUpcoming + 1;
          } else {
            targetIdx = 0; // fallback to registration
          }
        }
      }
    }

    setCurrentIndex(targetIdx);
    setHasDefaultSelected(true);
  }, [dbPhases, hasDefaultSelected, regTimer]);

  // Local ticker countdown
  useEffect(() => {
    const interval = setInterval(() => {
      const newStates = {};
      let needsRefresh = false;

      // Calculate for phases
      dbPhases.forEach((p) => {
        if (p.timer_status === "running" && p.scheduled_end_at) {
          const end = new Date(p.scheduled_end_at).getTime();
          let diff = end - Date.now();
          if (p.is_timer_paused && p.remaining_seconds) {
            diff = Number(p.remaining_seconds) * 1000;
          }

          if (diff <= 0) {
            newStates[`phase-${p.id}`] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Completed", isOver: true };
            p.timer_status = "completed";
            p.is_timer_running = false;
            p.is_timer_paused = false;
            needsRefresh = true;
          } else {
            const seconds = Math.floor((diff / 1000) % 60);
            const minutes = Math.floor((diff / 1000 / 60) % 60);
            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));

            let statusText = "In Progress";
            const totalSeconds = diff / 1000;
            if (totalSeconds <= 3600) {
              statusText = "Ending Shortly";
            } else if (totalSeconds <= 86400) {
              statusText = "Ending Soon";
            }

            newStates[`phase-${p.id}`] = { days, hours, minutes, seconds, statusText, isOver: false };
          }
        } else if (p.timer_status === "upcoming" && p.scheduled_start_at) {
          const start = new Date(p.scheduled_start_at).getTime();
          const diff = start - Date.now();
          if (diff > 0) {
            const seconds = Math.floor((diff / 1000) % 60);
            const minutes = Math.floor((diff / 1000 / 60) % 60);
            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            newStates[`phase-${p.id}`] = { days, hours, minutes, seconds, statusText: "Upcoming", isOver: false, isStartingSoon: true };
          } else {
            newStates[`phase-${p.id}`] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Upcoming", isOver: true, isStartingSoon: false };
          }
        } else if (p.timer_status === "paused") {
          const diff = Number(p.remaining_seconds || 0) * 1000;
          const seconds = Math.floor((diff / 1000) % 60);
          const minutes = Math.floor((diff / 1000 / 60) % 60);
          const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          newStates[`phase-${p.id}`] = { days, hours, minutes, seconds, statusText: "Paused", isOver: false };
        } else if (p.timer_status === "completed") {
          newStates[`phase-${p.id}`] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Completed", isOver: true };
        } else if (p.timer_status === "closed") {
          newStates[`phase-${p.id}`] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Closed", isOver: true };
        } else {
          newStates[`phase-${p.id}`] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Upcoming", isOver: false };
        }
      });

      // Calculate for registration timer
      if (regTimer) {
        if (regTimer.timer_status === "running" && regTimer.scheduled_end_at) {
          const end = new Date(regTimer.scheduled_end_at).getTime();
          let diff = end - Date.now();
          if (regTimer.is_timer_paused && regTimer.remaining_seconds) {
            diff = Number(regTimer.remaining_seconds) * 1000;
          }

          if (diff <= 0) {
            newStates[`reg-${regTimer.id}`] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Completed" };
            regTimer.timer_status = "completed";
            regTimer.is_timer_running = false;
            regTimer.is_timer_paused = false;
            needsRefresh = true;
          } else {
            const seconds = Math.floor((diff / 1000) % 60);
            const minutes = Math.floor((diff / 1000 / 60) % 60);
            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));

            let statusText = "In Progress";
            const totalSeconds = diff / 1000;
            if (totalSeconds <= 3600) {
              statusText = "Ending Shortly";
            } else if (totalSeconds <= 86400) {
              statusText = "Ending Soon";
            }

            newStates[`reg-${regTimer.id}`] = { days, hours, minutes, seconds, statusText };
          }
        } else if (regTimer.timer_status === "upcoming" && regTimer.scheduled_start_at) {
          const start = new Date(regTimer.scheduled_start_at).getTime();
          const diff = start - Date.now();
          if (diff > 0) {
            const seconds = Math.floor((diff / 1000) % 60);
            const minutes = Math.floor((diff / 1000 / 60) % 60);
            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            newStates[`reg-${regTimer.id}`] = { days, hours, minutes, seconds, statusText: "Upcoming", isStartingSoon: true };
          } else {
            newStates[`reg-${regTimer.id}`] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Upcoming", isStartingSoon: false };
          }
        } else if (regTimer.timer_status === "paused") {
          const diff = Number(regTimer.remaining_seconds || 0) * 1000;
          const seconds = Math.floor((diff / 1000) % 60);
          const minutes = Math.floor((diff / 1000 / 60) % 60);
          const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          newStates[`reg-${regTimer.id}`] = { days, hours, minutes, seconds, statusText: "Paused" };
        } else if (regTimer.timer_status === "completed") {
          newStates[`reg-${regTimer.id}`] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Completed" };
        } else if (regTimer.timer_status === "closed") {
          newStates[`reg-${regTimer.id}`] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Closed" };
        } else {
          newStates[`reg-${regTimer.id}`] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Upcoming" };
        }
      }

      setCountdownStates(newStates);
      if (needsRefresh) {
        setDbPhases([...dbPhases]);
        if (regTimer) setRegTimer({ ...regTimer });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [dbPhases, regTimer]);

  // Assemble unified Spotlight carousel items (exactly 4: Registration, Phase 1, Phase 2, Phase 3)
  const carouselItems = [];

  // Item 0: Registration
  if (regTimer) {
    carouselItems.push({
      id: `reg-${regTimer.id}`,
      title: "Join IPL 2026",
      countdownKey: `reg-${regTimer.id}`,
      timerStatus: regTimer.timer_status,
      type: "registration"
    });
  }

  // Items 1, 2, 3: Phases
  dbPhases.forEach((p) => {
    carouselItems.push({
      id: `phase-${p.id}`,
      title: p.name,
      phaseNumber: p.phase_number,
      countdownKey: `phase-${p.id}`,
      timerStatus: p.timer_status,
      type: "phase"
    });
  });

  const startInterval = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % 4);
    }, 4000);
  };

  useEffect(() => {
    startInterval();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (carouselItems.length === 0 || !carouselItems[currentIndex]) return null;

  const activeItem = carouselItems[currentIndex];
  const countdown = countdownStates[activeItem.countdownKey];

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? 3 : prev - 1));
    startInterval();
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % 4);
    startInterval();
  };

  // Get item configuration
  let headerLabel = "";
  let descriptionText = "";
  let durationText = "";
  let timerLabel = "TIME REMAINING";
  let showDigits = false;
  let statusBadgeLabel = "Upcoming";
  let statusColor = "bg-slate-500/20 text-slate-300 ring-slate-500/30";
  let accentGlowClass = "bg-blue-500";
  let accentBorderClass = "border-blue-500/30";
  let accentTextClass = "text-blue-400";

  if (activeItem.type === "registration") {
    accentGlowClass = "bg-amber-500";
    accentBorderClass = "border-amber-500/30";
    accentTextClass = "text-amber-400";
    descriptionText = "Join IPL 2026 and start your innovation journey.";

    if (activeItem.timerStatus === "running") {
      headerLabel = "REGISTRATION IS OPEN";
      timerLabel = "TIME REMAINING";
      showDigits = true;
      statusBadgeLabel = countdown?.statusText || "In Progress";
      if (statusBadgeLabel === "Ending Shortly") {
        statusColor = "bg-red-500/25 text-red-300 ring-red-500/30 animate-pulse";
      } else if (statusBadgeLabel === "Ending Soon") {
        statusColor = "bg-amber-500/25 text-amber-300 ring-amber-500/30 animate-pulse";
      } else {
        statusColor = "bg-green-500/25 text-green-300 ring-green-500/30 animate-pulse";
      }
    } else if (activeItem.timerStatus === "paused") {
      headerLabel = "REGISTRATION PAUSED";
      timerLabel = "TIME REMAINING";
      showDigits = true;
      statusBadgeLabel = "Paused";
      statusColor = "bg-amber-500/20 text-amber-300 ring-amber-500/30";
    } else if (activeItem.timerStatus === "upcoming") {
      headerLabel = "REGISTRATION OPENS IN";
      timerLabel = "STARTS IN";
      showDigits = true;
      statusBadgeLabel = "Upcoming";
      statusColor = "bg-slate-500/20 text-slate-300 ring-slate-500/30";
    } else {
      headerLabel = "REGISTRATION CLOSED";
      timerLabel = "";
      showDigits = false;
      statusBadgeLabel = activeItem.timerStatus === "completed" ? "Completed" : "Closed";
      statusColor = "bg-slate-500/20 text-slate-300 ring-slate-500/30";
      descriptionText = "Registration period has ended.";
    }
  } else {
    // Phase Items
    const phaseNum = activeItem.phaseNumber;
    headerLabel = `PHASE ${phaseNum} • ${activeItem.title.toUpperCase()}`;

    if (phaseNum === 1) {
      descriptionText = "Identify a genuine real-world problem and turn it into a well-defined, feasible, cost-justified concept.";
      durationText = "Week 1";
      accentGlowClass = "bg-blue-500";
      accentBorderClass = "border-blue-500/30";
      accentTextClass = "text-blue-400";
    } else if (phaseNum === 2) {
      descriptionText = "Design, build, and rigorously test a working prototype that proves the concept functions as intended.";
      durationText = "Weeks 2–3";
      accentGlowClass = "bg-green-500";
      accentBorderClass = "border-green-500/30";
      accentTextClass = "text-green-400";
    } else if (phaseNum === 3) {
      descriptionText = "Present the finished product to an expert panel as a market-aware, business-ready innovation.";
      durationText = "Week 4";
      accentGlowClass = "bg-purple-500";
      accentBorderClass = "border-purple-500/30";
      accentTextClass = "text-purple-400";
    }

    if (activeItem.timerStatus === "running") {
      statusBadgeLabel = "In Progress";
      if (countdown) {
        if (countdown.statusText === "Ending Shortly") {
          statusColor = "bg-red-500/25 text-red-300 ring-red-500/30 animate-pulse";
        } else if (countdown.statusText === "Ending Soon") {
          statusColor = "bg-amber-500/25 text-amber-300 ring-amber-500/30 animate-pulse";
        } else {
          statusColor = "bg-green-500/25 text-green-300 ring-green-500/30 animate-pulse";
        }
      } else {
        statusColor = "bg-green-500/25 text-green-300 ring-green-500/30 animate-pulse";
      }
      timerLabel = "TIME REMAINING";
      showDigits = true;
    } else if (activeItem.timerStatus === "paused") {
      statusBadgeLabel = "Paused";
      statusColor = "bg-amber-500/20 text-amber-300 ring-amber-500/30";
      timerLabel = "PHASE PAUSED";
      showDigits = true;
    } else if (activeItem.timerStatus === "completed") {
      statusBadgeLabel = "Completed";
      statusColor = "bg-blue-500/20 text-blue-300 ring-blue-500/30";
      timerLabel = "PHASE COMPLETED";
      showDigits = false;
    } else if (activeItem.timerStatus === "closed") {
      statusBadgeLabel = "Closed";
      statusColor = "bg-rose-500/20 text-rose-300 ring-rose-500/30";
      timerLabel = "PHASE CLOSED";
      showDigits = false;
    } else if (activeItem.timerStatus === "upcoming") {
      statusBadgeLabel = "Upcoming";
      statusColor = "bg-slate-500/20 text-slate-300 ring-slate-500/30";
      if (countdown && countdown.isStartingSoon) {
        timerLabel = "STARTS IN";
        showDigits = true;
      } else {
        timerLabel = "UPCOMING";
        showDigits = false;
      }
    }
  }

  // Days to go supporting line text for upcoming phases
  let upcomingSupportingLine = "";
  if (activeItem.type === "phase" && activeItem.timerStatus === 'upcoming') {
    const phaseDb = dbPhases.find(p => p.phase_number === activeItem.phaseNumber);
    if (phaseDb && phaseDb.scheduled_start_at) {
      const startDiff = new Date(phaseDb.scheduled_start_at).getTime() - Date.now();
      if (startDiff > 0) {
        const totalMins = Math.floor(startDiff / 1000 / 60);
        const totalHours = Math.floor(totalMins / 60);
        const totalDays = Math.floor(totalHours / 24);

        if (totalDays >= 1) {
          upcomingSupportingLine = `Phase ${activeItem.phaseNumber} begins in ${totalDays} days`;
        } else if (totalHours >= 1) {
          upcomingSupportingLine = `Phase ${activeItem.phaseNumber} begins tomorrow`;
        } else {
          upcomingSupportingLine = `Phase ${activeItem.phaseNumber} begins in ${totalMins} minutes`;
        }
      }
    }
  }

  return (
    <section className="bg-primary py-6 border-b border-white/5">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className={`rounded-3xl border ${accentBorderClass} bg-slate-900/60 p-5 md:p-6 backdrop-blur-sm shadow-2xl relative overflow-hidden`}>
          {/* Accent gradient glow */}
          <div className={`absolute top-0 right-0 -mt-20 -mr-20 h-40 w-40 rounded-full blur-3xl opacity-20 ${accentGlowClass}`}></div>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col text-center"
            >
              {/* Header Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3 mb-4">
                <span className="text-xs font-bold text-slate-400 tracking-wider">
                  {headerLabel}
                </span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${statusColor}`}>
                  ● {statusBadgeLabel.toUpperCase()}
                </span>
              </div>

              {/* Title / Join IPL */}
              <h4 className="font-heading text-lg font-bold text-white mb-2 truncate">
                {activeItem.title}
              </h4>

              {/* Description / Purpose */}
              <p className="text-sm text-blue-100/90 max-w-2xl mx-auto leading-relaxed mb-4">
                {descriptionText}
              </p>

              {/* Countdown Label */}
              {timerLabel && (
                <p className={`text-[10px] font-bold uppercase tracking-widest ${accentTextClass} mb-2`}>
                  {timerLabel}
                </p>
              )}

              {/* Very Large Countdown */}
              {showDigits && countdown ? (
                <div className="space-y-1">
                  <div className="font-mono text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight leading-none mb-3">
                    {`${String(countdown.days).padStart(2, '0')}d : ` +
                     `${String(countdown.hours).padStart(2, '0')}h : ` +
                     `${String(countdown.minutes).padStart(2, '0')}m : ` +
                     `${String(countdown.seconds).padStart(2, '0')}s`}
                  </div>
                </div>
              ) : !showDigits && timerLabel ? (
                null
              ) : (
                <div className="font-heading text-2xl sm:text-3xl font-bold text-white uppercase tracking-wider mb-3">
                  {activeItem.timerStatus === "completed" && activeItem.type === "registration" ? "Registration period has ended." : activeItem.timerStatus.toUpperCase()}
                </div>
              )}

              {/* Supporting details: Duration + Upcoming begins */}
              <div className="flex flex-col items-center justify-center gap-1.5 text-xs text-slate-400 font-medium mt-1">
                {durationText && (
                  <div>
                    Duration: <span className="text-white font-semibold">{durationText}</span>
                  </div>
                )}
                {upcomingSupportingLine && (
                  <div className="text-amber-300 font-semibold italic">
                    {upcomingSupportingLine}
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation Controls */}
          <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between text-slate-400">
            <button
              type="button"
              onClick={handlePrev}
              className="flex items-center gap-1 hover:text-white transition cursor-pointer text-xs md:text-sm font-bold bg-white/5 hover:bg-white/10 px-3.5 py-1.5 rounded-full border border-white/5"
            >
              ← Previous
            </button>
            <span className="font-mono text-xs md:text-sm text-amber-300 font-bold bg-amber-400/10 px-4 py-1.5 rounded-full border border-amber-400/20">
              {currentIndex + 1} / 4
            </span>
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1 hover:text-white transition cursor-pointer text-xs md:text-sm font-bold bg-white/5 hover:bg-white/10 px-3.5 py-1.5 rounded-full border border-white/5"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Journey() {
  const [activePhase, setActivePhase] = useState(0)
  const phase = PHASES[activePhase]

  return (
    <section id="journey" className="bg-primary py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <SectionHeading
          eyebrow="The IPL Journey"
          title="Three Phases to Product Excellence"
          subtitle="Each phase defined with clear objectives, outputs, and evaluation criteria."
          light
        />

        <SectionReveal>
          <div className="mb-8 flex flex-wrap justify-center gap-3">
            {PHASES.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePhase(i)}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
                  activePhase === i
                    ? 'bg-accent text-white shadow-lg'
                    : 'border border-white/20 bg-white/10 text-white hover:bg-white/20'
                }`}
                aria-pressed={activePhase === i}
              >
                Phase {p.id}: {p.week}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={phase.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm md:p-10"
            >
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
                  {phase.week}
                </span>
                <h3 className="font-heading text-2xl font-bold text-white md:text-3xl">
                  Phase {phase.id} — {phase.title}
                </h3>
              </div>

              <p className="mb-8 text-base leading-relaxed text-blue-100 md:text-lg">
                <span className="font-semibold text-white">Objective: </span>
                {phase.objective}
              </p>

              <div className="grid gap-8 md:grid-cols-2">
                <div>
                  <h4 className="mb-4 font-heading text-lg font-semibold text-white">Key Outputs</h4>
                  <ul className="space-y-3">
                    {phase.outputs.map((output) => (
                      <li key={output} className="flex items-start gap-3 text-blue-100">
                        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                        <span>{output}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="mb-4 font-heading text-lg font-semibold text-white">Evaluation Criteria</h4>
                  <div className="space-y-3">
                    {phase.evaluation.map(({ label, value }) => (
                      <div key={label}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="text-blue-100">{label}</span>
                          <span className="font-semibold text-amber-300">{value}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/10">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${value}%` }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                            className="h-full rounded-full bg-accent"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </SectionReveal>
      </div>
    </section>
  )
}
