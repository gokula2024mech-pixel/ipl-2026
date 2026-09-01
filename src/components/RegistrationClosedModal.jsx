import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, Clock, Rocket, Zap, Lightbulb, Coffee } from 'lucide-react'

const FUNNY_QUOTES = [
  {
    quote: "Time's up, champ! Even lightning takes a break. ⚡😎",
    sub: "Great ideas never expire, but deadlines do! Catch you in the next edition.",
    icon: Zap
  },
  {
    quote: "The innovation rocket has launched! 🚀😉",
    sub: "Looks like you missed the countdown, but keep building for the next launch!",
    icon: Rocket
  },
  {
    quote: "Innovation never sleeps, but registrations do! 🧠💡",
    sub: "Our intake gates are resting. Rest your eyes and refine your next breakthrough!",
    icon: Lightbulb
  },
  {
    quote: "Better luck next time, future innovator! 🏆✌️",
    sub: "The stadium gates are locked for this round. Keep that inventor spirit roaring!",
    icon: Sparkles
  },
  {
    quote: "Deadline missed? Don't worry, your next big idea is waiting! 😄",
    sub: "Every master innovator has missed a train. Next stop: IPL 2027!",
    icon: Coffee
  },
  {
    quote: "Looks like you missed the innovation train! 🚂💨",
    sub: "The whistle blew and the wheels are rolling. Stay tuned for phase updates!",
    icon: Clock
  }
]

export default function RegistrationClosedModal({ isOpen, onClose }) {
  const [activeItem, setActiveItem] = useState(FUNNY_QUOTES[0])

  useEffect(() => {
    if (isOpen) {
      const randomIndex = Math.floor(Math.random() * FUNNY_QUOTES.length)
      setActiveItem(FUNNY_QUOTES[randomIndex])
    }
  }, [isOpen])

  if (!isOpen) return null

  const IconComponent = activeItem.icon

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm transition-opacity"
        />

        {/* Modal Dialog Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-10 my-auto text-center"
        >
          {/* Header Banner Background */}
          <div className="relative bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 px-6 pt-10 pb-16 text-white overflow-hidden">
            {/* Background Decorative Rings */}
            <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10 blur-xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full bg-black/10 blur-xl pointer-events-none" />

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition cursor-pointer"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            {/* Playful Floating Character Icon Container */}
            <motion.div
              animate={{
                y: [0, -6, 0],
                rotate: [0, 4, -4, 0]
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
              className="w-20 h-20 mx-auto rounded-2xl bg-white shadow-xl flex items-center justify-center text-amber-500 relative border-2 border-white/80"
            >
              <span className="text-4xl select-none" role="img" aria-label="Sleepy Clock">
                😴
              </span>
              <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center shadow-md">
                <Clock size={14} />
              </div>
            </motion.div>

            <h3 className="text-xl sm:text-2xl font-black mt-4 tracking-tight">
              Oops! Registration is Closed! 😴
            </h3>
            <p className="text-xs font-semibold text-amber-100 mt-1">
              IPL 2026 Team Intake Period Has Ended
            </p>
          </div>

          {/* Body Content */}
          <div className="px-6 py-6 sm:px-8 sm:py-7 -mt-6 bg-white rounded-t-3xl relative space-y-5">
            {/* Highlighted Quote Bubble */}
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2 shadow-2xs">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                <IconComponent size={12} className="shrink-0" />
                <span>Notice</span>
              </div>
              <p className="text-sm sm:text-base font-black text-slate-800 leading-snug">
                "{activeItem.quote}"
              </p>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                {activeItem.sub}
              </p>
            </div>

            {/* Cheerful Informative Note */}
            <div className="text-xs text-slate-500 font-medium space-y-1">
              <p>Great ideas don't wait, but registrations do! 😉</p>
              <p className="text-[11px] text-slate-400">
                If the organizers reopen the window, the register button will activate automatically.
              </p>
            </div>

            {/* Action Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3.5 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white font-bold text-sm transition-all shadow-md cursor-pointer select-none"
            >
              Got it
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
