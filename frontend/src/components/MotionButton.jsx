import { Button } from 'antd'
import { motion } from 'framer-motion'

/** Ant Design Button with hover/tap scale (wraps to avoid ref issues). */
export default function MotionButton({ children, className, ...props }) {
  return (
    <motion.span
      className={`motion-btn-wrap ${className || ''}`.trim()}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <Button {...props}>{children}</Button>
    </motion.span>
  )
}
