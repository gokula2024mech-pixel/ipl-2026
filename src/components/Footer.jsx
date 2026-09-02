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
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          
          {/* Column 1: IPL 2026 Branding */}
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

          {/* Column 2: Quick Links */}
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

          {/* Column 3: Convener & Developed By */}
          <div className="space-y-6">
            {/* Convener */}
            <div className="space-y-2">
              <h4 className="text-sm font-extrabold uppercase tracking-wider text-accent font-heading">Convener</h4>
              <hr className="border-slate-800" />
              <p className="text-base font-bold text-white mt-3">Dr. K. Suresh Kumar</p>
              <ul className="space-y-2 text-sm text-slate-300 mt-2">
                <li>
                  <span className="text-slate-400 font-medium">Department:</span> Mechanical Engineering
                </li>
              </ul>
            </div>

            {/* Developed By (Under Convener) */}
            <div className="space-y-2 pt-2">
              <h4 className="text-sm font-extrabold uppercase tracking-wider text-accent font-heading">Developed By</h4>
              <hr className="border-slate-800" />
              <p className="text-base font-bold text-white mt-3">Mr. S. Sangara narayanan</p>
              <ul className="space-y-2 text-sm text-slate-300 mt-2">
                <li>
                  <span className="text-slate-400 font-medium">Department:</span> Mechanical Engineering
                </li>
              </ul>
            </div>
          </div>

          {/* Column 4: Contact (Faculty & Student Coordinators) */}
          <div id="contact" className="space-y-6">
            <h3 className="mb-6 text-base font-bold uppercase tracking-wider text-white font-heading">Contact</h3>

            {/* Faculty Coordinator */}
            <div className="space-y-2">
              <h4 className="text-sm font-extrabold uppercase tracking-wider text-accent font-heading">Faculty Coordinator</h4>
              <hr className="border-slate-800" />
              <p className="text-base font-bold text-white mt-3">Mr. S. Gowtham</p>
              <ul className="space-y-2 text-sm text-slate-300 mt-2">
                <li>
                  <span className="text-slate-400 font-medium">Department:</span> Mechanical Engineering
                </li>
                <li>
                  <span className="text-slate-400 font-medium">Email:</span>{' '}
                  <a href="mailto:gowtham.s@sece.ac.in" className="transition-colors hover:text-accent select-all">
                    gowtham.s@sece.ac.in
                  </a>
                </li>
                <li>
                  <span className="text-slate-400 font-medium">Phone:</span>{' '}
                  <a href="tel:9659399667" className="transition-colors hover:text-accent">
                    9659399667
                  </a>
                </li>
              </ul>
            </div>

            {/* Student Coordinator */}
            <div className="space-y-2 pt-2">
              <h4 className="text-sm font-extrabold uppercase tracking-wider text-accent font-heading">Student Coordinator</h4>
              <hr className="border-slate-800" />
              <p className="text-base font-bold text-white mt-3">Mr. A. Gokul</p>
              <ul className="space-y-2 text-sm text-slate-300 mt-2">
                <li>
                  <span className="text-slate-400 font-medium">Department:</span> Mechanical Engineering
                </li>
                <li>
                  <span className="text-slate-400 font-medium">Email:</span>{' '}
                  <a href="mailto:gokul.a2024mech@sece.ac.in" className="transition-colors hover:text-accent select-all">
                    gokul.a2024mech@sece.ac.in
                  </a>
                </li>
                <li>
                  <span className="text-slate-400 font-medium">Phone:</span>{' '}
                  <a href="tel:6381305506" className="transition-colors hover:text-accent">
                    6381305506
                  </a>
                </li>
              </ul>
            </div>
          </div>

        </div>

        {/* Bottom Center Institutional Line */}
        <div className="mt-12 border-t border-slate-800 pt-8 text-center text-xs text-slate-500">
          Department of Mechanical Engineering, Sri Eshwar College of Engineering, Coimbatore.
        </div>
      </div>
    </footer>
  )
}
