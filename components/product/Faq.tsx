import { ChevronDown } from 'lucide-react'
import type { SectionDTO } from '@/lib/data/product'

/** FAQ accordion built on native <details>: keyboard accessible, works without JavaScript. */
export default function Faq({ section }: { section: SectionDTO }) {
  if (section.items.length === 0) return null
  return (
    <section className="py-16 bg-gradient-to-b from-white to-amber-50" aria-labelledby="faq-heading">
      <div className="container mx-auto px-4 max-w-3xl">
        <h2 id="faq-heading" className="font-playfair text-4xl font-bold text-gray-900 mb-12 text-center">
          {section.title}
        </h2>
        <div className="space-y-4">
          {section.items.map((item, i) => (
            <details key={i} className="group border border-gray-200 bg-white rounded-2xl overflow-hidden">
              <summary className="w-full p-6 flex justify-between items-center gap-4 cursor-pointer list-none hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
                <span className="font-bold text-lg text-gray-900">{item.title}</span>
                <ChevronDown className="w-5 h-5 text-gray-500 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="px-6 pb-6 text-gray-700">{item.text}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
