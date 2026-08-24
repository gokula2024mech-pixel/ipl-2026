import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'
import { PHASES } from '../data/content'
import { supabase } from '../supabaseClient'

export function PhaseSpotlight() {
  const [activePhase, setActivePhase] = useState(0)
  const [dbPhases, setDbPhases] = useState([])
  const [countdownStates, setCountdownStates] = useState({})
  const [hasDefaultSelected, setHasDefaultSelected] = useState(false)

  const fetchPhases = async () => {
    try {
      const { data, error } = await supabase
        .from("phases")
        .select("*")
        .order("phase_number", { ascending: true });
      if (!error && data) {
        setDbPhases(data);
      }
    } catch (err) {
      console.error("Error loading public phases in spotlight:", err);
    }
  };

  useEffect(() => {
    fetchPhases();

    // Subscribe to realtime updates on the 'phases' table
    const channel = supabase
      .channel("public-spotlight-phases")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "phases" },
        () => {
          fetchPhases();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Compute default active phase selection based on priority
  useEffect(() => {
    if (dbPhases.length === 0 || hasDefaultSelected) return;

    // 1. Running phase
    let defaultIdx = dbPhases.findIndex(p => p.timer_status === 'running');
    if (defaultIdx === -1) {
      // 2. Paused phase
      defaultIdx = dbPhases.findIndex(p => p.timer_status === 'paused');
    }
    if (defaultIdx === -1) {
      // 3. Nearest upcoming phase
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
        defaultIdx = nearestUpcoming;
      }
    }
    if (defaultIdx === -1) {
      defaultIdx = 0; // 4. Otherwise Phase 1
    }

    setActivePhase(defaultIdx);
    setHasDefaultSelected(true);
  }, [dbPhases, hasDefaultSelected]);

  // Local ticker countdown
  useEffect(() => {
    if (dbPhases.length === 0) return;

    const timer = setInterval(() => {
      const newStates = {};
      let needsRefresh = false;

      dbPhases.forEach((p) => {
        if (p.timer_status === "running" && p.scheduled_end_at) {
          const end = new Date(p.scheduled_end_at).getTime();
          let diff = end - Date.now();
          if (p.is_timer_paused && p.remaining_seconds) {
            diff = Number(p.remaining_seconds) * 1000;
          }

          if (diff <= 0) {
            newStates[p.id] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Completed", isOver: true };
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

            newStates[p.id] = { days, hours, minutes, seconds, statusText, isOver: false };
          }
        } else if (p.timer_status === "upcoming" && p.scheduled_start_at) {
          const start = new Date(p.scheduled_start_at).getTime();
          const diff = start - Date.now();
          if (diff > 0) {
            const seconds = Math.floor((diff / 1000) % 60);
            const minutes = Math.floor((diff / 1000 / 60) % 60);
            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            newStates[p.id] = { days, hours, minutes, seconds, statusText: "Upcoming", isOver: false, isStartingSoon: true };
          } else {
            newStates[p.id] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Upcoming", isOver: true, isStartingSoon: false };
          }
        } else if (p.timer_status === "paused") {
          const diff = Number(p.remaining_seconds || 0) * 1000;
          const seconds = Math.floor((diff / 1000) % 60);
          const minutes = Math.floor((diff / 1000 / 60) % 60);
          const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          newStates[p.id] = { days, hours, minutes, seconds, statusText: "Paused", isOver: false };
        } else if (p.timer_status === "completed") {
          newStates[p.id] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Completed", isOver: true };
        } else if (p.timer_status === "closed") {
          newStates[p.id] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Closed", isOver: true };
        } else {
          newStates[p.id] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Upcoming", isOver: false };
        }
      });

      setCountdownStates(newStates);
      if (needsRefresh) {
        setDbPhases([...dbPhases]);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [dbPhases]);

  const handlePrevPhase = () => {
    setActivePhase((prev) => (prev === 0 ? 2 : prev - 1));
  };

  const handleNextPhase = () => {
    setActivePhase((prev) => (prev === 2 ? 0 : prev + 1));
  };

  if (dbPhases.length === 0 || !dbPhases[activePhase]) return null;

  const p = dbPhases[activePhase];
  const countdown = countdownStates[p.id];

  // Get phase specific description & configuration
  let purposeText = "";
  let durationText = "Week 1";
  let maxScoreText = "100 pts";
  let accentGlowClass = "bg-blue-500";
  let accentBadgeClass = "bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30";
  let accentBorderClass = "border-blue-500/30";
  let accentTextClass = "text-blue-400";

  if (p.phase_number === 1) {
    purposeText = "Identify a genuine real-world problem and turn it into a well-defined, feasible, cost-justified concept.";
    durationText = "Week 1";
    maxScoreText = "100 pts";
    accentGlowClass = "bg-blue-500";
    accentBadgeClass = "bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30";
    accentBorderClass = "border-blue-500/30";
    accentTextClass = "text-blue-400";
  } else if (p.phase_number === 2) {
    purposeText = "Design, build, and rigorously test a working prototype that proves the concept functions as intended.";
    durationText = "Weeks 2–3";
    maxScoreText = "100 pts";
    accentGlowClass = "bg-green-500";
    accentBadgeClass = "bg-green-500/20 text-green-300 ring-1 ring-green-500/30";
    accentBorderClass = "border-green-500/30";
    accentTextClass = "text-green-400";
  } else if (p.phase_number === 3) {
    purposeText = "Present the finished product to an expert panel as a market-aware, business-ready innovation.";
    durationText = "Week 4";
    maxScoreText = "100 pts";
    accentGlowClass = "bg-purple-500";
    accentBadgeClass = "bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/30";
    accentBorderClass = "border-purple-500/30";
    accentTextClass = "text-purple-400";
  }

  // Determine status color and label
  let statusLabel = "Upcoming";
  let timerLabel = "PHASE STATUS";
  let timerLabelValue = "Upcoming";
  let showDigits = false;
  let statusColor = "bg-slate-500/20 text-slate-300 ring-slate-500/30";

  if (p.timer_status === "running") {
    if (countdown) {
      if (countdown.statusText === "Ending Shortly") {
        statusLabel = "Ending Shortly";
        statusColor = "bg-red-500/25 text-red-300 ring-red-500/30 animate-pulse";
      } else if (countdown.statusText === "Ending Soon") {
        statusLabel = "Ending Soon";
        statusColor = "bg-amber-500/25 text-amber-300 ring-amber-500/30 animate-pulse";
      } else {
        statusLabel = "In Progress";
        statusColor = "bg-green-500/25 text-green-300 ring-green-500/30 animate-pulse";
      }
    } else {
      statusLabel = "In Progress";
      statusColor = "bg-green-500/25 text-green-300 ring-green-500/30 animate-pulse";
    }
    timerLabel = "TIME REMAINING";
    showDigits = true;
  } else if (p.timer_status === "paused") {
    statusLabel = "Paused";
    statusColor = "bg-amber-500/20 text-amber-300 ring-amber-500/30";
    timerLabel = "PHASE PAUSED";
    showDigits = true;
  } else if (p.timer_status === "completed") {
    statusLabel = "Completed";
    statusColor = "bg-blue-500/20 text-blue-300 ring-blue-500/30";
    timerLabel = "PHASE STATUS";
    timerLabelValue = "PHASE COMPLETED";
    showDigits = false;
  } else if (p.timer_status === "closed") {
    statusLabel = "Closed";
    statusColor = "bg-rose-500/20 text-rose-300 ring-rose-500/30";
    timerLabel = "PHASE STATUS";
    timerLabelValue = "PHASE CLOSED";
    showDigits = false;
  } else if (p.timer_status === "upcoming") {
    statusLabel = "Upcoming";
    statusColor = "bg-slate-500/20 text-slate-300 ring-slate-500/30";
    if (countdown && countdown.isStartingSoon) {
      timerLabel = "STARTS IN";
      showDigits = true;
    } else {
      timerLabel = "PHASE STATUS";
      timerLabelValue = "UPCOMING";
      showDigits = false;
    }
  }

  // Days to go supporting line text
  let upcomingSupportingLine = "";
  if (p.timer_status === 'upcoming' && p.scheduled_start_at) {
    const startDiff = new Date(p.scheduled_start_at).getTime() - Date.now();
    if (startDiff > 0) {
      const totalMins = Math.floor(startDiff / 1000 / 60);
      const totalHours = Math.floor(totalMins / 60);
      const totalDays = Math.floor(totalHours / 24);

      if (totalDays >= 1) {
        upcomingSupportingLine = `Phase ${p.phase_number} begins in ${totalDays} days`;
      } else if (totalHours >= 1) {
        upcomingSupportingLine = `Phase ${p.phase_number} begins tomorrow`;
      } else {
        upcomingSupportingLine = `Phase ${p.phase_number} begins in ${totalMins} minutes`;
      }
    }
  }

  const prevPhaseName = activePhase === 0 ? "Phase 3" : `Phase ${activePhase}`;
  const nextPhaseName = activePhase === 2 ? "Phase 1" : `Phase ${activePhase + 2}`;

  return (
    <section className="bg-primary py-12 border-b border-white/5">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className={`rounded-3xl border ${accentBorderClass} bg-slate-900/60 p-6 md:p-10 backdrop-blur-sm shadow-2xl relative overflow-hidden`}>
            {/* Accent gradient glow */}
            <div className={`absolute top-0 right-0 -mt-20 -mr-20 h-40 w-40 rounded-full blur-3xl opacity-20 ${accentGlowClass}`}></div>

            <div className="grid gap-8 md:grid-cols-12 items-center">
              {/* Left Column: Info */}
              <div className="md:col-span-7 space-y-5 text-left">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${accentBadgeClass}`}>
                    Phase {p.phase_number} • {p.timer_status === 'running' ? 'CURRENT' : p.timer_status.toUpperCase()}
                  </span>
                </div>

                <h3 className="font-heading text-2xl font-bold text-white md:text-3xl">
                  {p.name.toUpperCase()}
                </h3>

                <p className="text-base text-blue-100/95 leading-relaxed">
                  {purposeText}
                </p>

                {/* Supporting Details */}
                <div className="grid grid-cols-2 gap-4 pt-2 max-w-xs">
                  <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                    <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Duration</span>
                    <span className="font-semibold text-white text-sm">{durationText}</span>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                    <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Max Score</span>
                    <span className="font-semibold text-white text-sm">{maxScoreText}</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Timer Display */}
              <div className="md:col-span-5 flex flex-col items-center justify-center p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
                <p className={`text-xs font-bold uppercase tracking-widest ${accentTextClass} mb-4`}>
                  {timerLabel}
                </p>

                {showDigits && countdown ? (
                  <div className="space-y-2 w-full">
                    <div className="flex justify-center gap-2 md:gap-3 font-mono text-2xl md:text-4xl lg:text-4xl font-bold text-white tracking-widest">
                      <span>{String(countdown.days).padStart(2, '0')}</span>
                      <span className="text-white/30 animate-pulse">:</span>
                      <span>{String(countdown.hours).padStart(2, '0')}</span>
                      <span className="text-white/30 animate-pulse">:</span>
                      <span>{String(countdown.minutes).padStart(2, '0')}</span>
                      <span className="text-white/30 animate-pulse">:</span>
                      <span>{String(countdown.seconds).padStart(2, '0')}</span>
                    </div>
                    <div className="flex justify-center gap-2 md:gap-3 text-[8px] md:text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
                      <span className="w-10 text-center">Days</span>
                      <span className="w-2"></span>
                      <span className="w-10 text-center">Hours</span>
                      <span className="w-2"></span>
                      <span className="w-10 text-center">Minutes</span>
                      <span className="w-2"></span>
                      <span className="w-10 text-center">Seconds</span>
                    </div>
                  </div>
                ) : (
                  <p className="font-heading text-xl md:text-2xl font-bold text-white uppercase tracking-wider">
                    {timerLabelValue}
                  </p>
                )}

                {upcomingSupportingLine && (
                  <p className="mt-4 text-xs text-amber-300 font-semibold tracking-wide italic">
                    {upcomingSupportingLine}
                  </p>
                )}

                <div className="mt-5">
                  <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${statusColor}`}>
                    {statusLabel.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Previous/Next Navigation Controls */}
          <div className="mt-6 flex items-center justify-center gap-8 text-slate-400">
            <button
              type="button"
              onClick={handlePrevPhase}
              className="flex items-center gap-2 hover:text-white transition cursor-pointer text-xs md:text-sm font-bold bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full border border-white/5"
            >
              ← {prevPhaseName}
            </button>
            <span className="font-mono text-xs md:text-sm text-amber-300 font-bold bg-amber-400/10 px-4 py-1.5 rounded-full border border-amber-400/20">
              {activePhase + 1} / 3
            </span>
            <button
              type="button"
              onClick={handleNextPhase}
              className="flex items-center gap-2 hover:text-white transition cursor-pointer text-xs md:text-sm font-bold bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full border border-white/5"
            >
              {nextPhaseName} →
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
