import { CalendarDays, ExternalLink } from 'lucide-react'
import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'
import { REGISTRATION_FORM_URL } from '../data/content'

const ELIGIBILITY = [
  { label: 'Departments', value: 'All Engineering' },
  { label: 'Eligible Students', value: 'UG' },
  { label: 'Team Size', value: '3' },
  { label: 'Faculty Mentor', value: 'Mandatory' },
]

export default function Registration({ onRegisterClick }) {
  const handleRegister = (e) => {
    if (onRegisterClick) {
      e.preventDefault()
      onRegisterClick()
    }
  }

  return (
    <section id="registration" className="bg-slate-50 py-20 md:py-28">
      <div className="mx-auto max-w-2xl px-4 md:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Registration"
          title="Register Your Team"
          subtitle="Join IPL 2026 and start your innovation journey."
        />

        <SectionReveal>
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm md:p-10">
            <div className="mb-8 flex items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-6 py-4">
              <CalendarDays size={28} className="text-accent" aria-hidden="true" />
              <p className="text-base font-semibold text-slate-800 md:text-lg">
                Registration opens on{' '}
                <span className="font-heading text-xl text-primary md:text-2xl">18-Aug-2026</span>
              </p>
            </div>

            <div className="mb-8 rounded-xl border border-slate-200 bg-slate-50 p-6 text-left">
              <p className="mb-4 text-center font-heading text-lg font-bold text-slate-900">
                Eligibility Recap
              </p>
              <ul className="space-y-3">
                {ELIGIBILITY.map(({ label, value }) => (
                  <li
                    key={label}
                    className="flex items-center justify-between rounded-lg bg-white px-4 py-3 text-sm"
                  >
                    <span className="font-medium text-slate-600">{label}</span>
                    <span className="font-semibold text-slate-900">{value}</span>
                  </li>
                ))}
              </ul>
            </div>

            <a
              href={REGISTRATION_FORM_URL}
              onClick={handleRegister}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-10 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-amber-600 hover:shadow-xl"
            >
              Register Now
              <ExternalLink size={20} aria-hidden="true" />
            </a>
          </div>
        </SectionReveal>
      </div>
    </section>
  )
}
