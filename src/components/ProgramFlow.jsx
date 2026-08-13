import { ArrowDown } from 'lucide-react'
import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'
import { PROGRAM_FLOW_STEPS } from '../data/content'

export default function ProgramFlow() {
  return (
    <section id="program-flow" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Program Flow"
          title="From Registration to Incubation"
          subtitle="The complete 12-step journey every IPL team follows."
        />

        <SectionReveal className="mx-auto max-w-lg">
          <ol className="relative space-y-0">
            {PROGRAM_FLOW_STEPS.map((step, i) => (
              <li key={step} className="relative flex flex-col items-center">
                <div className="flex w-full items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white shadow-md">
                    {i + 1}
                  </div>
                  <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 transition-all hover:border-primary/30 hover:shadow-md">
                    {step}
                  </div>
                </div>
                {i < PROGRAM_FLOW_STEPS.length - 1 && (
                  <ArrowDown
                    size={20}
                    className="my-1 text-primary/40"
                    aria-hidden="true"
                  />
                )}
              </li>
            ))}
          </ol>
        </SectionReveal>
      </div>
    </section>
  )
}
