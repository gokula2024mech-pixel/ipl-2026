import SectionReveal from './SectionReveal'

export default function Vision() {
  return (
    <section id="vision" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <SectionReveal className="mx-auto max-w-4xl text-center">
          <p className="mb-6 text-sm font-semibold uppercase tracking-widest text-amber-500">
            Our Vision
          </p>
          <blockquote className="relative font-heading text-2xl font-medium leading-relaxed text-slate-800 md:text-3xl lg:text-4xl">
            <span className="absolute -left-2 -top-6 text-6xl text-primary/10 md:-left-8" aria-hidden="true">
              &ldquo;
            </span>
            To empower the next generation of engineers to transform innovative ideas into products
            that solve real-world problems, drive meaningful societal impact, and shape the future
            of technology in India and beyond.
            <span className="text-primary/10" aria-hidden="true">
              &rdquo;
            </span>
          </blockquote>
        </SectionReveal>
      </div>
    </section>
  )
}
