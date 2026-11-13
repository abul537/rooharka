/**
 * "Generate with AI": writes a product description from the title, category and any notes already typed.
 *
 * Whose account pays? The store's own Anthropic key if the owner connected one (Settings), otherwise the platform's
 * key if the platform owner set ANTHROPIC_API_KEY. With neither, the button explains how to switch it on.
 * The key is decrypted on the server only for the call; it is never logged or sent to a browser.
 *
 * Limit: 10 per store per hour, counted in the AiUsage table under a row lock (exact even with two staff clicking
 * at once, and it works on serverless where memory is not shared). Every request is logged for future billing.
 */
import { db } from '@/lib/db'
import { getServiceSecrets } from '@/lib/services/store-services'
import { AI_KIND_DESCRIPTION, AI_LIMIT_PER_HOUR, AI_WINDOW_MS, aiLimitProblem, aiTextToHtml, buildDescriptionPrompt } from '@/lib/admin/product-mvp'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const TIMEOUT_MS = 20_000
/** A small, fast model is plenty for three paragraphs. Change with the AI_MODEL environment variable. */
const model = () => process.env.AI_MODEL?.trim() || 'claude-haiku-5-5'

export type AiResult = { ok: true; html: string; left: number } | { ok: false; error: string }

async function apiKeyFor(storeId: string): Promise<string | null> {
  const own = await getServiceSecrets(storeId, 'ai').catch(() => null)
  if (own?.enabled && own.credentials.apiKey) return own.credentials.apiKey
  return process.env.ANTHROPIC_API_KEY?.trim() || null
}

/** Takes one of this hour's turns, or says why not. Exact: the store row is locked while we count and write. */
async function reserve(storeId: string, userId: string | null, inputChars: number): Promise<{ id: string; used: number } | { error: string }> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`
    const used = await tx.aiUsage.count({ where: { storeId, kind: AI_KIND_DESCRIPTION, createdAt: { gte: new Date(Date.now() - AI_WINDOW_MS) } } })
    const problem = aiLimitProblem(used)
    if (problem) return { error: problem }
    const row = await tx.aiUsage.create({ data: { storeId, userId, kind: AI_KIND_DESCRIPTION, model: model(), inputChars, ok: false }, select: { id: true } })
    return { id: row.id, used: used + 1 }
  })
}

export async function generateDescription(admin: { storeId: string; id: string | null }, input: { title: string; category?: string | null; existing?: string | null }, f: typeof fetch = fetch): Promise<AiResult> {
  const store = await db.storeSettings.findUnique({ where: { storeId: admin.storeId }, select: { displayName: true } })
  const prompt = buildDescriptionPrompt({ ...input, storeName: store?.displayName })
  if (!prompt.ok) return prompt
  const key = await apiKeyFor(admin.storeId)
  if (!key) return { ok: false, error: 'The AI writer is not switched on yet. Connect your Anthropic key in Settings (AI writing assistant), then try again.' }

  const turn = await reserve(admin.storeId, admin.id, prompt.value.user.length)
  if ('error' in turn) return { ok: false, error: turn.error }

  let text = ''
  try {
    const res = await f(ENDPOINT, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: model(), max_tokens: 600, system: prompt.value.system, messages: [{ role: 'user', content: prompt.value.user }] }),
    })
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'The AI service did not accept the key. Check it in Settings (AI writing assistant).' }
    if (res.status === 429 || res.status === 529) return { ok: false, error: 'The AI service is busy right now. Please try again in a minute.' }
    if (!res.ok) return { ok: false, error: 'The AI service could not write a description just now. Please try again.' }
    const body = (await res.json()) as { content?: { type?: string; text?: string }[] }
    text = (body.content ?? []).filter((c) => c?.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('\n\n')
  } catch {
    return { ok: false, error: 'The AI service took too long to answer. Please try again.' }
  }
  const html = aiTextToHtml(text)
  if (!html) return { ok: false, error: 'The AI did not return any text. Please try again.' }
  await db.aiUsage.update({ where: { id: turn.id }, data: { ok: true, outputChars: text.length } }).catch(() => {})
  return { ok: true, html, left: Math.max(0, AI_LIMIT_PER_HOUR - turn.used) }
}
