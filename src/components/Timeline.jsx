import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'
import { TIMELINE_EVENTS } from '../data/content'

export default function Timeline() {
  return (
    <section id="timeline" className="bg-slate-50 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Timeline"
          title="Your 4-Week Journey"
          subtitle="Key milestones from registration to the final expo."
        />

        <div className="relative mx-auto max-w-4xl">

          {/* Timeline vertical line */}
          <div
            className="absolute left-4 top-0 hidden h-full w-0.5 bg-primary/20 md:left-1/2 md:block md:-translate-x-px"
            aria-hidden="true"
          />

          {TIMELINE_EVENTS.map((event, i) => {
            const isLeft = i % 2 === 0

            return (
              <SectionReveal
                key={event.title}
                delay={i * 0.08}
              >
                <div
                  className={`relative mb-10 flex flex-col md:mb-12 md:flex-row ${
                    isLeft ? 'md:flex-row-reverse' : ''
                  }`}
                >

                  {/* Empty side */}
                  <div className="hidden w-1/2 md:block" />

                  {/* Desktop timeline dot */}
                  <div
                    className="absolute left-4 top-6 z-10 hidden h-4 w-4 -translate-x-1/2 rounded-full border-4 border-white bg-accent shadow-md md:left-1/2 md:block"
                    aria-hidden="true"
                  />

                  {/* Timeline content */}
                  <div
                    className={`w-full pl-12 md:w-1/2 md:pl-0 ${
                      isLeft
                        ? 'md:pr-12 md:text-right'
                        : 'md:pl-12 md:text-left'
                    }`}
                  >
                    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">

                      {/* Date */}
                      <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                        {event.date}
                      </span>

                      {/* Existing title */}
                      <h3 className="mt-3 font-heading text-lg font-bold text-slate-900">
                        {event.title}
                      </h3>

                      {/* Existing description */}
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        {event.description}
                      </p>

                      {/* Patent / IP information */}
                      {event.patentTitle && (
                        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">

                          {/* Phase */}
                          <div className="text-xs font-bold tracking-wider text-amber-600">
                            {event.patentPhase}
                          </div>

                          {/* Patent title */}
                          <div className="mt-2 flex items-center gap-3">
                            <span className="flex-shrink-0 text-xl leading-none">
                              {event.patentIcon}
                            </span>

                            <span className="text-sm font-bold text-slate-900">
                              {event.patentTitle}
                            </span>
                          </div>

                          {/* Patent description */}
                          <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
                            {event.patentDescription}
                          </p>
                        </div>
                      )}
                    </article>
                  </div>

                  {/* Mobile timeline dot */}
                  <div
                    className="absolute left-0 top-6 z-10 h-4 w-4 rounded-full border-4 border-white bg-accent shadow-md md:hidden"
                    aria-hidden="true"
                  />

                </div>
              </SectionReveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}