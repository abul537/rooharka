'use server'

import { headers } from 'next/headers'
import { getCurrentStore } from '@/lib/store'
import { clientIp } from '@/lib/rate-limit'
import { parseContact } from '@/lib/contact/rules'
import { ContactError, submitContact } from '@/lib/contact/service'

export interface ContactState { error?: string; ok?: boolean; values?: Record<string, string> }
const KEEP = ['name', 'phone', 'email', 'message'] as const

export async function contactAction(_: ContactState, fd: FormData): Promise<ContactState> {
  const values = Object.fromEntries(KEEP.map((k) => [k, String(fd.get(k) ?? '')]))
  const store = await getCurrentStore()
  if (!store) return { error: 'This store is not available right now.', values }
  const parsed = parseContact(fd)
  if (!parsed.ok) return parsed.error === 'HONEYPOT' ? { ok: true } : { error: parsed.error, values }
  try {
    await submitContact(store.id, parsed.value, clientIp(await headers()))
    return { ok: true }
  } catch (e) {
    if (e instanceof ContactError) return { error: e.message, values }
    console.error('[contact]', e)
    return { error: 'Something went wrong on our side. Nothing was sent; please try again in a moment.', values }
  }
}
