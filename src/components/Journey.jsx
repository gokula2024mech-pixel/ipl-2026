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

  // Automatic phase auto-scroll every 4 seconds (resets whenever activePhase changes)
  useEffect(() => {
    const timer = setInterval(() => {
      setActivePhase((prev) => (prev + 1) % 3);
    }, 4000);

    return () => clearInterval(timer);
  }, [activePhase]);

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
  let accentGlowClass = "bg-blue-500";
  let accentBorderClass = "border-blue-500/30";
  let accentTextClass = "text-blue-400";

  if (p.phase_number === 1) {
    purposeText = "Identify a genuine real-world problem and turn it into a well-defined, feasible, cost-justified concept.";
    durationText = "Week 1";
    accentGlowClass = "bg-blue-500";
    accentBorderClass = "border-blue-500/30";
    accentTextClass = "text-blue-400";
  } else if (p.phase_number === 2) {
    purposeText = "Design, build, and rigorously test a working prototype that proves the concept functions as intended.";
    durationText = "Weeks 2–3";
    accentGlowClass = "bg-green-500";
    accentBorderClass = "border-green-500/30";
    accentTextClass = "text-green-400";
  } else if (p.phase_number === 3) {
    purposeText = "Present the finished product to an expert panel as a market-aware, business-ready innovation.";
    durationText = "Week 4";
    accentGlowClass = "bg-purple-500";
    accentBorderClass = "border-purple-500/30";
    accentTextClass = "text-purple-400";
  }

  // Determine status color and label
  let statusBadgeLabel = "Upcoming";
  let timerLabel = "PHASE STATUS";
  let timerLabelValue = "Upcoming";
  let showDigits = false;
  let statusColor = "bg-slate-500/20 text-slate-300 ring-slate-500/30";

  if (p.timer_status === "running") {
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
  } else if (p.timer_status === "paused") {
    statusBadgeLabel = "Paused";
    statusColor = "bg-amber-500/20 text-amber-300 ring-amber-500/30";
    timerLabel = "PHASE PAUSED";
    showDigits = true;
  } else if (p.timer_status === "completed") {
    statusBadgeLabel = "Completed";
    statusColor = "bg-blue-500/20 text-blue-300 ring-blue-500/30";
    timerLabel = "PHASE STATUS";
    timerLabelValue = "PHASE COMPLETED";
    showDigits = false;
  } else if (p.timer_status === "closed") {
    statusBadgeLabel = "Closed";
    statusColor = "bg-rose-500/20 text-rose-300 ring-rose-500/30";
    timerLabel = "PHASE STATUS";
    timerLabelValue = "PHASE CLOSED";
    showDigits = false;
  } else if (p.timer_status === "upcoming") {
    statusBadgeLabel = "Upcoming";
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

  return (
    <section className="bg-primary py-6 border-b border-white/5">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className={`rounded-3xl border ${accentBorderClass} bg-slate-900/60 p-5 md:p-6 backdrop-blur-sm shadow-2xl relative overflow-hidden`}>
          {/* Accent gradient glow */}
          <div className={`absolute top-0 right-0 -mt-20 -mr-20 h-40 w-40 rounded-full blur-3xl opacity-20 ${accentGlowClass}`}></div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activePhase}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col text-center"
            >
              {/* Header Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3 mb-4">
                <span className="text-xs font-bold text-slate-400 tracking-wider">
                  PHASE {p.phase_number} • {p.name.toUpperCase()}
                </span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${statusColor}`}>
                  ● {statusBadgeLabel.toUpperCase()}
                </span>
              </div>

              {/* Description / Purpose */}
              <p className="text-sm text-blue-100/90 max-w-2xl mx-auto leading-relaxed mb-4">
                {purposeText}
              </p>

              {/* Countdown Label */}
              <p className={`text-[10px] font-bold uppercase tracking-widest ${accentTextClass} mb-2`}>
                {timerLabel}
              </p>

              {/* Very Large Countdown */}
              {showDigits && countdown ? (
                <div className="font-mono text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight leading-none mb-3">
                  {`${String(countdown.days).padStart(2, '0')}d : ` +
                   `${String(countdown.hours).padStart(2, '0')}h : ` +
                   `${String(countdown.minutes).padStart(2, '0')}m : ` +
                   `${String(countdown.seconds).padStart(2, '0')}s`}
                </div>
              ) : (
                <div className="font-heading text-2xl sm:text-3xl font-bold text-white uppercase tracking-wider mb-3">
                  {timerLabelValue}
                </div>
              )}

              {/* Supporting details: Duration + Upcoming began */}
              <div className="flex flex-col items-center justify-center gap-1.5 text-xs text-slate-400 font-medium">
                <div>
                  Duration: <span className="text-white font-semibold">{durationText}</span>
                </div>
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
              onClick={handlePrevPhase}
              className="flex items-center gap-1 hover:text-white transition cursor-pointer text-xs md:text-sm font-bold bg-white/5 hover:bg-white/10 px-3.5 py-1.5 rounded-full border border-white/5"
            >
              ← Previous
            </button>
            <span className="font-mono text-xs md:text-sm text-amber-300 font-bold bg-amber-400/10 px-4 py-1.5 rounded-full border border-amber-400/20">
              {activePhase + 1} / 3
            </span>
            <button
              type="button"
              onClick={handleNextPhase}
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
