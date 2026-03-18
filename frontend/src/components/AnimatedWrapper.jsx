import { motion } from 'framer-motion'

const ease = [0.25, 0.46, 0.45, 0.94]

/**
 * @param {'fadeUp' | 'page'} variant — page: route transition; fadeUp: cards/sections
 */
export default function AnimatedWrapper({ children, variant = 'fadeUp', className, style }) {
  if (variant === 'page') {
    return (
      <motion.div
        className={className}
        style={style}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
        transition={{ duration: 0.35, ease }}
      >
        {children}
      </motion.div>
    )
  }
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.4, ease }}
    >
      {children}
    </motion.div>
  )
}
