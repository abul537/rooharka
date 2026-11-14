'use client'

import { useRef } from 'react'
import { imageVariant } from '@/lib/media/urls'

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
/** "x,y" (each 0 to 100) -> numbers; anything else is the centre. */
const read = (v: string): [number, number] => { const m = /^(\d{1,3}),(\d{1,3})$/.exec(v); return m ? [clamp(Number(m[1])), clamp(Number(m[2]))] : [50, 50] }

/**
 * THE FOCAL POINT: the owner drags a dot onto the part of the picture that must never be cropped away (a face,
 * the product). It is stored as two numbers from 0 to 100, so every shape and screen size crops around it.
 * Works with a mouse, a finger, or the arrow keys.
 */
export default function FocalPicker({ src, value, onChange, label }: { src: string; value: string; onChange: (v: string) => void; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [x, y] = read(value)
  const at = (e: { clientX: number; clientY: number }) => {
    const r = box.current?.getBoundingClientRect()
    if (r && r.width > 0 && r.height > 0) onChange(`${clamp(((e.clientX - r.left) / r.width) * 100)},${clamp(((e.clientY - r.top) / r.height) * 100)}`)
  }
  const key = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (!d[e.key]) return
    e.preventDefault(); onChange(`${clamp(x + d[e.key][0])},${clamp(y + d[e.key][1])}`)
  }
  return (
    <div className="text-sm">
      <span className="font-medium">{label}</span>
      <div ref={box} className="relative mt-1 inline-block max-w-full cursor-crosshair touch-none select-none overflow-hidden rounded-lg border border-slate-300 bg-slate-100"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); at(e) }} onPointerMove={(e) => e.buttons === 1 && at(e)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageVariant(src, 480)} alt="" draggable={false} className="block max-h-48 w-auto max-w-full" />
        <button type="button" onKeyDown={key} aria-label={`${label}: ${x}% from the left, ${y}% from the top. Use the arrow keys to move.`}
          className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow ring-2 ring-blue-600/40 focus:outline-none focus:ring-4" style={{ left: `${x}%`, top: `${y}%` }} />
      </div>
      <span className="mt-1 block text-xs text-slate-500">Drag the dot onto the most important part. The picture is cropped around it on every screen.{value && <> <button type="button" className="underline" onClick={() => onChange('')}>Back to the centre</button></>}</span>
    </div>
  )
}
