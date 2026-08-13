import { motion } from 'framer-motion'

const LINES = [
  "Don't just have an idea.",
  'Identify a problem.',
  'Think of a better solution.',
  'Design it.',
  'Build it.',
  'Test it.',
  'Refine it.',
  'Showcase it.',
]

export default function Mindset() {
  return (
    <section id="mindset" className="bg-slate-900 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <p className="mb-12 text-center text-sm font-semibold uppercase tracking-widest text-amber-400">
          The IPL Mindset
        </p>

        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 md:gap-4">
          {LINES.map((line, i) => (
            <motion.p
              key={line}
              initial={{ opacity: 0, x: i % 2 === 0 ? -40 : 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              className={`font-heading text-center font-bold leading-tight text-white ${
                i === LINES.length - 1
                  ? 'text-3xl text-accent md:text-5xl'
                  : i === 0
                    ? 'text-2xl md:text-4xl'
                    : 'text-xl md:text-3xl'
              }`}
            >
              {line}
            </motion.p>
          ))}
        </div>
      </div>
    </section>
  )
}
