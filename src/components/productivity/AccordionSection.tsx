import React, { PropsWithChildren, useState } from 'react'

export type AccordionSectionProps = PropsWithChildren<{
  title: string
  defaultOpen?: boolean
  tooltip?: string
}>

export function AccordionSection({ title, defaultOpen = true, tooltip, children }: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`productivity-accordion my-4 ${open ? 'open' : ''}`}>
      <div
        className="productivity-accordion__header"
        onClick={() => setOpen((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((prev) => !prev)
          }
        }}
      >
        <div 
          className="productivity-accordion__title" 
          title={tooltip || title}
        >
          {title}
        </div>
        <div className="productivity-accordion__toggle">
          <span className="sr-only">Toggle {title}</span>
          <span className="productivity-accordion__icon">
            {open ? '−' : '+'}
          </span>
        </div>
      </div>
      {open && (
        <div className="productivity-accordion__content">
          {children}
        </div>
      )}
    </div>
  )
}
