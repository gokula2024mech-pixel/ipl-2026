import { FileText, Building, Handshake, Users, Award } from 'lucide-react'
import SectionReveal from './SectionReveal'

const SUPPORT_POINTS = [
  {
    icon: FileText,
    text: 'Guidance on patent filing, IP protection, and documentation requirements.',
  },
  {
    icon: Building,
    text: 'Access to the college incubation center and its resources and facilities.',
  },
  {
    icon: Handshake,
    text: 'Startup registration support and business model development assistance.',
  },
  {
    icon: Users,
    text: 'Connections with industry partners, investors, and alumni entrepreneurs.',
  },
  {
    icon: Award,
    text: 'Post-program mentoring to help top teams continue their commercialization journey.',
  },
]

export default function IncubationSupport() {
  return (
    <section id="incubation" className="bg-primary py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <SectionReveal className="mx-auto max-w-4xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-amber-300">
            Incubation & Patent Support
          </p>
          <h2 className="font-heading text-3xl font-bold text-white md:text-4xl">
            From Prototype to Product Venture
          </h2>
          <p className="mt-4 text-blue-100">
            Top-performing teams receive dedicated support to protect, launch, and scale their innovations.
          </p>
        </SectionReveal>

        <div className="mx-auto mt-12 grid max-w-3xl gap-4">
          {SUPPORT_POINTS.map(({ icon: Icon, text }, i) => (
            <SectionReveal key={text} delay={i * 0.08}>
              <div className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                <div className="rounded-lg bg-accent/20 p-2.5 text-amber-300">
                  <Icon size={20} aria-hidden="true" />
                </div>
                <p className="text-sm leading-relaxed text-blue-100 md:text-base">{text}</p>
              </div>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
