import SectionReveal from './SectionReveal'

export default function SectionHeading({ eyebrow, title, subtitle, light = false }) {
  return (
    <SectionReveal className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
      {eyebrow && (
        <p
          className={`mb-3 text-xs sm:text-sm font-extrabold uppercase tracking-widest ${
            light ? 'text-amber-300' : 'text-amber-600'
          }`}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className={`font-heading text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl ${
          light ? 'text-white' : 'text-slate-900'
        }`}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={`mt-4 text-base leading-relaxed font-medium md:text-lg ${
            light ? 'text-blue-50' : 'text-slate-700'
          }`}
        >
          {subtitle}
        </p>
      )}
    </SectionReveal>
  )
}
