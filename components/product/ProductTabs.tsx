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
  const paragraphs = (data.product.description ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

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
                tab.key === current.key ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-600 hover:text-gray-900'
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
              {current.key === 'description' && paragraphs.map((p, i) => (
                <p key={i} className="text-lg text-gray-700 mb-6 leading-relaxed">{p}</p>
              ))}
              {current.sections.map((s) => <SectionBlock key={s.id} section={s} />)}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
