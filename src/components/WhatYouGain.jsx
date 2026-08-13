import { BookOpen, Rocket, ShieldCheck } from 'lucide-react'
import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'

const GAINS = [
  {
    icon: BookOpen,
    title: 'Domain Expertise & Mentorship',
    description:
      'Learn directly from industry experts and faculty mentors through domain specific challenges, best practices, and real-world problem-solving approaches for product development.',
  },
  {
    icon: Rocket,
    title: 'Innovation & Project Commercialization',
    description:
      'Build a product and pitch it for commercialization.',
  },
  {
    icon: ShieldCheck,
    title: 'Funding and patent support',
    description:
      'Access structured pathways to patent filing, startup funding, and commercialization.',
  },
]

export default function WhatYouGain() {
  return (
    <section
      id="gains"
      className="bg-white py-20 md:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">

        {/* Section Heading */}
        <SectionHeading
          eyebrow="What You Gain"
          title="More Than a Certificate"
          subtitle="Skills, experience, and pathways that last beyond the program."
        />

        {/* Cards */}
        <div className="grid items-stretch gap-8 md:grid-cols-3">

          {GAINS.map(
            ({ icon: Icon, title, description }, i) => (
              <SectionReveal
                key={title}
                delay={i * 0.1}
              >
                <article
                  className="
                    group
                    flex
                    h-full
                    min-h-[325px]
                    flex-col
                    rounded-2xl
                    border
                    border-slate-200
                    bg-gradient-to-b
                    from-slate-50
                    to-white
                    p-8
                    transition-all
                    duration-300
                    hover:-translate-y-1
                    hover:shadow-xl
                  "
                >

                  {/* Icon */}
                  <div
                    className="
                      mb-5
                      inline-flex
                      w-fit
                      rounded-2xl
                      bg-primary
                      p-4
                      text-white
                      shadow-lg
                      shadow-primary/20
                    "
                  >
                    <Icon
                      size={28}
                      aria-hidden="true"
                    />
                  </div>

                  {/* Title */}
                  <h3
                    className="
                      font-heading
                      text-xl
                      font-bold
                      leading-snug
                      text-slate-900
                    "
                  >
                    {title}
                  </h3>

                  {/* Description */}
                  <p
                    className="
                      mt-3
                      text-sm
                      leading-relaxed
                      text-slate-600
                    "
                  >
                    {description}
                  </p>

                </article>
              </SectionReveal>
            )
          )}

        </div>
      </div>
    </section>
  )
}