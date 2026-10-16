'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Play } from 'lucide-react'
import type { MediaDTO } from '@/lib/data/product'

/**
 * Product gallery: images and videos uploaded for the product, primary first.
 * With no media yet it shows a neutral placeholder so the page never looks broken.
 */
export default function Gallery({ media, productName }: { media: MediaDTO[]; productName: string }) {
  // Primary image first, the rest in saved order.
  const items = [...media].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  const [active, setActive] = useState(0)
  const current = items[active]

  return (
    <div className="lg:sticky lg:top-28">
      <div className="relative">
        <div className="relative w-full aspect-square rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-br from-amber-100 to-emerald-100 flex items-center justify-center">
          {!current && (
            <div className="text-center">
              <div className="w-48 h-48 sm:w-64 sm:h-64 mx-auto mb-6 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 shadow-2xl flex items-center justify-center">
                <span className="text-white text-7xl" aria-hidden>🫙</span>
              </div>
              <p className="text-amber-900 font-medium text-lg">{productName}</p>
            </div>
          )}
          {current?.kind === 'IMAGE' && (
            <Image
              key={current.id}
              src={current.url}
              alt={current.alt ?? productName}
              fill
              priority={active === 0}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          )}
          {current?.kind === 'VIDEO' && (
            <video key={current.id} src={current.url} controls playsInline preload="metadata" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="absolute -top-4 -left-4 w-24 h-24 rounded-full bg-emerald-200/30 blur-xl pointer-events-none" />
        <div className="absolute -bottom-4 -right-4 w-32 h-32 rounded-full bg-amber-200/30 blur-xl pointer-events-none" />
      </div>

      {items.length > 1 && (
        <div className="flex gap-3 mt-6 overflow-x-auto pb-2" role="tablist" aria-label="Product media">
          {items.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={m.kind === 'VIDEO' ? 'Play product video' : `Show image ${i + 1}`}
              onClick={() => setActive(i)}
              className={`relative w-20 h-20 shrink-0 rounded-xl overflow-hidden border-2 transition-colors ${
                i === active ? 'border-amber-600' : 'border-amber-200 hover:border-amber-400'
              }`}
            >
              {m.kind === 'IMAGE' ? (
                <Image src={m.url} alt="" fill sizes="80px" className="object-cover" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center bg-gray-900/80 text-white">
                  <Play className="w-6 h-6" aria-hidden />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
