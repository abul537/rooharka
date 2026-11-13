import { taxonomyPathFor } from '@/lib/taxonomy/google'

/**
 * Fills in the official category path for the id the form sent (the path typed by a browser is never trusted).
 * Returns an error message, or null when all is well. Changes `product` in place.
 */
export async function withTaxonomyPath(product: { taxonomyId?: number | null; taxonomyPath?: string | null }, currentId?: number | null): Promise<string | null> {
  if (product.taxonomyId === undefined) return null // the form did not carry the field
  // Unchanged: leave what is saved alone (no need to ask Google again).
  if (currentId !== undefined && product.taxonomyId === currentId) { delete product.taxonomyId; delete product.taxonomyPath; return null }
  if (product.taxonomyId === null) { product.taxonomyPath = null; return null }
  const path = await taxonomyPathFor(product.taxonomyId)
  if (!path) return 'That category could not be checked against the standard list just now. Remove the category or try again in a minute.'
  product.taxonomyPath = path
  return null
}
