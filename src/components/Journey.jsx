import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'
import { PHASES } from '../data/content'
import { supabase } from '../supabaseClient'

export default function Journey() {
  const [activePhase, setActivePhase] = useState(0)
  const [dbPhases, setDbPhases] = useState([])
  const [countdownStates, setCountdownStates] = useState({})

  const phase = PHASES[activePhase]

  // Load phases on component mount
  useEffect(() => {
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
        console.error("Error loading public phases:", err);
      }
    };
    fetchPhases();
  }, []);

  // Local ticker countdown
  useEffect(() => {
    if (dbPhases.length === 0) return;

    const timer = setInterval(() => {
      const newStates = {};
      let needsRefresh = false;

      dbPhases.forEach((p) => {
        if (p.is_timer_running && p.scheduled_end_at) {
          const end = new Date(p.scheduled_end_at).getTime();
          let diff = end - Date.now();
          if (p.is_timer_paused && p.remaining_seconds) {
            diff = Number(p.remaining_seconds) * 1000;
          }

          if (diff <= 0) {
            newStates[p.id] = { days: 0, hours: 0, minutes: 0, seconds: 0, statusText: "Completed", isOver: true };
            if (p.timer_status === "running") {
              p.timer_status = "completed";
              p.is_timer_running = false;
              p.is_timer_paused = false;
              needsRefresh = true;
              // Note: We do NOT write to Supabase here because anonymous users cannot write to the DB.
            }
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
          {/* Phase Timers Dashboard */}
          {dbPhases.length > 0 && (
            <div className="mb-12 grid gap-6 sm:grid-cols-3">
              {dbPhases.map((p) => {
                const countdown = countdownStates[p.id];
                let statusLabel = "Upcoming";
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
                } else if (p.timer_status === "paused") {
                  statusLabel = "Paused";
                  statusColor = "bg-amber-500/20 text-amber-300 ring-amber-500/30";
                } else if (p.timer_status === "completed") {
                  statusLabel = "Completed";
                  statusColor = "bg-blue-500/20 text-blue-300 ring-blue-500/30";
                } else if (p.timer_status === "closed") {
                  statusLabel = "Closed";
                  statusColor = "bg-rose-500/20 text-rose-300 ring-rose-500/30";
                }

                return (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur-sm"
                  >
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Phase {p.phase_number}</p>
                    <h4 className="mt-1 font-heading text-lg font-bold text-white truncate">{p.name}</h4>

                    <div className="mt-3 flex justify-center">
                      <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>

                    <p className="mt-4 font-mono text-lg font-bold text-white tracking-widest">
                      {countdown && (p.timer_status === "running" || p.timer_status === "paused") ? (
                        `${String(countdown.days).padStart(2, "0")}d : ` +
                        `${String(countdown.hours).padStart(2, "0")}h : ` +
                        `${String(countdown.minutes).padStart(2, "0")}m : ` +
                        `${String(countdown.seconds).padStart(2, "0")}s`
                      ) : p.timer_status === "completed" ? (
                        "Completed"
                      ) : p.timer_status === "closed" ? (
                        "Closed"
                      ) : (
                        "Upcoming"
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

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
