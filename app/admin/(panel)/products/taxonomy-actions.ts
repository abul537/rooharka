'use server'

import { adminOrError } from '@/lib/auth/guard'
import { searchGoogleTaxonomy } from '@/lib/taxonomy/google'
import { rateLimit } from '@/lib/rate-limit'

/** Search-as-you-type in the standard category list. Read-only. */
export async function searchTaxonomyAction(query: string): Promise<{ results: { id: number; path: string }[]; error?: string }> {
  const g = await adminOrError('products.view')
  if ('error' in g) return { results: [], error: g.error }
  if (!rateLimit(`taxonomy:${g.admin.id}`, 120, 60_000).ok) return { results: [], error: 'Please slow down a little.' }
  const r = await searchGoogleTaxonomy(String(query ?? '').slice(0, 80))
  return r.available ? { results: r.results } : { results: [], error: 'The category list could not be loaded just now. You can save without it and choose a category later.' }
}
