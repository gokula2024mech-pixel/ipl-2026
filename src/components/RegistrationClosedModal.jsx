import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import megaphoneIllustration from '../assets/registration-closed-megaphone.png'

const SHORT_QUOTES = [
  "Great ideas deserve great timing. ⏰",
  "Your idea arrived… the deadline didn't wait! 😴",
  "Too late this time, innovator! 🚀",
  "The deadline won this round. 😅",
  "Save that brilliant idea for the next round! 💡",
  "Your innovation is ready. The window isn't! ⏰",
  "Missed the deadline, not the opportunity! 🚀",
  "Next round. Bigger idea. Better timing. 😎"
]

export default function RegistrationClosedModal({ isOpen, onClose }) {
  const [quoteIndex, setQuoteIndex] = useState(0)
  const openCountRef = useRef(0)

  useEffect(() => {
    if (isOpen) {
      setQuoteIndex(openCountRef.current % SHORT_QUOTES.length)
      openCountRef.current += 1
    }
  }, [isOpen])

  if (!isOpen) return null

  const currentQuote = SHORT_QUOTES[quoteIndex] || SHORT_QUOTES[0]

  return (
    <AnimatePresence>
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="reg-closed-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      >
        {/* Dark semi-transparent background overlay with subtle blur (45-60% opacity) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs transition-opacity"
        />

        {/* Modal Dialog Card (Desktop: 680-740px, Mobile: calc(100% - 24px)) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 16 }}
          transition={{ type: 'spring', damping: 26, stiffness: 360 }}
          className="relative w-[calc(100%-24px)] sm:w-full max-w-[700px] bg-white rounded-[22px] shadow-2xl border border-slate-100 p-5 sm:p-8 z-10 text-left overflow-hidden select-none my-auto"
        >
          {/* Top-Right "×" Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer z-20"
            aria-label="Close"
          >
            <X size={20} />
          </button>

          {/* Main Layout: Left Illustration (45-50%) & Right Content (50-55%) */}
          <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-8 pt-1">
            {/* Left Side: Hero Megaphone/Team Illustration */}
            <div className="w-full sm:w-[48%] shrink-0 flex items-center justify-center">
              <motion.div
                animate={{
                  y: [0, -4, 0]
                }}
                transition={{
                  duration: 2.8,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
                className="w-full flex items-center justify-center"
              >
                <img
                  src={megaphoneIllustration}
                  alt="Team announcement with megaphone illustration"
                  className="w-[75%] sm:w-full h-auto max-h-[170px] sm:max-h-[270px] object-contain drop-shadow-sm select-none pointer-events-none"
                />
              </motion.div>
            </div>

            {/* Right Side: Clean, Spacious Information Content */}
            <div className="w-full sm:w-[52%] flex flex-col justify-center space-y-3 sm:space-y-4 text-center sm:text-left pr-0 sm:pr-2">
              {/* Small Label */}
              <div className="self-center sm:self-start">
                <span className="text-[11px] font-black text-red-600 uppercase tracking-widest block">
                  REGISTRATION CLOSED
                </span>
              </div>

              {/* Main Heading */}
              <h3 
                id="reg-closed-title"
                className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight"
              >
                Oops… Too Late! 😴
              </h3>

              {/* Prominent Rotating Quote (No quotation marks, 18-20px font-semibold, line-height 1.4) */}
              <p className="text-base sm:text-lg lg:text-[19px] font-semibold text-slate-800 leading-snug sm:leading-snug max-w-[330px] mx-auto sm:mx-0 py-0.5">
                {currentQuote}
              </p>

              {/* Final Message */}
              <p className="text-xs sm:text-sm font-bold text-accent tracking-wide pt-0.5">
                See you in the IPL 2027!
              </p>

              {/* Action Button */}
              <div className="pt-2 sm:pt-3 flex justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto min-w-[140px] py-2.5 sm:py-3 px-8 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-sm tracking-wide shadow-md hover:shadow-lg transition-all duration-150 cursor-pointer text-center"
                >
                  Got it!
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
