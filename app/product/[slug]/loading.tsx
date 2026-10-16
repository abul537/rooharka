// Shown instantly while the product loads: a grey skeleton of the real layout.
export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-10 md:py-16 animate-pulse" aria-busy="true" aria-label="Loading product">
      <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">
        <div className="aspect-square rounded-3xl bg-amber-100" />
        <div className="space-y-6">
          <div className="h-12 w-3/4 rounded bg-gray-200" />
          <div className="h-6 w-1/2 rounded bg-gray-200" />
          <div className="h-24 rounded bg-gray-200" />
          <div className="h-10 w-1/3 rounded bg-gray-200" />
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-gray-200" />)}
          </div>
          <div className="h-14 rounded-xl bg-gray-200" />
        </div>
      </div>
    </div>
  )
}
