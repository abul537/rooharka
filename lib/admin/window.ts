/**
 * "Windowing" for long tables: only the rows near what is on screen are drawn as real inputs, so a table with
 * 100 variants scrolls and types as fast as one with 5. Pure arithmetic, tested.
 */
export interface RowWindow { start: number; end: number; padTop: number; padBottom: number }

/** Which rows [start, end) to draw for a scroll position, with a few spare rows above and below. */
export function rowWindow(total: number, rowHeight: number, scrollTop: number, viewHeight: number, spare = 4): RowWindow {
  if (total <= 0 || rowHeight <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 }
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const start = Math.min(Math.max(0, first - spare), Math.max(0, total - 1))
  const end = Math.min(total, Math.max(start + 1, Math.ceil((Math.max(0, scrollTop) + Math.max(0, viewHeight)) / rowHeight) + spare))
  return { start, end, padTop: start * rowHeight, padBottom: (total - end) * rowHeight }
}
