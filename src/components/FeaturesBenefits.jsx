import {
  Route,
  Users,
  Wrench,
  TrendingUp,
  FileBadge,
  UserRound,
} from 'lucide-react'
import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'

const FEATURES = [
  {
    icon: Route,
    title: 'Structured 3-Phase Journey',
    description: 'A clear roadmap from ideation to commercialization with defined milestones and deliverables.',
  },
  {
    icon: Users,
    title: 'Industry Mentorship',
    description: 'Guidance from experienced mentors who help refine your concept and accelerate development.',
  },
  {
    icon: Wrench,
    title: 'Innovation Ecosystem',
    description: 'Build real product with access to labs, tools, and technical support.',
  },
  {
    icon: TrendingUp,
    title: 'Commercialization Readiness',
    description: 'Develop market positioning, business models, and go-to-market strategies alongside your product.',
  },
  {
    icon: FileBadge,
    title: 'Startup & Patent Pathways',
    description: 'Explore IP protection and startup incubation opportunities for promising innovations.',
  },
  {
    icon: UserRound,
    title: 'Personal Development',
    description: 'Grow leadership, teamwork, presentation, and problem-solving skills that employers value.',
  },
]

export default function FeaturesBenefits() {
  return (
    <section id="features" className="bg-white py-12 md:py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Features & Benefits"
          title="Why IPL Stands Out"
          subtitle="A challenge exclusively for product development & commercialization."
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }, i) => (
            <SectionReveal key={title} delay={(i % 3) * 0.08}>
              <article className="group h-full rounded-2xl border border-slate-200 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                <div className="mb-4 inline-flex rounded-xl bg-accent/10 p-3 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
                  <Icon size={22} aria-hidden="true" />
                </div>
                <h3 className="font-heading text-lg font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-700 font-normal">{description}</p>
              </article>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
