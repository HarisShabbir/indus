import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const DEFAULT_MIN_SIZES: [number, number] = [480, 320]

export type MapWipSplitProps = {
  mapPane: React.ReactNode
  wipPane: React.ReactNode
  sizes: number[]
  onSizesChange: (sizes: number[]) => void
  minSizes?: [number, number]
  onDragStart?: () => void
  onDragEnd?: () => void
}

export default function MapWipSplit({
  mapPane,
  wipPane,
  sizes,
  onSizesChange,
  minSizes = DEFAULT_MIN_SIZES,
  onDragStart,
  onDragEnd,
}: MapWipSplitProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragSnapshot = useRef<{ containerHeight: number; containerTop: number }>({ containerHeight: 0, containerTop: 0 })
  const pointerTargetRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const clampSizes = useCallback(
    (percent: number) => {
      const containerHeight = dragSnapshot.current.containerHeight || containerRef.current?.getBoundingClientRect().height
      if (!containerHeight || containerHeight <= 0) {
        return sizes
      }
      const [minMapPx, minWipPx] = minSizes
      const minMapPct = Math.min(95, (minMapPx / containerHeight) * 100)
      const minWipPct = Math.min(95, (minWipPx / containerHeight) * 100)
      const clampedTop = Math.min(100 - minWipPct, Math.max(minMapPct, percent))
      const bottom = 100 - clampedTop
      return [Number(clampedTop.toFixed(2)), Number(bottom.toFixed(2))]
    },
    [minSizes, sizes],
  )

  const updateSizesFromPointer = useCallback(
    (clientY: number) => {
      const { containerHeight, containerTop } = dragSnapshot.current
      if (!containerHeight || containerHeight <= 0) {
        return
      }
      const offset = clientY - containerTop
      const rawPercent = (offset / containerHeight) * 100
      const next = clampSizes(rawPercent)
      onSizesChange(next)
    },
    [clampSizes, onSizesChange],
  )

  useEffect(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    if (!rect.height) return
    dragSnapshot.current = { containerHeight: rect.height, containerTop: rect.top }
    const [top, bottom] = sizes
    const next = clampSizes(top)
    if (next[0] !== Number(top.toFixed(2)) || next[1] !== Number(bottom.toFixed(2))) {
      onSizesChange(next)
    }
  }, [clampSizes, onSizesChange, sizes])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!containerRef.current) return
      event.preventDefault()
      const rect = containerRef.current.getBoundingClientRect()
      dragSnapshot.current = { containerHeight: rect.height, containerTop: rect.top }
      setDragging(true)
      onDragStart?.()
      pointerTargetRef.current = event.currentTarget
      event.currentTarget.setPointerCapture(event.pointerId)
      updateSizesFromPointer(event.clientY)
    },
    [onDragStart, updateSizesFromPointer],
  )

  useEffect(() => {
    if (!dragging) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      updateSizesFromPointer(event.clientY)
    }

    const handlePointerUp = (event: PointerEvent) => {
      updateSizesFromPointer(event.clientY)
      setDragging(false)
      onDragEnd?.()
      if (pointerTargetRef.current) {
        pointerTargetRef.current.releasePointerCapture(event.pointerId)
        pointerTargetRef.current = null
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [dragging, onDragEnd, updateSizesFromPointer])

  useEffect(() => {
    if (!dragging) {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      return
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging])

  const paneStyles = useMemo(() => {
    const [mapPct, wipPct] = sizes
    const [mapMin, wipMin] = minSizes
    return {
      map: {
        height: `${mapPct}%`,
        minHeight: `${mapMin}px`,
      } satisfies React.CSSProperties,
      wip: {
        height: `${wipPct}%`,
        minHeight: `${wipMin}px`,
      } satisfies React.CSSProperties,
    }
  }, [minSizes, sizes])

  return (
    <div className={`map-wip-split ${dragging ? 'dragging' : ''}`} ref={containerRef}>
      <div className="map-wip-pane map-wip-pane--map" style={paneStyles.map}>
        {mapPane}
      </div>
      <div
        className={`map-wip-split__gutter ${dragging ? 'dragging' : ''}`}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Adjust map and work in progress height"
        onPointerDown={handlePointerDown}
      >
        <span />
      </div>
      <div className="map-wip-pane map-wip-pane--wip" style={paneStyles.wip}>
        <div className="map-wip-pane__scroll">{wipPane}</div>
      </div>
    </div>
  )
}
