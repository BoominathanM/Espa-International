import React from 'react'
import { motion } from 'framer-motion'

const cardEase = [0.25, 0.46, 0.45, 0.94]

/**
 * Themed card with optional staggered fade-up entrance.
 */
export default function ContentCard({
  children,
  className = '',
  innerClassName = '',
  compact = false,
  staggerIndex = 0,
  animate = true,
  hoverLift = true,
}) {
  const delay = animate ? Math.min(staggerIndex * 0.06, 0.24) : 0
  return (
    <motion.div
      className={`ds-content-card ${hoverLift ? '' : 'ds-content-card--no-hover-lift'} ${className}`.trim()}
      initial={animate ? { opacity: 0, y: 14 } : false}
      animate={animate ? { opacity: 1, y: 0 } : false}
      transition={{ duration: 0.38, ease: cardEase, delay }}
    >
      <div
        className={`${compact ? 'ds-content-card__inner--compact' : 'ds-content-card__inner'} ${innerClassName}`.trim()}
      >
        {children}
      </div>
    </motion.div>
  )
}
