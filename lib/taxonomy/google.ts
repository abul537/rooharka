/**
 * Loads Google's official category list. It is fetched from Google once and kept in memory for a day (it changes
 * about once a year); if Google cannot be reached, the last good copy keeps being used. Nothing is stored per store.
 */
import { findTaxonomy, parseTaxonomy, searchTaxonomy, type TaxonomyEntry } from '@/lib/taxonomy/rules'

const SOURCE = 'https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt'
const DAY = 24 * 60 * 60 * 1000
let cache: { at: number; list: TaxonomyEntry[] } | null = null
let loading: Promise<TaxonomyEntry[]> | null = null

async function load(): Promise<TaxonomyEntry[]> {
  if (cache && Date.now() - cache.at < DAY) return cache.list
  loading ??= (async () => {
    try {
      const res = await fetch(SOURCE, { signal: AbortSignal.timeout(8000), redirect: 'error' })
      const list = res.ok ? parseTaxonomy((await res.text()).slice(0, 2_000_000)) : []
      if (list.length > 1000) cache = { at: Date.now(), list } // a real copy has over 5,000 lines
    } catch { /* keep the last good copy */ }
    loading = null
    return cache?.list ?? []
  })()
  return loading
}

export async function searchGoogleTaxonomy(query: string): Promise<{ available: boolean; results: TaxonomyEntry[] }> {
  const list = await load()
  return { available: list.length > 0, results: searchTaxonomy(list, query) }
}

/** The official path for an id, or null when the id is not in the list (or the list could not be loaded). */
export async function taxonomyPathFor(id: number): Promise<string | null> {
  return findTaxonomy(await load(), id)?.path ?? null
}
