import { TAGLINE, SUB_TAGLINE } from '../data/content'

const QUICK_LINKS = [
  { label: 'About', href: '#about' },
  { label: 'Domains', href: '#domains' },
  { label: 'Journey', href: '#journey' },
  { label: 'Timeline', href: '#timeline' },
  { label: 'Registration', href: '#registration' },
  { label: 'Highlights', href: '#highlights' },
  { label: 'Eligibility', href: '#eligibility' },
  { label: 'Features', href: '#features' },
  { label: 'Judging', href: '#judging' },
  { label: 'Program Flow', href: '#program-flow' },
  { label: 'Incubation', href: '#incubation' },
]

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="font-heading text-xl font-bold text-white">
              IPL<span className="text-accent">2026</span>
            </p>
            <p className="mt-2 text-sm text-amber-300">{TAGLINE}</p>
            <p className="mt-1 text-xs text-slate-400">{SUB_TAGLINE}</p>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              Empowering engineers to transform innovative ideas into products that solve
              real-world problems and drive meaningful impact.
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Quick Links</h3>
            <ul className="grid grid-cols-2 gap-2">
              {QUICK_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-sm transition-colors hover:text-accent">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Contact</h3>
            <ul className="space-y-2 text-sm">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white">Convener</h4>
              <hr />
            <li>
                <span className="text-slate-500">Email:</span>{' '}
                <a href="mailto:gokul.a2024mech@sece.ac.in" className="transition-colors hover:text-accent">
                  hodmech@sece.ac.in
                </a>
              </li>        
              <li>
                <span className="text-slate-500">College:</span>{' '}
                Sri Eshwar College of Engineering
              </li>
              
            </ul>
            <ul className="space-y-2 text-sm">
            <h4 className=" mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-white">Faculty Coordinator</h4>
              <hr />
            <li>
                <span className="text-slate-500">Email:</span>{' '}
                <a href="mailto:gokul.a2024mech@sece.ac.in" className="transition-colors hover:text-accent">
                  gowtham.s@sece.ac.in
                </a>
              </li>
              <li>
                <span className="text-slate-500">Phone:</span>{' '}
                <a href="tel:6381305506" className="transition-colors hover:text-accent">
                  9659399667
                </a>
              </li>
              <li>
                <span className="text-slate-500">College:</span>{' '}
                Sri Eshwar College of Engineering
              </li>
            </ul>
            <ul className="space-y-2 text-sm">
            <h4 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-white">Student Coordinator</h4>
            <hr />
            <li>
                <span className="text-slate-500">Email:</span>{' '}
                <a href="mailto:gokul.a2024mech@sece.ac.in" className="transition-colors hover:text-accent">
                  gokul.a2024mech@sece.ac.in
                </a>
              </li>
              <li>
                <span className="text-slate-500">Phone:</span>{' '}
                <a href="tel:6381305506" className="transition-colors hover:text-accent">
                  6381305506
                </a>
              </li>
              <li>
                <span className="text-slate-500">College:</span>{' '}
                Sri Eshwar College of Engineering
              </li>
              
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-slate-800 pt-8 text-center text-xs text-slate-500">
          © 2026 IPL – Innovative Product League. All Rights Reserved.
        </div>
      </div>
    </footer>
  )
}
