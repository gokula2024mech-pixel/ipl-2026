import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { REGISTRATION_FORM_URL } from '../data/content'
import { supabase } from '../supabaseClient'

const NAV_LINKS = [
  { label: 'About', href: '#about' },
  { label: 'Domains', href: '#domains' },
  { label: 'Journey', href: '#journey' },
  { label: 'Timeline', href: '#timeline' },
  { label: 'Leaderboard', href: '#leaderboard' },
  { label: 'Contact', href: '#contact' },
]



const MOBILE_NAV_LINKS = [
  { label: 'Home', href: '#' },
  { label: 'About IPL 2026', href: '#about' },
  { label: 'Program Details', href: '#journey' },
  { label: 'Timeline', href: '#timeline' },
  { label: 'Domains', href: '#domains' },
  { label: 'Guidelines', href: '#eligibility' },
  { label: 'FAQs', href: '#' },
  { label: 'Contact Us', href: '#contact' },
]

export default function Navbar({ onRegisterClick, user, profile, onProfileUpdate, onMySubmissionsClick, timeLeft: _timeLeft, onReturnToAdmin }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(profile?.name || '')
  const [saving, setSaving] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [imageError, setImageError] = useState(false)

  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || profile?.avatar_url

  // Reset image error state when avatar changes
  useEffect(() => {
    setImageError(false)
  }, [avatarUrl])

  // Lock page scrolling only while mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    // Notify application about mobile menu state
    window.dispatchEvent(new CustomEvent('mobile-menu-state', { detail: mobileOpen }))

    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  // Notify application about profile dropdown state
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('profile-dropdown-state', { detail: { open: profileDropdownOpen } }))
  }, [profileDropdownOpen])

  // Lock page scrolling when name-change confirmation modal is open
  useEffect(() => {
    if (showConfirmModal) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [showConfirmModal])

  // Synchronize editName state when profile updates
  useEffect(() => {
    if (profile?.name) {
      setEditName(profile.name)
    } else if (user?.user_metadata?.full_name) {
      setEditName(user.user_metadata.full_name)
    }
  }, [profile, user])

  // Handle click away to close dropdown
  useEffect(() => {
    if (!profileDropdownOpen) return

    const handleClickAway = (e) => {
      if (profileDropdownOpen && !e.target.closest('.profile-dropdown-container')) {
        setProfileDropdownOpen(false)
        setIsEditing(false)
      }
    }

    document.addEventListener('mousedown', handleClickAway)
    document.addEventListener('touchstart', handleClickAway)
    return () => {
      document.removeEventListener('mousedown', handleClickAway)
      document.removeEventListener('touchstart', handleClickAway)
    }
  }, [profileDropdownOpen])

  const handleSaveName = () => {
    if (!editName.trim()) {
      alert('Name cannot be empty')
      return
    }
    // Close dropdown to avoid overlapping cards, and show confirmation modal
    setProfileDropdownOpen(false)
    setShowConfirmModal(true)
  }

  const handleCancelConfirm = () => {
    setShowConfirmModal(false)
    setProfileDropdownOpen(true) // Reopen dropdown
    setIsEditing(true)           // Remain in Edit mode
  }

  const handleConfirmSave = async () => {
    try {
      setSaving(true)
      const { error } = await supabase
        .from('profiles')
        .update({
          name: editName.trim(),
          name_confirmed: true,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)

      if (error) throw error

      if (onProfileUpdate) {
        await onProfileUpdate()
      }
      setIsEditing(false)
      setShowConfirmModal(false)
      setProfileDropdownOpen(true) // Reopen profile dropdown in View mode
    } catch (err) {
      console.error('Error saving profile name:', err.message || err)
      alert('Failed to save profile name: ' + (err.message || err))
    } finally {
      setSaving(false)
    }
  }

  const handleRegister = (e) => {
    if (onRegisterClick) {
      e.preventDefault()
      setMobileOpen(false)
      onRegisterClick()
    }
  }

  const handleLogout = async () => {
    try {
      setMobileOpen(false)
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Logout error:', error.message)
      }
    } catch (err) {
      console.error('Logout exception:', err)
    }
  }

  // Handle unified smooth navigation to section anchors with navbar offset
  const scrollToTarget = (href) => {
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
      window.location.hash = href
    }
  }

  const handleDesktopNav = (e, href) => {
    if (href.startsWith('#')) {
      e.preventDefault()
      scrollToTarget(href)
    }
  }

  // Handle navigation for mobile menu
  const handleMobileNav = (e, href) => {
    e.preventDefault()
    setMobileOpen(false)
    setTimeout(() => {
      scrollToTarget(href)
    }, 150)
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-white/95 shadow-lg backdrop-blur-md">
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6 lg:px-8"
        aria-label="Main navigation"
      >
        {/* ==================== LOGO ==================== */}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            scrollToTarget('#')
          }}
          className="flex shrink-0 items-center"
        >
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
                onClick={(e) => handleDesktopNav(e, link.href)}
                className="text-sm font-medium text-slate-700 transition-colors hover:text-accent"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* ==================== DESKTOP USER BANNER / REGISTER / LOGOUT ==================== */}
        <div className="hidden lg:flex items-center gap-6">
          {user ? (
            <>
              {/* Profile Avatar & Dropdown Container */}
              <div className="relative profile-dropdown-container">
                <button
                  type="button"
                  onClick={() => {
                    setProfileDropdownOpen(!profileDropdownOpen)
                    setIsEditing(false)
                    if (profile?.name) {
                      setEditName(profile.name)
                    }
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors border border-slate-200 focus:outline-none cursor-pointer overflow-hidden"
                  aria-label="Profile menu"
                >
                  {profile?.role === 'admin' ? (
                    <span className="text-xs font-bold uppercase">AD</span>
                  ) : (
                    avatarUrl && !imageError ? (
                      <img
                        src={avatarUrl}
                        alt={profile?.name || 'User Profile'}
                        onError={() => setImageError(true)}
                        className="h-full w-full object-cover rounded-full"
                      />
                    ) : (
                      <span className="text-xs font-bold uppercase">
                        {profile?.name ? profile.name.slice(0, 2) : 'US'}
                      </span>
                    )
                  )}
                </button>

                {/* Dropdown Menu */}
                {profileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-xl border border-slate-200 bg-white p-5 shadow-xl z-50 text-slate-800 text-left">
                    {profile?.role === 'admin' ? (
                      // Admin Profile Dropdown
                      <div className="space-y-4">
                        <div className="border-b border-slate-100 pb-3">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Role</p>
                          <p className="text-sm font-extrabold text-slate-900 uppercase mt-0.5">ADMINISTRATOR</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="w-full rounded-lg bg-accent py-2 text-center text-xs font-bold text-white shadow-sm hover:bg-amber-600 cursor-pointer"
                        >
                          Logout
                        </button>
                      </div>
                    ) : (
                      // Student Profile Dropdown
                      <div className="space-y-4">
                        {isEditing ? (
                          // Edit Mode
                          <>
                            <p className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Edit Profile</p>
                            <div>
                              <label htmlFor="edit-name" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Name</label>
                              <input
                                id="edit-name"
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-accent focus:outline-none"
                                placeholder="Enter your name"
                                disabled={saving}
                              />
                            </div>
                            <div>
                              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Email</p>
                              <p className="text-sm font-medium text-slate-500 mt-1 select-all break-all whitespace-normal w-full">{user.email}</p>
                            </div>
                            <div className="flex gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => setIsEditing(false)}
                                className="w-1/2 rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                                disabled={saving}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveName}
                                className="w-1/2 rounded-lg bg-accent py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-600 cursor-pointer flex items-center justify-center"
                                disabled={saving}
                              >
                                {saving ? 'Saving...' : 'Save Changes'}
                              </button>
                            </div>
                          </>
                        ) : (
                          // View Mode
                          <>
                            <p className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Profile</p>
                            <div>
                              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">Name</p>
                              <p className="text-sm font-semibold text-slate-800 mt-1.5 break-words whitespace-normal w-full">{profile?.name || 'No Name Set'}</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">Email</p>
                              <p className="text-sm font-semibold text-slate-800 mt-1.5 select-all break-all whitespace-normal w-full">{user.email}</p>
                            </div>
                            <div className="flex flex-col gap-1.5 w-full">
                              <button
                                type="button"
                                onClick={() => {
                                  setProfileDropdownOpen(false)
                                  if (onMySubmissionsClick) {
                                    onMySubmissionsClick('my_submissions')
                                  }
                                }}
                                className="w-full rounded-lg bg-accent text-white py-2.5 text-xs font-bold hover:bg-amber-600 cursor-pointer shadow-xs transition"
                              >
                                My Submissions
                              </button>
                            </div>
                            <div className="flex gap-2 pt-2 border-t border-slate-100">
                              {!profile?.name_confirmed && (
                                <button
                                  type="button"
                                  onClick={() => setIsEditing(true)}
                                  className="w-1/2 rounded-lg border border-slate-300 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={handleLogout}
                                className={`${profile?.name_confirmed ? 'w-full' : 'w-1/2'} rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs font-bold text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition cursor-pointer`}
                              >
                                Logout
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {(!profile?.registration_id && profile?.role !== 'admin') && (
                <a
                  href={REGISTRATION_FORM_URL}
                  onClick={handleRegister}
                  className="inline-flex items-center rounded-full bg-accent px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-amber-600 cursor-pointer"
                >
                  Register Team
                </a>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Logout
              </button>
            </>
          ) : (
            <a
              href={REGISTRATION_FORM_URL}
              onClick={handleRegister}
              className="inline-flex items-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-amber-600 hover:shadow-lg"
            >
              Register Now
            </a>
          )}
        </div>



        {/* ==================== MOBILE MENU BUTTON ==================== */}
        <button
          type="button"
          className="rounded-lg p-2 text-slate-800 transition-colors hover:bg-slate-100 lg:hidden shrink-0 cursor-pointer focus:outline-none"
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
              {MOBILE_NAV_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    onClick={(e) => handleMobileNav(e, link.href)}
                    className="block rounded-lg px-4 py-3 text-base font-medium text-slate-700 transition-all hover:bg-slate-50 hover:text-primary active:bg-slate-100"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              {profile?.role === 'admin' && (
                <li className="border-t border-slate-100 mt-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOpen(false)
                      if (onReturnToAdmin) {
                        onReturnToAdmin()
                      }
                    }}
                    className="w-full text-left block rounded-lg px-4 py-3 text-base font-bold text-accent transition-all hover:bg-amber-50 hover:text-amber-700 active:bg-amber-100 cursor-pointer"
                  >
                    Return to Admin Console
                  </button>
                </li>
              )}

              {/* Mobile User Section / Register / Logout */}
              {user ? (
                <li className="border-t border-slate-100 mt-3 pt-3 px-4 text-left">
                  {profile?.role === 'admin' ? (
                    <div className="mb-4">
                      <p className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                        ADMIN
                      </p>
                    </div>
                  ) : (
                    <div className="mb-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
                      {isEditing ? (
                        <div className="space-y-3">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Edit Profile</p>
                          <div>
                            <label htmlFor="mobile-edit-name" className="block text-[10px] font-bold text-slate-400 uppercase">Name</label>
                            <input
                              id="mobile-edit-name"
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 bg-white focus:border-accent focus:outline-none"
                              disabled={saving}
                            />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Email</p>
                            <p className="text-xs font-medium text-slate-500 mt-0.5 select-all break-all whitespace-normal w-full">{user.email}</p>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setIsEditing(false)}
                              className="w-1/2 rounded-lg border border-slate-200 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                              disabled={saving}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveName}
                              className="w-1/2 rounded-lg bg-accent py-1.5 text-xs font-bold text-white hover:bg-amber-600 cursor-pointer flex items-center justify-center"
                              disabled={saving}
                            >
                              {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            {/* Mobile Avatar */}
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 border border-slate-200 overflow-hidden">
                              {avatarUrl && !imageError ? (
                                <img
                                  src={avatarUrl}
                                  alt={profile?.name || 'User Profile'}
                                  onError={() => setImageError(true)}
                                  className="h-full w-full object-cover rounded-full"
                                />
                              ) : (
                                <span className="text-sm font-bold uppercase">
                                  {profile?.name ? profile.name.slice(0, 2) : 'US'}
                                </span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-accent uppercase tracking-wider">
                                {profile?.registration_id ? `Team: ${profile.registration_id}` : 'No Team Linked'}
                              </p>
                              <p className="text-sm font-semibold text-slate-800 mt-0.5 break-words whitespace-normal w-full">
                                {profile?.name || 'No Name Set'}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5 break-all whitespace-normal w-full" title={user.email}>
                                {user.email}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditing(true)
                              if (profile?.name) {
                                setEditName(profile.name)
                              }
                            }}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0 mt-0.5"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {(profile?.role !== 'admin') && (
                    <div className="flex flex-col gap-2 w-full mb-3">
                      <button
                        type="button"
                        onClick={() => {
                          setMobileOpen(false)
                          if (onMySubmissionsClick) {
                            onMySubmissionsClick('my_submissions')
                          }
                        }}
                        className="w-full rounded-xl bg-accent py-2.5 text-center text-sm font-bold text-white shadow-xs hover:bg-amber-600 cursor-pointer transition"
                      >
                        My Submissions
                      </button>
                    </div>
                  )}

                  {(!profile?.registration_id && profile?.role !== 'admin') && (
                    <a
                      href={REGISTRATION_FORM_URL}
                      onClick={handleRegister}
                      className="block rounded-full bg-accent px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition-all hover:bg-amber-600 mb-2 cursor-pointer"
                    >
                      Register Team
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-center text-sm font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer"
                  >
                    Logout
                  </button>
                </li>
              ) : (
                <li className="pt-2">
                  <a
                    href={REGISTRATION_FORM_URL}
                    onClick={handleRegister}
                    className="block rounded-full bg-accent px-4 py-3 text-center text-base font-semibold text-white shadow-md transition-all hover:bg-amber-600 active:scale-[0.98]"
                  >
                    Register Now
                  </a>
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Center Modal for Name Change Confirmation - Rendered via Portal directly into document.body */}
      {showConfirmModal && createPortal(
        <div className="fixed inset-0 z-[9999] w-screen h-screen bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 text-left relative">
            <h3 className="text-lg font-bold text-slate-900">Confirm Name Change</h3>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Your updated name will be used for your official IPL 2026 certificate.
            </p>

            <div className="mt-4 space-y-3 bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current name</p>
                <p className="text-sm font-semibold text-slate-700 mt-0.5 break-words whitespace-normal w-full">{profile?.name || 'No Name Set'}</p>
              </div>
              <div className="border-t border-slate-200/60 pt-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">New name</p>
                <p className="text-sm font-bold text-accent mt-0.5 break-words whitespace-normal w-full">{editName.trim()}</p>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-500 font-medium">
              Please make sure the name is exactly how you want it to appear.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelConfirm}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-600 cursor-pointer flex items-center justify-center min-w-[120px]"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </header>
  )
}
