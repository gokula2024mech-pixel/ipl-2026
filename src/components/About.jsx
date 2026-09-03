import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'

export default function About() {
  return (
    <section id="about" className="bg-white py-12 md:py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <SectionHeading
          eyebrow="About IPL"
          title="A Structured Journey from Idea to Product"
          subtitle="Not a hackathon — A rigorous, mentor-guided innovation program."
        />

        <SectionReveal className="mx-auto max-w-4xl space-y-6 text-base leading-relaxed text-slate-700 md:text-lg font-normal">
          <p>
            The <strong className="font-bold text-slate-900">Innovative Product League (IPL) 2026</strong> is
            a structured, multi-phase innovation initiative designed to guide engineering students through the complete
            product delivery lifecycle from identifying real-world problems to building working prototypes and
            presenting market ready solutions.
          </p>
          <p>
            Unlike a hackathon, IPL provides a rigorous framework spanning four weeks and three distinct phases:
            ideation and concept design, prototype development and testing, and product showcase with commercialization.
            Teams will receive structured evaluation criteria, industry mentorship, and pathways to incubation
            and patent support at every stage.
          </p>
          <p>
            IPL empowers students to move beyond classroom learning and experience what it truly means to{' '}
            <em className="font-semibold text-slate-900">Ideate, Innovate, Design, Develop, and Commercialize</em> transforming bold ideas into tangible products.
          </p>
        </SectionReveal>
      </div>
    </section>
  )
}
