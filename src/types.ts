export type LatestDTO = { [metric: string]: number | null }

export type SeriesDTO = { dates: string[]; actual: Array<number | null>; planned?: Array<number | null> }

export type GanttTask = {
  id: string
  name: string
  start: string
  end: string
  progress: number
  parent?: string | null
  meta?: Record<string, unknown>
}
