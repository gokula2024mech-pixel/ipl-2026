import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { REGISTRATION_FORM_URL } from '../data/content'

const NAV_LINKS = [
  { label: 'About', href: '#about' },
  { label: 'Domains', href: '#domains' },
  { label: 'Journey', href: '#journey' },
  { label: 'Timeline', href: '#timeline' },
  { label: 'Register', href: '#registration' },
]

export default function Navbar({ onRegisterClick }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  // Lock page scrolling only while mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const handleRegister = (e) => {
    if (onRegisterClick) {
      e.preventDefault()
      setMobileOpen(false)
      onRegisterClick()
    }
  }

  // Handle navigation for mobile menu
  const handleMobileNav = (e, href) => {
    e.preventDefault()

    // Close mobile menu first
    setMobileOpen(false)

    // Wait for menu closing before scrolling
    setTimeout(() => {
      const target = document.querySelector(href)

      if (target) {
        const navbarHeight = 80
        const targetPosition =
          target.getBoundingClientRect().top +
          window.scrollY -
          navbarHeight

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth',
        })
      }
    }, 200)
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-white/95 shadow-lg backdrop-blur-md">
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6 lg:px-8"
        aria-label="Main navigation"
      >
        {/* ==================== LOGO ==================== */}
        <a href="#" className="flex shrink-0 items-center">
          <img
            src="/logo.png"
            alt="IPL 2026"
            className="h-10 w-auto object-contain md:h-12"
          />
        </a>

        {/* ==================== DESKTOP NAVIGATION ==================== */}
        <ul className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm font-medium text-slate-700 transition-colors hover:text-accent"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* ==================== DESKTOP REGISTER BUTTON ==================== */}
        <div className="hidden lg:block">
          <a
            href={REGISTRATION_FORM_URL}
            onClick={handleRegister}
            className="inline-flex items-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-amber-600 hover:shadow-lg"
          >
            Register Now
          </a>
        </div>

        {/* ==================== MOBILE MENU BUTTON ==================== */}
        <button
          type="button"
          className="rounded-lg p-2 text-slate-800 transition-colors hover:bg-slate-100 lg:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? (
            <X size={24} aria-hidden="true" />
          ) : (
            <Menu size={24} aria-hidden="true" />
          )}
        </button>
      </nav>

      {/* ==================== MOBILE NAVIGATION ==================== */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-slate-200 bg-white lg:hidden"
          >
            <ul className="flex flex-col gap-1 px-4 py-4">

              {/* Mobile Navigation Links */}
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={(e) => handleMobileNav(e, link.href)}
                    className="block rounded-lg px-4 py-3 text-base font-medium text-slate-700 transition-all hover:bg-slate-50 hover:text-primary active:bg-slate-100"
                  >
                    {link.label}
                  </a>
                </li>
              ))}

              {/* Mobile Register Button */}
              <li className="pt-2">
                <a
                  href={REGISTRATION_FORM_URL}
                  onClick={handleRegister}
                  className="block rounded-full bg-accent px-4 py-3 text-center text-base font-semibold text-white shadow-md transition-all hover:bg-amber-600 active:scale-[0.98]"
                >
                  Register Now
                </a>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}