import React from 'react'
import { useNavigate } from 'react-router-dom'

export type BreadcrumbItem = {
  label: string
  onClick?: () => void
  href?: string
  state?: unknown
  isCurrent?: boolean
}

type BreadcrumbsProps = {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const navigate = useNavigate()

  return (
    <nav className={`breadcrumbs ${className ?? ''}`} aria-label="Breadcrumb trail">
      {items.map((item, index) => {
        const isLast = index === items.length - 1 || item.isCurrent
        const isInteractive = Boolean(item.onClick || item.href || (!isLast && item.label === 'Dashboard'))
        const handleClick = (event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
          if (item.onClick) {
            event.preventDefault()
            item.onClick()
            return
          }
          if (!item.href && item.label === 'Dashboard') {
            event.preventDefault()
            navigate('/', { state: { openView: 'dashboard' } })
          }
        }

        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 && (
              <span className="breadcrumbs-separator" aria-hidden>
                ›
              </span>
            )}
            {item.href ? (
              <a
                href={item.href}
                className={`breadcrumbs-link ${isLast ? 'current' : ''}`}
                onClick={item.onClick ? handleClick : undefined}
                aria-current={isLast ? 'page' : undefined}
              >
                {item.label}
              </a>
            ) : isInteractive ? (
              <button
                type="button"
                className={`breadcrumbs-link ${isLast ? 'current' : ''}`}
                onClick={handleClick}
                aria-current={isLast ? 'page' : undefined}
              >
                {item.label}
              </button>
            ) : (
              <span className={`breadcrumbs-link ${isLast ? 'current' : ''}`} aria-current={isLast ? 'page' : undefined}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}

export default Breadcrumbs
