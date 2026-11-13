'use client'

import { useId, useMemo, useState } from 'react'
import type { ProductPageData, SectionDTO } from '@/lib/data/product'
import Reviews from './Reviews'
import SectionBlock from './SectionBlock'

const DEFAULT_LABELS: Record<string, string> = {
  description: 'Description',
  ingredients: 'Ingredients',
  usage: 'How to Use',
  benefits: 'Benefits',
}

interface Tab {
  key: string
  label: string
  sections: SectionDTO[]
}

/** Builds the tab list from the product's sections (order = order of the first section in each tab). */
function buildTabs(data: ProductPageData): Tab[] {
  const byKey = new Map<string, Tab>()
  if (data.product.description) byKey.set('description', { key: 'description', label: DEFAULT_LABELS.description, sections: [] })
  for (const s of data.sections) {
    if (!s.tab) continue
    const tab = byKey.get(s.tab) ?? { key: s.tab, label: s.tabLabel ?? DEFAULT_LABELS[s.tab] ?? s.tab, sections: [] }
    if (s.tabLabel) tab.label = s.tabLabel
    tab.sections.push(s)
    byKey.set(s.tab, tab)
  }
  const tabs = [...byKey.values()]
  if (data.settings.showReviews) tabs.push({ key: 'reviews', label: 'Reviews', sections: [] })
  return tabs
}

export default function ProductTabs({ data }: { data: ProductPageData }) {
  const tabs = useMemo(() => buildTabs(data), [data])
  const [active, setActive] = useState(tabs[0]?.key ?? '')
  const id = useId()
  if (tabs.length === 0) return null

  const current = tabs.find((t) => t.key === active) ?? tabs[0]

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    setActive(next.key)
    document.getElementById(`${id}-tab-${next.key}`)?.focus()
  }

  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-4">
        <div role="tablist" aria-label="Product information" className="flex overflow-x-auto border-b border-gray-200 mb-12">
          {tabs.map((tab, i) => (
            <button
              key={tab.key}
              id={`${id}-tab-${tab.key}`}
              role="tab"
              type="button"
              aria-selected={tab.key === current.key}
              aria-controls={`${id}-panel`}
              tabIndex={tab.key === current.key ? 0 : -1}
              onClick={() => setActive(tab.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`px-5 md:px-6 py-4 font-medium text-base md:text-lg border-b-2 whitespace-nowrap transition-colors ${
                tab.key === current.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${current.key}`} className="max-w-4xl mx-auto">
          {current.key === 'reviews' ? (
            <Reviews items={data.reviews.items} count={data.reviews.count} average={data.reviews.average} />
          ) : (
            <>
              {current.key === 'description' && data.product.description && (
                // Safe to show as HTML: the server rebuilt it from an allow-list (lib/admin/product-mvp.ts) before sending it.
                <div className="text-lg text-gray-700 leading-relaxed [&_p]:mb-6 [&_h2]:font-playfair [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:mt-6 [&_h3]:mb-2 [&_h4]:font-semibold [&_h4]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-6 [&_li]:mb-1 [&_blockquote]:border-l-4 [&_blockquote]:border-brand-200 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:mb-6 [&_a]:text-brand-700 [&_a]:underline [&_hr]:my-8"
                  dangerouslySetInnerHTML={{ __html: data.product.description }} />
              )}
              {current.sections.map((s) => <SectionBlock key={s.id} section={s} />)}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
