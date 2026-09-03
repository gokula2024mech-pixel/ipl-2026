import SectionReveal from './SectionReveal'

export default function SectionHeading({ eyebrow, title, subtitle, light = false }) {
  return (
    <div className="mx-auto mb-8 sm:mb-10 md:mb-12 max-w-3xl text-center">
      {eyebrow && (
        <SectionReveal delay={0} y={12} duration={0.35}>
          <p
            className={`mb-2.5 text-xs sm:text-sm font-extrabold uppercase tracking-widest ${
              light ? 'text-amber-300' : 'text-amber-600'
            }`}
          >
            {eyebrow}
          </p>
        </SectionReveal>
      )}
      <SectionReveal delay={0.06} y={16} duration={0.42}>
        <h2
          className={`font-heading text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl ${
            light ? 'text-white' : 'text-slate-900'
          }`}
        >
          {title}
        </h2>
      </SectionReveal>
      {subtitle && (
        <SectionReveal delay={0.12} y={16} duration={0.48}>
          <p
            className={`mt-3.5 text-base leading-relaxed font-medium md:text-lg ${
              light ? 'text-blue-50' : 'text-slate-700'
            }`}
          >
            {subtitle}
          </p>
        </SectionReveal>
      )}
    </div>
  )
}

