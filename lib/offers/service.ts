import { db } from '@/lib/db'
import { CsmiError } from '@/lib/csmi/manage'
const isUnique = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
import type { OfferInput } from '@/lib/offers/rules'

/**
 * Creates or edits an offer. The code of an existing offer cannot change (stores already hold it), and the use
 * counter is never edited by hand. Turning an offer off stops NEW sign-ups only; stores that already got the
 * discount keep it for the periods they were promised.
 */
export async function saveOffer(id: string | null, input: OfferInput): Promise<string> {
  if (input.planId && !(await db.plan.count({ where: { id: input.planId } }))) throw new CsmiError('That plan does not exist.')
  const { code, ...rest } = input
  try {
    if (id) {
      const r = await db.offer.updateMany({ where: { id }, data: rest })
      if (r.count === 0) throw new CsmiError('Offer not found.')
      return id
    }
    return (await db.offer.create({ data: { code, ...rest }, select: { id: true } })).id
  } catch (e) {
    if (isUnique(e)) throw new CsmiError('An offer with that code already exists.')
    throw e
  }
}
