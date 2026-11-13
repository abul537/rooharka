/**
 * Google Product Taxonomy: the standard, public list of product categories ("Apparel & Accessories > Clothing >
 * Shirts & Tops"). It is read-only here: nobody edits it, the owner only picks from it. Pure functions, tested.
 */
export interface TaxonomyEntry { id: number; path: string }

/** Reads Google's own file: one "id - Level 1 > Level 2" per line, with a comment line on top. Bad lines are skipped. */
export function parseTaxonomy(text: string): TaxonomyEntry[] {
  const out: TaxonomyEntry[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\d{1,7})\s+-\s+(.{1,300})$/.exec(line.trim())
    if (m) out.push({ id: Number(m[1]), path: m[2].trim() })
  }
  return out
}

/**
 * Search as the owner types. Every word must appear; a match in the LAST level ("Shirts & Tops") ranks above a
 * match higher up, and shorter paths rank first, so "shirt" finds the shirt category before its sub-sub-categories.
 */
export function searchTaxonomy(list: readonly TaxonomyEntry[], query: string, limit = 20): TaxonomyEntry[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 6)
  if (words.length === 0) return []
  const scored: { e: TaxonomyEntry; score: number }[] = []
  for (const e of list) {
    const path = e.path.toLowerCase()
    if (!words.every((w) => path.includes(w))) continue
    const leaf = path.slice(path.lastIndexOf('>') + 1)
    const inLeaf = words.filter((w) => leaf.includes(w)).length
    scored.push({ e, score: inLeaf * 1000 - (leaf.trim().startsWith(words[0]) ? 0 : 100) - path.length })
  }
  return scored.sort((a, b) => b.score - a.score || a.e.id - b.e.id).slice(0, limit).map((s) => s.e)
}

export const findTaxonomy = (list: readonly TaxonomyEntry[], id: number) => list.find((e) => e.id === id) ?? null
