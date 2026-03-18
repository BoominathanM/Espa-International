import { Button } from 'antd'
import { motion } from 'framer-motion'

/** Ant Design Button with hover/tap scale (wraps to avoid ref issues). */
export default function MotionButton({ children, style, ...props }) {
  return (
    <motion.span whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} style={{ display: 'inline-block', ...style }}>
      <Button {...props}>{children}</Button>
    </motion.span>
  )
}
