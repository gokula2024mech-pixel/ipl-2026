import { Target, Swords, Briefcase, MousePointerClick, Telescope } from 'lucide-react'
import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'

const ITEMS = [
  {
    icon: Target,
    title: 'Market Opportunity',
    description: 'Identify and validate the market need your product addresses.',
  },
  {
    icon: Swords,
    title: 'Competitive Positioning',
    description: 'Define how your innovation stands apart from existing solutions.',
  },
  {
    icon: Briefcase,
    title: 'Business Model',
    description: 'Develop a viable revenue model and go-to-market strategy.',
  },
  {
    icon: MousePointerClick,
    title: 'Product Usability',
    description: 'Ensure your product is intuitive, accessible, and user-centered.',
  },
  {
    icon: Telescope,
    title: 'Future Scope',
    description: 'Articulate the long-term vision and scalability of your innovation.',
  },
]

export default function Commercialization() {
  return (
    <section id="commercialization" className="bg-slate-50 py-12 md:py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Commercialization"
          title="Commercialization Readiness"
          subtitle="Phase 3 prepares you to think like an entrepreneur, not just an engineer."
        />

        <div className="mx-auto grid max-w-3xl gap-4">
          {ITEMS.map(({ icon: Icon, title, description }, i) => (
            <SectionReveal key={title} delay={i * 0.06}>
              <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                <div className="rounded-lg bg-accent/10 p-2.5 text-accent">
                  <Icon size={20} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-slate-900 text-base">{title}</h3>
                  <p className="mt-1 text-sm text-slate-700 font-normal leading-relaxed">{description}</p>
                </div>
              </div>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
