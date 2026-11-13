/**
 * "Book this order with the courier, AT MOST ONCE." Pure logic (no database, no network of its own) so the
 * guarantee is unit-tested: a timeout followed by a retry can never create two parcels for one order.
 *
 * How it stays safe:
 *  1. BEFORE any courier call the order's reference is CLAIMED in the database (one claim per order, enforced under a row lock).
 *  2. If the order already has a tracking number, we return it and make NO courier call.
 *  3. If a claim exists without a tracking number, an earlier attempt is unfinished or its result is unknown
 *     (e.g. a timeout): we do NOT call the courier again; the owner is told to check the courier and add the number.
 *  4. The claim is released only when the courier ANSWERED and refused (nothing was created), so a retry is safe then.
 */
import { CourierError, type CourierAdapter, type CourierCredentials, type CourierErrorKind, type Fetch, type ShipmentOrder } from '@/lib/couriers/contract'

export type Claim =
  | { kind: 'existing'; trackingNumber: string } // this courier already has a parcel for the order
  | { kind: 'pending' } // an earlier attempt is unfinished or its result is unknown
  | { kind: 'skipped'; reason: string } // another courier already has this order: not ours to book
  | { kind: 'claimed'; claimId: string }

export interface BookingLedger {
  claim(): Promise<Claim>
  complete(claimId: string, trackingNumber: string): Promise<void>
  /** The courier answered and refused: nothing exists there, so the claim is removed and a retry is allowed. */
  release(claimId: string): Promise<void>
  /** We do not know whether the courier created it: keep the claim and say so. */
  flagUnknown(claimId: string, message: string): Promise<void>
}

export type BookOutcome =
  | { status: 'booked'; trackingNumber: string }
  | { status: 'existing'; trackingNumber: string }
  | { status: 'pending' }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; kind: CourierErrorKind; message: string }

export async function bookOnce(ledger: BookingLedger, adapter: CourierAdapter, order: ShipmentOrder, credentials: CourierCredentials, f?: Fetch): Promise<BookOutcome> {
  const claim = await ledger.claim()
  if (claim.kind === 'existing') return { status: 'existing', trackingNumber: claim.trackingNumber }
  if (claim.kind === 'pending') return { status: 'pending' }
  if (claim.kind === 'skipped') return { status: 'skipped', reason: claim.reason }

  let tracking: string
  try {
    tracking = (await adapter.createShipment(order, credentials, f)).trackingNumber
  } catch (e) {
    const err = e instanceof CourierError ? e : new CourierError('unknown', 'Something went wrong while booking. The parcel may or may not have been booked.')
    if (err.kind === 'unknown') await ledger.flagUnknown(claim.claimId, err.message)
    else await ledger.release(claim.claimId)
    return { status: 'failed', kind: err.kind, message: err.message }
  }
  try {
    await ledger.complete(claim.claimId, tracking)
  } catch {
    // The courier HAS the parcel but saving failed. Keep the claim (blocks a second booking) and keep the number.
    await ledger.flagUnknown(claim.claimId, `The parcel was booked (tracking no. ${tracking}) but could not be saved. Use “Add shipment” with this number.`).catch(() => {})
    return { status: 'failed', kind: 'unknown', message: `The parcel was booked (tracking no. ${tracking}) but could not be saved.` }
  }
  return { status: 'booked', trackingNumber: tracking }
}
