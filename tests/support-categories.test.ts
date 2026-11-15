import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isOpen, parseReply, parseTicket, statusAfterReply } from '@/lib/support'

test('support: a ticket needs a subject and a real message; text is kept as plain text with its line breaks', () => {
  const form = (o: Record<string, string>) => parseTicket((k) => o[k])
  assert.deepEqual(form({ subject: '  PostEx   booking fails ', body: 'Line one\r\n\r\n\r\n\r\nLine two\u0000', priority: 'URGENT' }), { ok: true, value: { subject: 'PostEx booking fails', body: 'Line one\n\nLine two', priority: 'URGENT' } })
  assert.equal((form({ subject: 'Hello there', body: 'Something is wrong with it', priority: 'SUPER' }) as { value: { priority: string } }).value.priority, 'NORMAL')
  assert.equal(form({ subject: 'Hi', body: 'Something is wrong with it' }).ok, false); assert.equal(form({ subject: 'Hello there', body: 'short' }).ok, false)
  assert.equal(parseReply('  ok thanks  '), 'ok thanks'); assert.equal(parseReply(' '), null); assert.equal(parseReply(5), null); assert.equal(parseReply('x'.repeat(9000))!.length, 4000)
  assert.equal(statusAfterReply(true), 'WAITING_ON_STORE'); assert.equal(statusAfterReply(false), 'OPEN')
  assert.equal(isOpen('OPEN'), true); assert.equal(isOpen('WAITING_ON_STORE'), true); assert.equal(isOpen('CLOSED'), false); assert.equal(isOpen('RESOLVED'), false)
})

test('support: a store sees and writes only its own conversations; the platform side needs a platform sign-in', () => {
  const store = readFileSync('app/admin/(panel)/support/actions.ts', 'utf8')
  assert.equal([...store.matchAll(/export async function/g)].length, [...store.matchAll(/await adminOrError\(/g)].length)
  assert.match(store, /where: \{ id, storeId: g\.admin\.storeId \}/); assert.match(store, /fromPlatform: false/); assert.doesNotMatch(store, /fromPlatform: true/, 'a store can never write as the platform')
  const page = readFileSync('app/admin/(panel)/support/page.tsx', 'utf8')
  assert.match(page, /where: \{ storeId: admin\.storeId \}/); assert.match(page, /where: \{ id: openId, storeId: admin\.storeId \}/)
  const csmi = readFileSync('app/csmi/(panel)/support/actions.ts', 'utf8')
  assert.match(csmi, /await platformOrError\('csmi\.view'\)/); assert.match(csmi, /fromPlatform: true/)
  assert.match(readFileSync('app/csmi/(panel)/support/page.tsx', 'utf8'), /await requirePlatform\(\)/)
  assert.doesNotMatch(readFileSync('components/admin/TicketThread.tsx', 'utf8'), /dangerouslySetInnerHTML/)
})

test('categories: add, rename and delete stay in the store, and deleting never deletes products', () => {
  const a = readFileSync('app/admin/(panel)/collections/actions.ts', 'utf8')
  const fn = a.slice(a.indexOf('export async function categoryAction'))
  assert.match(fn, /adminOrError\('products\.edit'\)/)
  for (const q of fn.matchAll(/db\.(category|product)\.\w+\(\{ (where|data): \{([^}]*)/g)) assert.match(q[3], /storeId/, q[0])
  assert.match(fn, /db\.product\.updateMany\(\{ where: \{ storeId, categoryId: c\.id \}, data: \{ categoryId: null \} \}\)/)
  assert.ok(fn.indexOf('db.product.updateMany') < fn.indexOf('db.category.deleteMany'), 'products are released before the category goes')
  assert.doesNotMatch(fn, /db\.product\.delete/)
  assert.match(fn, /data: \{ name \}/, 'a rename keeps the page address, so links keep working')
})
