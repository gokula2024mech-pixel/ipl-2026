import { Layers, Calendar, Users, Grid3X3 } from 'lucide-react'
import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'

const HIGHLIGHTS = [
  {
    icon: Layers,
    stat: '3 Phases',
    description: 'Structured journey from conceptual design to product commercialization.',
  },
  {
    icon: Calendar,
    stat: '4 Weeks',
    description: 'Intensive, focused timeline that keeps momentum high and outcomes tangible.',
  },
  {
    icon: Users,
    stat: '3 Members',
    description: 'Optimal team size for meaningful collaboration and shared ownership.',
  },
  {
    icon: Grid3X3,
    stat: '10+ Domains',
    description: 'Diversified thrust areas spanning AI, IoT, healthcare, and more.',
  },
]

export default function ProgramHighlights() {
  return (
    <section id="highlights" className="bg-slate-50 py-12 md:py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Program Highlights"
          title="Built for Serious Innovation"
          subtitle="Build your team, commercialize your product."
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {HIGHLIGHTS.map(({ icon: Icon, stat, description }, i) => (
            <SectionReveal key={stat} delay={i * 0.08}>
              <article className="group h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                <div className="mb-4 inline-flex rounded-xl bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <Icon size={24} aria-hidden="true" />
                </div>
                <h3 className="font-heading text-2xl font-bold text-slate-900">{stat}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
              </article>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
