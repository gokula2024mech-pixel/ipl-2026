import { motion } from 'framer-motion'
import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'
import { JUDGING_CRITERIA } from '../data/content'

function DonutChart({ data }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  let cumulative = 0

  const segments = data.map((item) => {
    const startAngle = (cumulative / total) * 360
    cumulative += item.value
    const endAngle = (cumulative / total) * 360
    const largeArc = endAngle - startAngle > 180 ? 1 : 0

    const toRad = (deg) => (deg * Math.PI) / 180
    const r = 80
    const cx = 100
    const cy = 100

    const x1 = cx + r * Math.cos(toRad(startAngle - 90))
    const y1 = cy + r * Math.sin(toRad(startAngle - 90))
    const x2 = cx + r * Math.cos(toRad(endAngle - 90))
    const y2 = cy + r * Math.sin(toRad(endAngle - 90))

    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`

    return { ...item, path }
  })

  return (
    <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-center">
      <svg viewBox="0 0 200 200" className="h-56 w-56 shrink-0" role="img" aria-label="Judging criteria donut chart">
        {segments.map((seg, i) => (
          <motion.path
            key={seg.label}
            d={seg.path}
            fill={seg.color}
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            transformOrigin="100 100"
          />
        ))}
        <circle cx="100" cy="100" r="48" fill="white" />
        <text x="100" y="96" textAnchor="middle" className="fill-slate-900 text-[11px] font-bold">
          Overall
        </text>
        <text x="100" y="112" textAnchor="middle" className="fill-slate-500 text-[9px]">
          Judging
        </text>
      </svg>

      <div className="w-full max-w-md space-y-4">
        {data.map(({ label, value, color }, i) => (
          <SectionReveal key={label} delay={i * 0.06}>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                  <span className="text-sm font-medium text-slate-700">{label}</span>
                </div>
                <span className="text-sm font-bold text-slate-900">{value}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${value}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.08 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: color }}
                />
              </div>
            </div>
          </SectionReveal>
        ))}
      </div>
    </div>
  )
}

export default function Judging() {
  return (
    <section id="judging" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Evaluation"
          title="Overall Judging Weightage"
          subtitle="Final evaluation balances innovation, technical rigor, usability, and presentation."
        />

        <SectionReveal>
          <DonutChart data={JUDGING_CRITERIA} />
        </SectionReveal>
      </div>
    </section>
  )
}
