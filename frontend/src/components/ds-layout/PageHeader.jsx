import React from 'react'
import { useResponsive } from '../../hooks/useResponsive'

/**
 * Title + optional subtitle + extra actions (right).
 */
export default function PageHeader({
  title,
  subtitle,
  extra,
  className = '',
  stackOnMobile = true,
}) {
  const { isMobile } = useResponsive()
  const stack = stackOnMobile && isMobile
  return (
    <header
      className={`ds-page-header ${stack ? 'ds-page-header--stack' : ''} ${className}`.trim()}
    >
      <div className="ds-page-header__titles">
        {typeof title === 'string' ? <h1 className="ds-page-title">{title}</h1> : title}
        {subtitle != null &&
          (typeof subtitle === 'string' ? (
            <p className="ds-page-subtitle">{subtitle}</p>
          ) : (
            subtitle
          ))}
      </div>
      {extra != null && (
        <div
          className={`ds-page-header__extra ${isMobile ? 'ds-page-header__extra--full-mobile' : ''}`.trim()}
        >
          {extra}
        </div>
      )}
    </header>
  )
}
