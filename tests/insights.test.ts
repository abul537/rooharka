import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PERIODS, averageOrder, buildTasks, chartBars, conversionRate, fillDays, isBot, niceMax, parsePeriod, pctChange, periodRange, pktDay, shortDay,
} from '@/lib/admin/insights'

test('period: safe default, Pakistan calendar days, and the equally long period before', () => {
  assert.equal(parsePeriod(undefined), '7d'); assert.equal(parsePeriod('30d'), '30d'); assert.equal(parsePeriod('hack'), '7d'); assert.equal(parsePeriod(['today', 'x']), 'today')
  assert.equal(PERIODS.length, 4)
  // 14 Nov 2026 03:59 in Pakistan is still 13 Nov (22:59) in UTC.
  const now = new Date('2026-11-13T22:59:00Z')
  assert.equal(pktDay(now), '2026-11-14')
  const today = periodRange('today', now)
  assert.equal(today.from.toISOString(), '2026-11-13T19:00:00.000Z', 'midnight in Pakistan'); assert.equal(today.fromDay, '2026-11-14'); assert.equal(today.prevFromDay, '2026-11-13')
  const week = periodRange('7d', now)
  assert.deepEqual([week.days, week.fromDay, week.prevFromDay], [7, '2026-11-08', '2026-11-01'])
  assert.equal(week.from.getTime() - week.prevFrom.getTime(), 7 * 86_400_000)
})

test('change against the period before', () => {
  assert.equal(pctChange(150, 100), 50); assert.equal(pctChange(50, 100), -50); assert.equal(pctChange(100, 100), 0)
  assert.equal(pctChange(1125, 1000), 12.5); assert.equal(pctChange(0, 0), 0)
  assert.equal(pctChange(500, 0), null, 'nothing before: no made-up percentage')
  assert.equal(pctChange(0, 200), -100)
})

test('average order value and conversion rate', () => {
  assert.equal(averageOrder(10_000, 4), 2500); assert.equal(averageOrder(1000, 3), 333); assert.equal(averageOrder(0, 0), 0)
  assert.equal(conversionRate(5, 200), 2.5); assert.equal(conversionRate(1, 3), 33.3); assert.equal(conversionRate(0, 50), 0)
  assert.equal(conversionRate(3, 0), null, 'no visitors counted: say so instead of dividing by zero')
})

test('chart: every day present, round top value, days with sales always visible', () => {
  const from = new Date('2026-11-07T19:00:00Z') // midnight 8 Nov in Pakistan
  const s = fillDays([{ day: '2026-11-09', sales: 5000, orders: 2 }, { day: '2026-11-14', sales: 40, orders: 1 }], from, 7)
  assert.deepEqual(s.map((p) => p.day), ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'])
  assert.deepEqual(s.map((p) => p.sales), [0, 5000, 0, 0, 0, 0, 40])
  for (const [max, top] of [[0, 100], [7, 10], [10, 10], [1200, 2000], [2400, 2500], [4999, 5000], [5001, 10_000], [86_000, 100_000]]) assert.equal(niceMax(max), top, String(max))
  const { bars, top } = chartBars(s, 700, 180)
  assert.equal(top, 5000); assert.equal(bars.length, 7)
  assert.equal(bars[1].h, 180); assert.equal(bars[1].y, 0)
  assert.equal(bars[0].h, 0)
  assert.ok(bars[6].h >= 2, 'a small sale still shows')
  assert.ok(bars.every((b) => b.x >= 0 && b.x + b.w <= 700 && b.y >= 0 && b.y + b.h <= 180))
  assert.equal(chartBars([], 700, 180).bars.length, 0)
  assert.equal(shortDay('2026-11-04'), '4 Nov')
})

test('to-do list: only what needs doing, urgent first, good grammar', () => {
  const none = { toConfirm: 0, paymentsToCheck: 0, toPack: 0, toShip: 0, bookingsToCheck: 0, lowStock: 0, unreadMessages: 0 }
  assert.deepEqual(buildTasks(none), [])
  const t = buildTasks({ ...none, toPack: 15, toConfirm: 1, lowStock: 2 })
  assert.deepEqual(t.map((x) => x.key), ['toConfirm', 'toPack', 'lowStock'])
  assert.equal(t[0].text, '1 new order to confirm'); assert.equal(t[1].text, '15 orders to pack'); assert.equal(t[2].text, '2 items are low on stock')
  assert.equal(t[1].href, '/admin/orders?status=CONFIRMED')
  assert.equal(buildTasks({ ...none, paymentsToCheck: 1 })[0].text, '1 advance payment is waiting for your check')
  assert.ok(buildTasks({ ...none, toShip: 1, bookingsToCheck: 1 })[0].urgent)
})

test('visitors: crawlers and tools are not customers', () => {
  for (const ua of [null, '', 'curl/8.4.0', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'WhatsApp/2.23.20.0 A long enough agent', 'python-requests/2.31.0 with some padding']) assert.equal(isBot(ua), true, String(ua))
  assert.equal(isBot('Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'), false)
  assert.equal(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'), false)
})
