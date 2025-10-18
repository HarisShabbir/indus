import React from 'react'

export type BreadcrumbItem = {
  label: string
  onClick?: () => void
  href?: string
  isCurrent?: boolean
}

type BreadcrumbsProps = {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav className={`breadcrumbs ${className ?? ''}`} aria-label="Breadcrumb trail">
      {items.map((item, index) => {
        const isLast = index === items.length - 1 || item.isCurrent
        const handleClick = (event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
          if (item.onClick) {
            event.preventDefault()
            item.onClick()
          }
        }

        const commonProps = {
          className: `breadcrumbs-link ${isLast ? 'current' : ''}`,
          onClick: handleClick,
          'aria-current': isLast ? 'page' : undefined,
        }

        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 && (
              <span className="breadcrumbs-separator" aria-hidden>
                ›
              </span>
            )}
            {item.href && !item.onClick ? (
              <a href={item.href} {...commonProps}>
                {item.label}
              </a>
            ) : (
              <button type="button" {...commonProps}>
                {item.label}
              </button>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}

export default Breadcrumbs
