/* Shelf rectangle packing for atlases: sort by height, fill rows left to right. Simple,
 * deterministic, and within ~15% of optimal for sprite parts of similar heights. */

export interface PackRect {
  id: string
  w: number
  h: number
}

export interface PackResult {
  width: number
  height: number
  positions: Map<string, { x: number; y: number }>
}

export function shelfPack(rects: PackRect[], maxWidth = 2048, gap = 2): PackResult {
  const sorted = [...rects].sort((a, b) => b.h - a.h || b.w - a.w || a.id.localeCompare(b.id))
  const area = sorted.reduce((s, r) => s + (r.w + gap) * (r.h + gap), 0)
  const widest = sorted.reduce((m, r) => Math.max(m, r.w + gap), 0)
  const width = Math.min(maxWidth, Math.max(widest, pow2(Math.ceil(Math.sqrt(area * 1.15)))))
  const positions = new Map<string, { x: number; y: number }>()
  let x = 0
  let y = 0
  let rowH = 0
  for (const r of sorted) {
    if (x + r.w > width && x > 0) {
      y += rowH + gap
      x = 0
      rowH = 0
    }
    positions.set(r.id, { x, y })
    x += r.w + gap
    rowH = Math.max(rowH, r.h)
  }
  return { width, height: pow2(y + rowH), positions }
}

const pow2 = (n: number): number => {
  let p = 1
  while (p < n) p *= 2
  return p
}
