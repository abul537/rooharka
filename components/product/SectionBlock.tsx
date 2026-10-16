import { Check } from 'lucide-react'
import type { SectionDTO } from '@/lib/data/product'

/** Draws one product-page block according to its `type` (chosen in the dashboard). */
export default function SectionBlock({ section }: { section: SectionDTO }) {
  const { type, title, items } = section
  if (items.length === 0) return null

  switch (type) {
    case 'CARDS':
      return (
        <div className="mb-10">
          <h3 className="font-playfair text-3xl font-bold text-gray-900 mb-6">{title}</h3>
          <div className="grid md:grid-cols-2 gap-6">
            {items.map((item, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
                {item.title && <h4 className="font-bold text-lg text-gray-900 mb-2">{item.title}</h4>}
                {item.text && <p className="text-gray-600">{item.text}</p>}
              </div>
            ))}
          </div>
        </div>
      )

    case 'STEPS':
      return (
        <div className="mb-10">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">{title}</h3>
          <ol className="space-y-6">
            {items.map((item, i) => (
              <li key={i} className="flex items-start">
                <span className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold mr-4 shrink-0">
                  {i + 1}
                </span>
                <span className="text-gray-700 pt-1">{item.text ?? item.title}</span>
              </li>
            ))}
          </ol>
        </div>
      )

    case 'BULLETS':
      return (
        <div className="bg-gradient-to-br from-amber-50 to-emerald-50 rounded-2xl p-8 mb-10">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">{title}</h3>
          <ul className="space-y-4">
            {items.map((item, i) => (
              <li key={i} className="flex items-start">
                <span className="text-amber-600 mr-3" aria-hidden>•</span>
                <span className="text-gray-700">{item.text ?? item.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )

    case 'CHECKLIST':
    default:
      return (
        <div className="bg-gradient-to-r from-amber-50 to-emerald-50 p-8 rounded-2xl mb-10">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">{title}</h3>
          <ul className="grid md:grid-cols-2 gap-4">
            {items.map((item, i) => (
              <li key={i} className="flex items-start">
                <Check className="w-5 h-5 text-emerald-600 mr-3 mt-0.5 shrink-0" aria-hidden />
                <span className="text-gray-700">{item.text ?? item.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )
  }
}
