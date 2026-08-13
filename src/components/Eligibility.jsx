import { GraduationCap, UserCheck, Users, UserCog } from 'lucide-react'
import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'

const CRITERIA = [
  {
    icon: GraduationCap,
    title: 'Departments',
    value: 'All Engineering',
    description: 'Open to students from every engineering discipline.',
  },
  {
    icon: UserCheck,
    title: 'Eligible Students',
    value: 'Undergraduate (UG)',
    description: 'Currently enrolled UG engineering students.',
  },
  {
    icon: Users,
    title: 'Team Size',
    value: '3–4 Members',
    description: 'Form a balanced team with complementary skills.',
  },
  {
    icon: UserCog,
    title: 'Faculty Mentor',
    value: 'Mandatory',
    description: 'Every team must have an assigned faculty mentor.',
  },
]

export default function Eligibility() {
  return (
    <section id="eligibility" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Eligibility"
          title="Who Can Participate?"
          subtitle="Bring your team, your mentor, and your best idea."
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CRITERIA.map(({ icon: Icon, title, value, description }, i) => (
            <SectionReveal key={title} delay={i * 0.08}>
              <article className="group h-full rounded-2xl border border-slate-200 bg-slate-50 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:shadow-lg">
                <div className="mb-4 inline-flex rounded-xl bg-accent/10 p-3 text-accent">
                  <Icon size={24} aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</p>
                <h3 className="mt-1 font-heading text-xl font-bold text-slate-900">{value}</h3>
                <p className="mt-2 text-sm text-slate-600">{description}</p>
              </article>
            </SectionReveal>
          ))}
        </div>

        <SectionReveal className="mx-auto mt-12 max-w-3xl text-center">
          <p className="text-base leading-relaxed text-slate-600 md:text-lg">
            Teams are encouraged to collaborate across departments and bring diverse perspectives
            combining hardware, software, design, and business skills to solve real-world problems
            together.
          </p>
        </SectionReveal>
      </div>
    </section>
  )
}
