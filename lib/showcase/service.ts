import { db } from '@/lib/db'
import { CsmiError } from '@/lib/csmi/manage'
import { clearShowcaseCache } from '@/lib/showcase/store'
import type { ClientInput } from '@/lib/showcase/rules'

export async function saveClient(id: string | null, input: ClientInput): Promise<string> {
  let saved = id
  if (id) {
    const r = await db.showcaseClient.updateMany({ where: { id }, data: input })
    if (r.count === 0) throw new CsmiError('Client not found.')
  } else {
    saved = (await db.showcaseClient.create({ data: input, select: { id: true } })).id
  }
  clearShowcaseCache()
  return saved as string
}

export async function deleteClient(id: string) {
  const r = await db.showcaseClient.deleteMany({ where: { id } })
  if (r.count === 0) throw new CsmiError('Client not found.')
  clearShowcaseCache()
}
