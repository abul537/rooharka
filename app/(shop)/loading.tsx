/** Shown for a moment while a shop page is being prepared: grey placeholders in the shape of a page, so nothing jumps. */
export default function ShopLoading() {
  return (
    <div className="container mx-auto animate-pulse px-4 py-10" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-1/3 rounded bg-gray-200" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <div key={i}><div className="aspect-square rounded-2xl bg-gray-200" /><div className="mt-3 h-4 w-3/4 rounded bg-gray-200" /><div className="mt-2 h-4 w-1/3 rounded bg-gray-200" /></div>)}
      </div>
    </div>
  )
}
