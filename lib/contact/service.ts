import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import type { ContactInput } from '@/lib/contact/rules'

export class ContactError extends Error {}
const DAILY_CAP = 100 // per store: a flood can never fill the database

/** Saves a customer's message for one store. Limits per visitor address and per store per day. */
export async function submitContact(storeId: string, input: ContactInput, ip: string) {
  if (!rateLimit(`contact-ip:${ip}`, 5, 15 * 60_000).ok || !rateLimit(`contact-store:${storeId}:${input.phone}`, 3, 60 * 60_000).ok) {
    throw new ContactError('You have sent several messages already. Please wait a little and try again, or call the store.')
  }
  const since = new Date(Date.now() - 24 * 3_600_000)
  if ((await db.contactMessage.count({ where: { storeId, createdAt: { gte: since } } })) >= DAILY_CAP) {
    throw new ContactError('The store is receiving a lot of messages right now. Please call or WhatsApp instead.')
  }
  await db.contactMessage.create({ data: { storeId, ...input } })
}
