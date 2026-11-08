import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bannerVisible, parseBanner, pickBanners, safeLink, toneOf, type BannerRow } from '@/lib/banners/rules'

const now = new Date('2026-11-10T12:00:00Z')
const row = (o: Partial<BannerRow> = {}): BannerRow => ({ id: 'b', text: 'Hi', tone: 'INFO', linkUrl: null, linkLabel: null, audience: 'PUBLIC', startsAt: null, endsAt: null, isActive: true, createdAt: new Date('2026-11-01'), ...o })
const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })

test('links must be https or a path on this site', () => {
  assert.equal(safeLink('/pricing'), '/pricing')
  assert.equal(safeLink('https://example.com/x'), 'https://example.com/x')
  for (const bad of ['javascript:alert(1)', 'http://example.com', '//evil.com', 'data:text/html,x', 'example.com', '']) assert.equal(safeLink(bad), null, bad)
})

test('visibility: audience, dates and the on/off switch', () => {
  assert.equal(bannerVisible(row(), 'PUBLIC', now), true)
  assert.equal(bannerVisible(row(), 'STORES', now), false)
  assert.equal(bannerVisible(row({ audience: 'STORES' }), 'STORES', now), true)
  assert.equal(bannerVisible(row({ audience: 'BOTH' }), 'PUBLIC', now) && bannerVisible(row({ audience: 'BOTH' }), 'STORES', now), true)
  assert.equal(bannerVisible(row({ isActive: false }), 'PUBLIC', now), false)
  assert.equal(bannerVisible(row({ startsAt: new Date('2026-11-11') }), 'PUBLIC', now), false)
  assert.equal(bannerVisible(row({ endsAt: new Date('2026-11-09') }), 'PUBLIC', now), false)
  assert.equal(bannerVisible(row({ startsAt: new Date('2026-11-01'), endsAt: new Date('2026-11-30') }), 'PUBLIC', now), true)
})

test('at most three, newest first', () => {
  const rows = [1, 2, 3, 4, 5].map((i) => row({ id: `b${i}`, createdAt: new Date(`2026-11-0${i}`) }))
  assert.deepEqual(pickBanners(rows, 'PUBLIC', now).map((b) => b.id), ['b5', 'b4', 'b3'])
})

test('unknown tone falls back to info', () => {
  assert.equal(toneOf('OFFER'), 'OFFER'); assert.equal(toneOf('weird'), 'INFO')
})

test('banner form', () => {
  const ok = parseBanner(form({ text: ' Eid offer:  20% off ', tone: 'OFFER', audience: 'BOTH', linkUrl: '/pricing', linkLabel: 'See plans', startsAt: '2026-11-10', endsAt: '2026-11-30', isActive: 'on' }))
  assert.equal(ok.ok, true)
  if (ok.ok) { assert.equal(ok.value.text, 'Eid offer: 20% off'); assert.equal(ok.value.audience, 'BOTH'); assert.equal(ok.value.linkLabel, 'See plans') }
  const noLabel = parseBanner(form({ text: 'Hello', linkUrl: 'https://example.com' }))
  assert.equal(noLabel.ok && noLabel.value.linkLabel, 'Learn more')
  const noLink = parseBanner(form({ text: 'Hello', linkLabel: 'Orphan label' }))
  assert.equal(noLink.ok && noLink.value.linkLabel, null)
  const bad = (o: Record<string, string>) => parseBanner(form({ text: 'Hello there', ...o })).ok
  assert.equal(bad({ text: 'hi' }), false)
  assert.equal(bad({ text: 'x'.repeat(161) }), false)
  assert.equal(bad({ text: '<b>hi</b>' }), false)
  assert.equal(bad({ linkUrl: 'javascript:alert(1)' }), false)
  assert.equal(bad({ linkUrl: '/a', linkLabel: 'x'.repeat(31) }), false)
  assert.equal(bad({ startsAt: '2026-02-31x' }), false)
  assert.equal(bad({ startsAt: '2026-12-01', endsAt: '2026-11-01' }), false)
  assert.equal(parseBanner(form({ text: 'Hello there', audience: 'EVERYONE', tone: 'X' })).ok && true, true) // unknown values fall back safely
})
