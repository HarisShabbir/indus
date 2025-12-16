import React, { PropsWithChildren, useState } from 'react'

export type CollapsibleSectionProps = PropsWithChildren<{
  title: string
  defaultOpen?: boolean
  tooltip?: string
}>

export function CollapsibleSection({ title, defaultOpen = true, tooltip, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
console.log(open,children,'open openopen')
  return (
    <section className={`productivity-section ${open ? 'open' : 'collapsed'}`}>
      <header
        className="productivity-section__header"
        onClick={() => setOpen((prev) => !prev)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((prev) => !prev)
          }
        }}
      >
        <div className="productivity-section__title" title={tooltip}>
          {title}
        </div>
        <div
          className="productivity-section__toggle"
          aria-expanded={open}
        >
          <span className="sr-only">Toggle {title}</span>
          <div className={`chevron ${open ? 'chevron--open' : ''}`} />
        </div>
      </header>
      <div className="productivity-section__body">{open ? children : null}</div>
    </section>
  )
}
