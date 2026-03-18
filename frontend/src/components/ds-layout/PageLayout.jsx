import React from 'react'

/**
 * Standard page shell: vertical stack with design-system gap.
 */
export default function PageLayout({ children, className = '' }) {
  return <div className={`ds-page-layout ${className}`.trim()}>{children}</div>
}
