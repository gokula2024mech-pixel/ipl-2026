import {
  Factory,
  Bot,
  Brain,
  Wifi,
  Zap,
  Leaf,
  Sprout,
  HeartPulse,
  Building2,
  Lightbulb,
} from 'lucide-react'
import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'
import { DOMAINS } from '../data/content'

const ICON_MAP = {
  Factory,
  Bot,
  Brain,
  Wifi,
  Zap,
  Leaf,
  Sprout,
  HeartPulse,
  Building2,
  Lightbulb,
}

export default function Domains() {
  return (
    <section id="domains" className="bg-slate-50 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Innovation Domains"
          title="10+ Areas to Innovate"
          subtitle="Choose a domain that matches your passion and expertise."
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {DOMAINS.map(({ title, description, icon }, i) => {
            const Icon = ICON_MAP[icon]
            return (
              <SectionReveal key={title} delay={(i % 5) * 0.06}>
                <article className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg">
                  <div className="mb-3 inline-flex rounded-lg bg-primary/10 p-2.5 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                    <Icon size={20} aria-hidden="true" />
                  </div>
                  <h3 className="font-heading text-sm font-bold leading-snug text-slate-900">{title}</h3>
                  <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-600">{description}</p>
                </article>
              </SectionReveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
