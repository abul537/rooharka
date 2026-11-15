import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SETTINGS_TABS, settingsHref, settingsTab } from '@/lib/admin/settings-tabs'

test('settings are organised into groups: every card is in exactly one group', () => {
  assert.deepEqual(SETTINGS_TABS.map((t) => t.key), ['general', 'payments', 'checkout', 'couriers', 'product', 'connections'])
  const cards = SETTINGS_TABS.flatMap((t) => [...t.cards])
  assert.equal(new Set(cards).size, cards.length, 'no card is listed twice')
  assert.deepEqual([...cards].sort(), ['ai', 'checkout-form', 'cloudinary', 'couriers', 'fraud', 'ipqs', 'otp', 'payments', 'postex', 'product-page', 'store', 'tracking'])
  for (const t of SETTINGS_TABS) assert.ok(t.label.length > 3 && t.about.endsWith('.'), t.key)
})

test('the group comes from the address; anything unknown opens the first group', () => {
  assert.equal(settingsTab('couriers'), 'couriers')
  assert.equal(settingsTab(['product', 'general']), 'product')
  for (const junk of [undefined, null, '', 'nope', 5, '../admin', ['x']]) assert.equal(settingsTab(junk), 'general')
  assert.equal(settingsHref('general'), '/admin/settings')
  assert.equal(settingsHref('connections'), '/admin/settings?tab=connections')
})

test('the settings page shows each card once, in its group, and loads only that group', () => {
  const src = readFileSync('app/admin/(panel)/settings/page.tsx', 'utf8')
  assert.match(src, /await requireAdmin\('settings\.edit'\)/)
  // Each card (by its title or component) appears exactly once in the page.
  for (const mark of ['title="Store details"', 'title="Payments and delivery"', 'title="Checkout form"', '<OtpSettings ', 'title="Order tracking"', '<PostexConnect ', '<CourierSettings ', 'title="Product page"', 'title="Photos and videos"', 'title="AI writing assistant"', 'title="Fake-order check"', 'title="IP risk score"']) {
    assert.equal(src.split(mark).length - 1, 1, mark)
  }
  // Every save action is still wired to a form.
  for (const a of ['saveStoreInfoAction', 'savePaymentsAction', 'saveFieldsAction', 'saveTrackingAction', 'saveProductPageAction', 'saveFraudAction']) assert.match(src, new RegExp(`action=\\{${a}\\}`))
  // Courier and phone-verification data are only fetched inside their own group.
  assert.ok(src.indexOf('loadCourierConfig(admin.storeId)') > src.indexOf("tab === 'couriers' && services"))
  assert.ok(src.indexOf('loadOtpSettings(admin.storeId)') > src.indexOf("tab === 'checkout' && s"))
  assert.match(readFileSync('components/admin/MediaManager.tsx', 'utf8'), /\/admin\/settings\?tab=connections/)
})
