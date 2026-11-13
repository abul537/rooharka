import { Eye } from 'lucide-react'

/**
 * Shown on every shop page while the owner is previewing. It stays at the bottom of the screen so it can never be
 * mistaken for part of the shop, and it is the way out. Plain links (not client code): they work even if scripts fail.
 */
export default function PreviewBanner({ closed }: { closed: boolean }) {
  return (
    <>
      <div aria-hidden className="h-16" />{/* keeps the page's own footer from hiding behind the bar */}
      <aside role="status" aria-label="Preview mode" className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-gray-900 px-4 py-3 text-center text-sm text-white shadow-[0_-4px_12px_rgba(0,0,0,0.25)] print:hidden">
        <span className="flex items-center gap-2 font-semibold"><Eye className="h-4 w-4" aria-hidden /> Preview mode</span>
        <span className="text-gray-300">{closed ? 'Your shop is not open to customers yet. Only you can see this.' : 'You also see your draft products. Customers do not.'} Orders are switched off here.</span>
        <a href="/api/disable-preview" className="rounded-full bg-white px-4 py-1.5 font-semibold text-gray-900 hover:bg-gray-100">Exit preview</a>
        <a href="/admin" className="underline text-gray-300 hover:text-white">Back to dashboard</a>
      </aside>
    </>
  )
}
