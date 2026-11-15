/**
 * Next.js calls `onRequestError` whenever a page, an action or an API route throws on the server. We keep a short,
 * safe note of it (lib/errors) so the platform owner sees crashes in CSMI, "Errors", instead of hearing about them
 * from a customer. The full detail is still in the hosting log.
 */
export async function onRequestError(err: unknown, request: { path?: string }, context: { routePath?: string }) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { recordError } = await import('@/lib/errors/record')
    const e = err as { message?: unknown; digest?: string }
    await recordError({ kind: 'server', path: context?.routePath ?? request?.path ?? '/', message: e?.message, digest: e?.digest ?? null })
  } catch { /* never make a failure worse */ }
}
