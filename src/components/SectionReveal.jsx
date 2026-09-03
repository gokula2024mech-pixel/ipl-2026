import { motion, useReducedMotion } from 'framer-motion'

export default function SectionReveal({
  children,
  className = '',
  delay = 0,
  y = 18,
  duration = 0.45,
}) {
  const shouldReduceMotion = useReducedMotion()

  const variants = {
    hidden: {
      opacity: 0,
      y: shouldReduceMotion ? 0 : y,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0.01 : duration,
        delay: shouldReduceMotion ? 0 : delay,
        ease: [0.16, 1, 0.3, 1], // Smooth cubic-bezier acceleration/deceleration
      },
    },
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1, margin: '-20px 0px -20px 0px' }}
      variants={variants}
      className={className}
    >
      {children}
    </motion.div>
  )
}

