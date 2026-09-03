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
    <section id="mindset" className="bg-slate-900 py-12 md:py-16 lg:py-20 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <p className="mb-8 sm:mb-10 text-center text-xs sm:text-sm font-extrabold uppercase tracking-widest text-amber-400">
          The IPL Mindset
        </p>

        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2.5 sm:gap-3 md:gap-4">
          {LINES.map((line, i) => (
            <motion.p
              key={line}
              initial={{ opacity: 0, y: 14, x: i % 2 === 0 ? -16 : 16 }}
              whileInView={{ opacity: 1, y: 0, x: 0 }}
              viewport={{ once: true, amount: 0.1, margin: '-20px' }}
              transition={{ duration: 0.45, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
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
