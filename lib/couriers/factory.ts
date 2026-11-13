/**
 * The factory: turns a store's courier setting ("postex") into an adapter. Adding a courier = one case here.
 * Order code asks for the adapter by name and only ever sees the `CourierAdapter` interface.
 */
import { CourierError, type CourierAdapter } from '@/lib/couriers/contract'
import { postexAdapter } from '@/lib/couriers/postex'

/** Couriers that run through the contract (vault + webhook + automatic booking). */
export const CONTRACT_COURIERS = ['postex'] as const
export const isContractCourier = (provider: string) => (CONTRACT_COURIERS as readonly string[]).includes(provider)

export function getCourierAdapter(provider: string): CourierAdapter {
  switch (provider) {
    case 'postex': return postexAdapter
    default: throw new CourierError('unsupported', 'This courier is not connected for automatic booking.')
  }
}
