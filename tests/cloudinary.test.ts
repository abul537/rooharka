import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { signParams, verifyUpload, createUploadSignature, productFolder, imageVariant, videoPoster, parseExternalMediaUrl, createDestroyRequest } from '@/lib/media/cloudinary'

test('signature matches the example in Cloudinary documentation', () => {
  assert.equal(signParams({ eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: 1315060510 }, 'abcd'), 'bfd09f95f331f558cbd1320e67aa8d488770583e')
})
test('signing ignores file/api_key/resource_type and sorts keys', () => {
  assert.equal(signParams({ timestamp: 1, folder: 'f', file: 'x', api_key: 'k', resource_type: 'image' }, 's'), createHash('sha1').update('folder=f&timestamp=1s').digest('hex'))
})
const creds = { cloudName: 'demo', apiSecret: 'sekret' }
const sig = (id: string, v: number) => createHash('sha1').update(`public_id=${id}&version=${v}${creds.apiSecret}`).digest('hex')
test('verifyUpload accepts a genuine report and rebuilds the url', () => {
  const id = `${productFolder('s1')}/abc123`
  const r = verifyUpload({ public_id: id, version: 1700000000, signature: sig(id, 1700000000), resource_type: 'image', format: 'jpg', bytes: 5000, width: 800, height: 600 }, creds, 's1')
  assert.ok(r.ok); if (r.ok) { assert.equal(r.url, `https://res.cloudinary.com/demo/image/upload/v1700000000/${id}.jpg`); assert.equal(r.kind, 'IMAGE'); assert.equal(r.width, 800) }
})
test('verifyUpload rejects forgeries and other stores\' files', () => {
  const id = `${productFolder('s1')}/abc`
  const base = { public_id: id, version: 5, signature: sig(id, 5), resource_type: 'image', format: 'jpg', bytes: 10 }
  assert.ok(!verifyUpload({ ...base, signature: sig(id, 6) }, creds, 's1').ok, 'wrong signature')
  assert.ok(!verifyUpload({ ...base }, creds, 's2').ok, 'other store folder')
  assert.ok(!verifyUpload({ ...base, public_id: `${productFolder('s1')}/../x` , signature: sig(`${productFolder('s1')}/../x`, 5) }, creds, 's1').ok, 'path trick')
  assert.ok(!verifyUpload({ ...base, format: 'exe' }, creds, 's1').ok, 'bad format')
  assert.ok(!verifyUpload({ ...base, bytes: 11 * 1024 * 1024 }, creds, 's1').ok, 'too big')
  assert.ok(!verifyUpload({ ...base, signature: 'zz' }, creds, 's1').ok, 'malformed')
  assert.ok(!verifyUpload({ ...base, resource_type: 'raw' }, creds, 's1').ok, 'raw type')
  assert.ok(!verifyUpload({}, creds, 's1').ok)
})
test('upload signature is for this store folder only', () => {
  const s = createUploadSignature({ cloudName: 'demo', apiKey: '123', apiSecret: 'x' }, 's1', 'video', 1_700_000_000_000)
  assert.equal(s.folder, 'rooharka/s1/products'); assert.equal(s.timestamp, 1_700_000_000); assert.equal(s.uploadUrl, 'https://api.cloudinary.com/v1_1/demo/video/upload')
  assert.equal(s.signature, signParams({ folder: s.folder, timestamp: s.timestamp }, 'x'))
})
test('destroy request is signed', () => {
  const d = createDestroyRequest({ cloudName: 'demo', apiKey: '1', apiSecret: 'x' }, 'a/b', 'image', 5000)
  assert.equal(d.body.get('signature'), signParams({ public_id: 'a/b', timestamp: 5 }, 'x')); assert.equal(d.url, 'https://api.cloudinary.com/v1_1/demo/image/destroy')
})
test('display helpers', () => {
  assert.equal(imageVariant('https://res.cloudinary.com/d/image/upload/v1/a.jpg', 400), 'https://res.cloudinary.com/d/image/upload/f_auto,q_auto,w_400/v1/a.jpg')
  assert.equal(imageVariant('https://other.com/a.jpg', 400), 'https://other.com/a.jpg')
  assert.equal(videoPoster('https://res.cloudinary.com/d/video/upload/v1/a.mp4'), 'https://res.cloudinary.com/d/video/upload/so_0,f_jpg,w_800/v1/a.jpg')
  assert.equal(videoPoster('https://x.com/a.mp4'), null)
})
test('pasted links: https only, known extensions', () => {
  assert.ok(parseExternalMediaUrl('https://x.com/a.JPG').ok)
  const v = parseExternalMediaUrl('https://x.com/v.mp4'); assert.ok(v.ok && v.kind === 'VIDEO')
  for (const bad of ['http://x.com/a.jpg', 'javascript:alert(1)', 'https://x.com/a.php', 'https://u:p@x.com/a.jpg', 'nope']) assert.ok(!parseExternalMediaUrl(bad).ok, bad)
})
