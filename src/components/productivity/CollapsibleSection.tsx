import React, { PropsWithChildren, useState } from 'react'

export type CollapsibleSectionProps = PropsWithChildren<{
  title: string
  defaultOpen?: boolean
  tooltip?: string
}>

export function CollapsibleSection({ title, defaultOpen = true, tooltip, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className={`productivity-section ${open ? 'open' : 'collapsed'}`}>
      <header className="productivity-section__header">
        <div className="productivity-section__title" title={tooltip}>
          {title}
        </div>
        <button
          type="button"
          className="productivity-section__toggle"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="sr-only">Toggle {title}</span>
          <div className={`chevron ${open ? 'chevron--open' : ''}`} />
        </button>
      </header>
      <div className="productivity-section__body">{open ? children : null}</div>
    </section>
  )
}
