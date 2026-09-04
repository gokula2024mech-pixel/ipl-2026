import { TAGLINE, SUB_TAGLINE } from '../data/content'

const QUICK_LINKS = [
  { label: 'Home', href: '#' },
  { label: 'About IPL 2026', href: '#about' },
  { label: 'Domains', href: '#domains' },
  { label: 'Program Journey', href: '#journey' },
  { label: 'Timeline', href: '#timeline' },
  { label: 'Highlights', href: '#highlights' },
  { label: 'Eligibility', href: '#eligibility' },
  { label: 'Features & Benefits', href: '#features' },
  { label: 'Program Flow', href: '#program-flow' },
  { label: 'Incubation Support', href: '#incubation' },
  { label: 'Commercialization', href: '#commercialization' },
  { label: 'Leaderboard', href: '#leaderboard' },
]

function LinkedInIcon({ className = 'w-[18px] h-[18px]' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451c.979 0 1.778-.773 1.778-1.729V1.73C24 .774 23.205 0 22.225 0z" />
    </svg>
  )
}

export default function Footer({ onNavClick }) {
  const handleQuickLink = (e, href) => {
    e.preventDefault()
    if (onNavClick) {
      onNavClick(href)
    }

    if (!href || href === '#') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      if (window.location.hash) {
        history.pushState(null, '', window.location.pathname)
      }
      return
    }

    if (href === '#leaderboard') {
      window.location.hash = href
      window.dispatchEvent(new CustomEvent('refresh-leaderboard'))
      return
    }

    const targetId = href.startsWith('#') ? href.slice(1) : href
    const target = document.getElementById(targetId) || document.querySelector(href)

    if (target) {
      const navbarHeight = 80
      const targetPosition = target.getBoundingClientRect().top + window.scrollY - navbarHeight
      window.scrollTo({
        top: Math.max(0, targetPosition),
        behavior: 'smooth'
      })
      if (window.location.hash !== href) {
        history.pushState(null, '', href)
      }
    } else {
      setTimeout(() => {
        const deferred = document.getElementById(targetId) || document.querySelector(href)
        if (deferred) {
          const navbarHeight = 80
          const targetPosition = deferred.getBoundingClientRect().top + window.scrollY - navbarHeight
          window.scrollTo({
            top: Math.max(0, targetPosition),
            behavior: 'smooth'
          })
        }
      }, 100)
      window.location.hash = href
    }
  }

  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-12 md:py-14 lg:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          
          {/* Column 1: IPL 2026 Branding */}
          <div>
            <a
              href="#"
              onClick={(e) => handleQuickLink(e, '#')}
              className="inline-block font-heading text-xl font-bold text-white hover:text-white/90 transition-colors cursor-pointer"
            >
              IPL<span className="text-accent">2026</span>
            </a>
            <p className="mt-2 text-sm font-semibold text-amber-300">{TAGLINE}</p>
            <p className="mt-1 text-xs text-slate-300 font-medium">{SUB_TAGLINE}</p>
            <p className="mt-4 text-xs leading-relaxed text-slate-400 font-medium">
              Empowering engineers to transform innovative ideas into products that solve
              real-world problems and drive meaningful impact.
            </p>

            {/* Social Media Links */}
            <div className="mt-5 flex items-center gap-3">
              <a
                href="https://www.linkedin.com/company/innovative-product-league/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                title="LinkedIn"
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-800/80 text-slate-400 hover:text-accent hover:bg-slate-800 border border-slate-700/60 hover:border-accent/40 transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
              >
                <LinkedInIcon className="w-[18px] h-[18px] fill-current" />
              </a>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-white">Quick Links</h3>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {QUICK_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    onClick={(e) => handleQuickLink(e, link.href)}
                    className="inline-block py-1 text-sm font-medium text-slate-300 transition-all duration-150 hover:text-accent hover:translate-x-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded cursor-pointer"
                  >
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
              <ul className="space-y-2 text-sm text-slate-200 font-medium mt-2">
                <li>
                  <span className="text-slate-400 font-semibold">Department:</span> Mechanical Engineering
                </li>
              </ul>
            </div>

            {/* Developed By (Under Convener) */}
            <div className="space-y-2 pt-2">
              <h4 className="text-sm font-extrabold uppercase tracking-wider text-accent font-heading">Developed By</h4>
              <hr className="border-slate-800" />
              <p className="text-base font-bold text-white mt-3">Mr. S. Sangara narayanan</p>
              <ul className="space-y-2 text-sm text-slate-200 font-medium mt-2">
                <li>
                  <span className="text-slate-400 font-semibold">Department:</span> Mechanical Engineering
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
              <ul className="space-y-2 text-sm text-slate-200 font-medium mt-2">
                <li>
                  <span className="text-slate-400 font-semibold">Department:</span> Mechanical Engineering
                </li>
                <li>
                  <span className="text-slate-400 font-semibold">Email:</span>{' '}
                  <a href="mailto:gowtham.s@sece.ac.in" className="transition-colors hover:text-accent select-all">
                    gowtham.s@sece.ac.in
                  </a>
                </li>
                <li>
                  <span className="text-slate-400 font-semibold">Phone:</span>{' '}
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
              <ul className="space-y-2 text-sm text-slate-200 font-medium mt-2">
                <li>
                  <span className="text-slate-400 font-semibold">Department:</span> Mechanical Engineering
                </li>
                <li>
                  <span className="text-slate-400 font-semibold">Email:</span>{' '}
                  <a href="mailto:gokul.a2024mech@sece.ac.in" className="transition-colors hover:text-accent select-all">
                    gokul.a2024mech@sece.ac.in
                  </a>
                </li>
                <li>
                  <span className="text-slate-400 font-semibold">Phone:</span>{' '}
                  <a href="tel:6381305506" className="transition-colors hover:text-accent">
                    6381305506
                  </a>
                </li>
              </ul>
            </div>
          </div>

        </div>

        {/* Bottom Center Institutional Line */}
        <div className="mt-12 border-t border-slate-800 pt-8 text-center text-xs sm:text-sm text-slate-400 font-medium">
          Department of Mechanical Engineering, Sri Eshwar College of Engineering, Coimbatore.
        </div>
      </div>
    </footer>
  )
}
