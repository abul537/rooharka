'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, Heart, Leaf, Minus, Plus, Shield, ShoppingCart, Truck } from 'lucide-react'
import { discountPercent, formatPrice } from '@/lib/format'
import type { ProductPageData, SectionDTO, TrustIcon } from '@/lib/data/product'
import { Stars } from './Reviews'

const TRUST_ICON = { truck: Truck, shield: Shield, leaf: Leaf, clock: Clock, heart: Heart } satisfies Record<TrustIcon, unknown>

/** Right-hand column: title, price, size picker, quantity, order button, trust badges, key benefits. */
export default function PurchasePanel({ data, keyBenefits }: { data: ProductPageData; keyBenefits: SectionDTO | null }) {
  const { product, variants, settings, store, reviews } = data
  const router = useRouter()

  const [variantId, setVariantId] = useState(() => (variants.find((v) => v.isDefault) ?? variants[0]).id)
  const [quantity, setQuantity] = useState(1)
  const [showBar, setShowBar] = useState(false)
  const ctaRef = useRef<HTMLDivElement>(null)

  const variant = useMemo(() => variants.find((v) => v.id === variantId) ?? variants[0], [variants, variantId])
  const soldOut = variant.trackStock && variant.stock <= 0
  const maxQty = Math.max(1, variant.trackStock ? Math.min(settings.maxQuantity, variant.stock) : settings.maxQuantity)
  const qty = Math.min(quantity, maxQty)
  const total = variant.price * qty
  const lowStock = variant.trackStock && variant.stock > 0 && variant.stock <= settings.lowStockThreshold
  const off = discountPercent(variant.price, variant.compareAtPrice)

  // Show the sticky mobile bar only once the main order button has scrolled out of view.
  useEffect(() => {
    const el = ctaRef.current
    if (!el || !settings.showStickyBuyBar) return
    const io = new IntersectionObserver(([entry]) => setShowBar(!entry.isIntersecting && entry.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [settings.showStickyBuyBar])

  function order() {
    if (soldOut) return
    // The checkout step reads these in the orders phase; until then they travel in the URL.
    router.push(`/checkout?product=${encodeURIComponent(product.slug)}&variant=${variant.id}&qty=${qty}`)
  }

  return (
    <div>
      {settings.badgeText && (
        <div className="inline-flex items-center px-4 py-2 rounded-full bg-amber-100 text-amber-800 mb-6">
          <span className="mr-2" aria-hidden>✨</span>
          <span className="font-medium">{settings.badgeText}</span>
        </div>
      )}

      <h1 className="font-playfair text-4xl md:text-6xl font-bold text-gray-900 mb-3">{product.name}</h1>
      {product.subtitle && <p className="text-xl md:text-2xl text-gray-600 mb-6">{product.subtitle}</p>}

      {(reviews.count > 0 || settings.guaranteeText) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-6">
          {reviews.average !== null && reviews.count > 0 && (
            <>
              <Stars value={reviews.average} />
              <span className="text-gray-600">{reviews.average.toFixed(1)} · {reviews.count} review{reviews.count === 1 ? '' : 's'}</span>
            </>
          )}
          {settings.guaranteeText && (
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-sm font-medium">{settings.guaranteeText}</span>
          )}
        </div>
      )}

      {product.shortDescription && <p className="text-lg md:text-xl text-gray-700 mb-8 leading-relaxed">{product.shortDescription}</p>}

      {/* Price */}
      <div className="flex items-baseline flex-wrap gap-3 mb-8" aria-live="polite">
        <span className="text-4xl font-bold text-gray-900">{formatPrice(variant.price, store.currency)}</span>
        {variant.compareAtPrice && variant.compareAtPrice > variant.price && (
          <>
            <span className="text-xl text-gray-500 line-through">{formatPrice(variant.compareAtPrice, store.currency)}</span>
            <span className="px-2 py-1 rounded bg-red-100 text-red-700 text-sm font-bold">{off}% OFF</span>
          </>
        )}
      </div>

      {/* Size / variant selection */}
      {variants.length > 1 && (
        <fieldset className="mb-8">
          <legend className="text-lg font-bold text-gray-900 mb-4">Select Size:</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {variants.map((v) => {
              const out = v.trackStock && v.stock <= 0
              return (
                <label
                  key={v.id}
                  className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    v.id === variantId ? 'border-amber-600 bg-amber-50' : 'border-gray-200 hover:border-amber-300'
                  } ${out ? 'opacity-60' : ''}`}
                >
                  <input
                    type="radio"
                    name="variant"
                    value={v.id}
                    checked={v.id === variantId}
                    onChange={() => setVariantId(v.id)}
                    className="sr-only"
                  />
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <span className="font-bold text-gray-900">{v.label}</span>
                    {(out || v.badge) && (
                      <span className={`text-xs text-white px-2 py-1 rounded ${out ? 'bg-gray-500' : 'bg-amber-600'}`}>
                        {out ? 'Sold out' : v.badge}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold text-gray-900">{formatPrice(v.price, store.currency)}</span>
                    {v.compareAtPrice && v.compareAtPrice > v.price && (
                      <span className="text-sm text-gray-500 line-through">{formatPrice(v.compareAtPrice, store.currency)}</span>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        </fieldset>
      )}

      {/* Quantity + order button */}
      <div ref={ctaRef} className="mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="flex items-center">
            <span className="mr-4 font-medium" id="qty-label">Quantity:</span>
            <div className="flex items-center border rounded-lg" role="group" aria-labelledby="qty-label">
              <button type="button" aria-label="Decrease quantity" disabled={qty <= 1}
                onClick={() => setQuantity(Math.max(1, qty - 1))}
                className="w-12 h-12 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                <Minus className="w-4 h-4" aria-hidden />
              </button>
              <span className="w-12 h-12 flex items-center justify-center font-bold" aria-live="polite">{qty}</span>
              <button type="button" aria-label="Increase quantity" disabled={qty >= maxQty}
                onClick={() => setQuantity(Math.min(maxQty, qty + 1))}
                className="w-12 h-12 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                <Plus className="w-4 h-4" aria-hidden />
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={order}
            disabled={soldOut}
            className="flex-1 bg-gradient-to-r from-amber-700 to-amber-800 text-white py-4 rounded-xl font-bold text-lg hover:shadow-2xl hover:scale-[1.02] transition-all flex items-center justify-center disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
          >
            <ShoppingCart className="mr-3 w-5 h-5" aria-hidden />
            {soldOut ? 'Out of stock' : `${settings.buyButtonLabel} · ${formatPrice(total, store.currency)}`}
          </button>
        </div>
      </div>
      {settings.showStockCount && lowStock && (
        <p className="text-sm font-medium text-red-600 mb-6">Only {variant.stock} left in stock: order soon.</p>
      )}

      {/* Trust badges */}
      {settings.showTrustBadges && settings.trustBadges.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-8">
          {settings.trustBadges.map((b, i) => {
            const Icon = TRUST_ICON[b.icon]
            return (
              <li key={i} className="flex items-center gap-3">
                <Icon className="w-5 h-5 text-amber-600 shrink-0" aria-hidden />
                <span className="text-sm">{b.text}</span>
              </li>
            )
          })}
        </ul>
      )}

      {/* Key benefits */}
      {keyBenefits && keyBenefits.items.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-emerald-50 rounded-2xl p-6">
          <h2 className="font-bold text-xl text-gray-900 mb-4">{keyBenefits.title}</h2>
          <ul className="grid sm:grid-cols-2 gap-3">
            {keyBenefits.items.map((b, i) => (
              <li key={i} className="flex items-center">
                <Check className="w-5 h-5 text-emerald-600 mr-2 shrink-0" aria-hidden />
                <span className="text-gray-700 text-sm">{b.text ?? b.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sticky mobile buy bar */}
      {settings.showStickyBuyBar && (
        <div
          className={`lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3 flex items-center gap-4 transition-transform duration-300 ${
            showBar ? 'translate-y-0' : 'translate-y-full'
          }`}
          aria-hidden={!showBar}
        >
          <div className="min-w-0">
            <p className="text-xs text-gray-500 truncate">{product.name} · {variant.label}</p>
            <p className="font-bold text-gray-900">{formatPrice(total, store.currency)}</p>
          </div>
          <button type="button" onClick={order} disabled={soldOut} tabIndex={showBar ? 0 : -1}
            className="ml-auto bg-gradient-to-r from-amber-700 to-amber-800 text-white px-6 py-3 rounded-xl font-bold disabled:opacity-50">
            {soldOut ? 'Out of stock' : settings.buyButtonLabel}
          </button>
        </div>
      )}
    </div>
  )
}
