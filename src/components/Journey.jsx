import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'
import { PHASES } from '../data/content'

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
