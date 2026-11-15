import Link from 'next/link'

/** For an address that matches nothing at all (outside any shop). */
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-16 text-center">
      <div className="max-w-md">
        <h1 className="text-3xl font-bold">Page not found</h1>
        <p className="mt-3 text-stone-600">The address may be mistyped, or the page has moved.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-stone-900 px-5 py-2.5 font-medium text-white">Go to the home page</Link>
      </div>
    </main>
  )
}
