import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SERVICES, parseServiceForm, serviceDef } from '@/lib/services/registry'
import { assertPublicHttpsUrl, isPrivateAddress } from '@/lib/net/safe-fetch'

const G = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) })

test('service forms: required, patterns, secrets keep old value when blank', () => {
  const pe = serviceDef('postex')!
  assert.ok(!parseServiceForm(pe, G({ 'postex.pickupAddressCode': '001' })).ok, 'token required')
  const ok = parseServiceForm(pe, G({ 'postex.apiToken': 'tok123', 'postex.pickupAddressCode': '001' }))
  assert.ok(ok.ok && ok.value.credentials.apiToken === 'tok123' && ok.value.config.pickupAddressCode === '001')
  const keep = parseServiceForm(pe, G({ 'postex.pickupAddressCode': '002' }), { apiToken: 'saved-token' })
  assert.ok(keep.ok && keep.value.credentials.apiToken === 'saved-token' && keep.value.config.pickupAddressCode === '002')
  assert.ok(!parseServiceForm(pe, G({ 'postex.apiToken': 'x', 'postex.pickupAddressCode': 'bad code!' })).ok)
  const cl = serviceDef('cloudinary')!
  assert.ok(!parseServiceForm(cl, G({ 'cloudinary.cloudName': 'my cloud', 'cloudinary.apiKey': '123456', 'cloudinary.apiSecret': 's' })).ok)
  assert.ok(parseServiceForm(cl, G({ 'cloudinary.cloudName': 'my-cloud', 'cloudinary.apiKey': '123456', 'cloudinary.apiSecret': 's' })).ok)
  assert.ok(!parseServiceForm(pe, G({ 'postex.apiToken': 'x'.repeat(601), 'postex.pickupAddressCode': '1' })).ok)
  assert.ok(SERVICES.every((s) => s.key && s.credentials.length + s.config.length > 0))
})
test('SSRF guard: private/internal addresses refused', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '224.0.0.1']) assert.ok(isPrivateAddress(ip), ip)
  for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700:4700::1111']) assert.ok(!isPrivateAddress(ip), ip)
  for (const u of ['http://example.com', 'https://localhost/x', 'https://127.0.0.1/', 'https://169.254.169.254/latest', 'https://user:pw@example.com/', 'ftp://x.com', 'not a url', 'https://[::1]/', 'https://svc.internal/']) await assert.rejects(assertPublicHttpsUrl(u), u)
  const ok = await assertPublicHttpsUrl('https://1.1.1.1/path?q=1'); assert.equal(ok.hostname, '1.1.1.1')
})
