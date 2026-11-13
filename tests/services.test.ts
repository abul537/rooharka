import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SERVICES, parseServiceForm, serviceDef } from '@/lib/services/registry'
import { assertPublicHttpsUrl, isPrivateAddress } from '@/lib/net/safe-fetch'

const G = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) })

test('service forms: required, patterns, secrets keep old value when blank', () => {
  const lp = serviceDef('leopards')!
  assert.ok(!parseServiceForm(lp, G({ 'leopards.originCity': 'Lahore' })).ok, 'key required')
  const ok = parseServiceForm(lp, G({ 'leopards.apiKey': 'k1', 'leopards.apiPassword': 'pw', 'leopards.originCity': 'Lahore' }))
  assert.ok(ok.ok && ok.value.credentials.apiKey === 'k1' && ok.value.config.originCity === 'Lahore')
  const keep = parseServiceForm(lp, G({ 'leopards.apiKey': 'k1', 'leopards.originCity': 'Karachi' }), { apiPassword: 'saved-pw' })
  assert.ok(keep.ok && keep.value.credentials.apiPassword === 'saved-pw' && keep.value.config.originCity === 'Karachi')
  assert.ok(!parseServiceForm(lp, G({ 'leopards.apiKey': 'k', 'leopards.apiPassword': 'p', 'leopards.originCity': 'bad city 123' })).ok)
  const cl = serviceDef('cloudinary')!
  assert.ok(!parseServiceForm(cl, G({ 'cloudinary.cloudName': 'my cloud', 'cloudinary.apiKey': '123456', 'cloudinary.apiSecret': 's' })).ok)
  assert.ok(parseServiceForm(cl, G({ 'cloudinary.cloudName': 'my-cloud', 'cloudinary.apiKey': '123456', 'cloudinary.apiSecret': 's' })).ok)
  assert.ok(!parseServiceForm(lp, G({ 'leopards.apiKey': 'x'.repeat(601), 'leopards.apiPassword': 'p', 'leopards.originCity': 'Lahore' })).ok)
  assert.ok(SERVICES.every((s) => s.key && s.credentials.length + s.config.length > 0))
})
test('SSRF guard: private/internal addresses refused', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '224.0.0.1']) assert.ok(isPrivateAddress(ip), ip)
  for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700:4700::1111']) assert.ok(!isPrivateAddress(ip), ip)
  for (const u of ['http://example.com', 'https://localhost/x', 'https://127.0.0.1/', 'https://169.254.169.254/latest', 'https://user:pw@example.com/', 'ftp://x.com', 'not a url', 'https://[::1]/', 'https://svc.internal/']) await assert.rejects(assertPublicHttpsUrl(u), u)
  const ok = await assertPublicHttpsUrl('https://1.1.1.1/path?q=1'); assert.equal(ok.hostname, '1.1.1.1')
})
