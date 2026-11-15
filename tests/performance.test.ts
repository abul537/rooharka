import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { IMAGE_WIDTHS, imageSrcSet, imageVariant } from '@/lib/media/urls'

const CLD = 'https://res.cloudinary.com/demo/image/upload/v1/shop/a.jpg'
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(`${dir}/${e.name}`) : /\.tsx$/.test(e.name) ? [`${dir}/${e.name}`] : [])

test('pictures are offered in several sizes and the lightest format, and never enlarged', () => {
  const set = imageSrcSet(CLD, 600)!
  const parts = set.split(', ')
  assert.deepEqual(parts.map((p) => p.split(' ')[1]), ['320w', '480w', '640w', '960w', '1280w'], 'up to twice the shown width (for sharp screens), one step above')
  for (const p of parts) assert.match(p, /^https:\/\/res\.cloudinary\.com\/demo\/image\/upload\/f_auto,q_auto,c_limit,w_\d+\/v1\/shop\/a\.jpg \d+w$/)
  assert.equal(imageSrcSet(CLD, 80)!.split(', ').length, 1, 'a thumbnail gets the smallest size only')
  assert.equal(imageSrcSet(CLD, 5000)!.split(', ').length, IMAGE_WIDTHS.length)
  assert.equal(imageSrcSet('https://example.com/a.jpg', 600), null, 'a picture hosted elsewhere has only its one file')
  assert.equal(imageSrcSet('https://res.cloudinary.com/demo/video/upload/v1/a.mp4', 600), null)
  assert.equal(imageVariant(CLD, 600), 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_600/v1/shop/a.jpg')
})

test('every shop picture goes through the one image component', () => {
  const img = readFileSync('components/media/MediaImage.tsx', 'utf8')
  assert.match(img, /loading=\{priority \? 'eager' : 'lazy'\}/); assert.match(img, /fetchPriority=\{priority \? 'high' : undefined\}/)
  assert.match(img, /if \(priority\) preload\(fallback, \{ as: 'image', imageSrcSet: srcSet/, 'the first picture is announced in the page head')
  assert.doesNotMatch(img, /'use client'/, 'no script is sent for pictures')
  // Storefront components do not use a bare <img> for product photos (the logo, a tiny fixed file, and the
  // masonry gallery, whose pictures keep their own shape, are the two documented exceptions).
  const bare = [...files('app/(shop)'), ...files('components/shop'), ...files('components/product'), ...files('components/sections'), ...files('components/checkout')]
    .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<img\b/g)].map(() => f))
  assert.deepEqual([...new Set(bare)].sort(), ['components/sections/registry.tsx', 'components/shop/ShopHeader.tsx'])
  assert.match(readFileSync('components/sections/registry.tsx', 'utf8'), /<img src=\{imageVariant\(s\(b, 'imageUrl'\), 800\)\} alt=\{s\(b, 'alt'\)\} loading="lazy"/)
  // The main product photo is the page's largest picture: it is the one fetched first.
  assert.match(readFileSync('components/product/Gallery.tsx', 'utf8'), /priority=\{active === 0\}/)
})

test('pages are drawn on the server; scripts go to the browser only for things a visitor operates', () => {
  // Pages themselves are never client components.
  for (const f of files('app/(shop)').filter((p) => /\/(page|layout|loading|not-found)\.tsx$/.test(p))) assert.doesNotMatch(readFileSync(f, 'utf8'), /^'use client'/, f)
  const client = [...files('app/(shop)'), ...files('components/shop'), ...files('components/product'), ...files('components/sections'), ...files('components/media')].filter((f) => /^'use client'/.test(readFileSync(f, 'utf8'))).sort()
  assert.deepEqual(client, [
    'app/(shop)/cart/CartView.tsx', 'app/(shop)/checkout/CheckoutFlow.tsx', 'app/(shop)/checkout/steps/addressStep.tsx', 'app/(shop)/checkout/steps/paymentStep.tsx', 'app/(shop)/checkout/success/CopyCode.tsx',
    'app/(shop)/contact/ContactForm.tsx', 'app/(shop)/error.tsx', 'app/(shop)/verify/VerifyFlow.tsx',
    'components/product/Gallery.tsx', 'components/product/ProductTabs.tsx', 'components/product/PurchasePanel.tsx',
    'components/sections/NewsletterForm.tsx', 'components/shop/CartLink.tsx', 'components/shop/MobileMenu.tsx', 'components/shop/Pixels.tsx', 'components/shop/SpeedBeacon.tsx', 'components/shop/VisitBeacon.tsx',
  ], 'a new client component on the storefront is a decision: add it here on purpose')
})

// ------------------------------------------------------------------ measured speed
import { parseSpeedReport, speedIncrements, speedPage, summariseSpeed, seconds, SPEED_MIN_SAMPLES } from '@/lib/speed'
import { STORE_LIMITS, storeLimit } from '@/lib/rate-limit'
import { fitWithin, shouldShrink, SHRINK_MAX_SIDE } from '@/lib/media/shrink'
import { classifyFile } from '@/lib/media/constants'

test('a speed report is checked before it is counted', () => {
  assert.deepEqual(parseSpeedReport({ path: '/product/honey?x=1', lcp: 1830.4, ttfb: 210, cls: 0.03 }), { page: 'product', lcp: 1830, ttfb: 210, cls: 0.03 })
  for (const [path, page] of [['/', 'home'], ['/shop', 'shop'], ['/collections/eid', 'collection'], ['/checkout/success', 'checkout'], ['/about', 'other'], [undefined, 'home'], ['/shopping', 'other']] as const) assert.equal(speedPage(path), page)
  for (const bad of [null, {}, { lcp: 0, ttfb: 100, cls: 0 }, { lcp: 2000, ttfb: -1, cls: 0 }, { lcp: 61_000, ttfb: 100, cls: 0 }, { lcp: 500, ttfb: 900, cls: 0 }, { lcp: '2000', ttfb: 100, cls: 0 }, { lcp: 2000, ttfb: 100, cls: 11 }, { lcp: NaN, ttfb: 1, cls: 0 }]) assert.equal(parseSpeedReport(bad), null, JSON.stringify(bad))
  assert.deepEqual(speedIncrements({ page: 'home', lcp: 2500, ttfb: 800, cls: 0.1 }), { samples: 1, lcpGood: 1, lcpPoor: 0, lcpMsSum: 2500, ttfbGood: 1, ttfbMsSum: 800, clsGood: 1 })
  assert.deepEqual(speedIncrements({ page: 'home', lcp: 4001, ttfb: 801, cls: 0.11 }), { samples: 1, lcpGood: 0, lcpPoor: 1, lcpMsSum: 4001, ttfbGood: 0, ttfbMsSum: 801, clsGood: 0 })
})

test('speed is summarised the way Google judges it: fast when 75 of 100 visits are good', () => {
  const row = (samples: number, lcpGood: number, lcpPoor = 0, lcp = 2000, ttfb = 200) => ({ page: 'home', samples, lcpGood, lcpPoor, lcpMsSum: lcp * samples, ttfbGood: samples, ttfbMsSum: ttfb * samples, clsGood: samples })
  assert.equal(summariseSpeed([row(SPEED_MIN_SAMPLES - 1, 19)]), null, 'too few visits to judge'); assert.equal(summariseSpeed([]), null)
  assert.deepEqual(summariseSpeed([row(60, 50), row(40, 30)]), { samples: 100, lcpGoodShare: 80, lcpAverageMs: 2000, ttfbAverageMs: 200, clsGoodShare: 100, verdict: 'fast' })
  assert.equal(summariseSpeed([row(100, 74, 10)])!.verdict, 'ok'); assert.equal(summariseSpeed([row(100, 40, 30)])!.verdict, 'slow')
  assert.equal(seconds(1830), '1.8 s')
})

test('the speed report and its page stay inside the store, and are limited per visitor and per shop', () => {
  const route = readFileSync('app/api/speed/route.ts', 'utf8')
  assert.match(route, /storeId_day_page: \{ storeId: store\.id, day, page: report\.page \}/); assert.match(route, /isBot\(/); assert.match(route, /storeLimit\(store\.id, 'speed'\)/); assert.match(route, /isPreviewFor\(store\.id\)/)
  assert.match(readFileSync('components/admin/SpeedCard.tsx', 'utf8'), /db\.speedDay\.findMany\(\{ where: \{ storeId, day: \{ gte: since \} \}/)
  const client = readFileSync('lib/speed-client.ts', 'utf8') + readFileSync('components/shop/SpeedBeacon.tsx', 'utf8')
  assert.doesNotMatch(client, /document\.cookie|localStorage|sessionStorage|navigator\.userAgent/, 'nothing personal is read or stored')
  assert.match(client, /Math\.random\(\) \* SPEED_SAMPLE >= 1/, 'only a sample of page loads report')
})

test('one shop cannot use up what all shops share: per-shop ceilings', () => {
  assert.deepEqual(STORE_LIMITS, { orders: 300, visits: 3000, speed: 600, newsletter: 60, export: 6 })
  for (let i = 0; i < 6; i++) assert.equal(storeLimit('shop-A', 'export').ok, true)
  assert.equal(storeLimit('shop-A', 'export').ok, false, 'the seventh export in a minute is refused')
  assert.equal(storeLimit('shop-B', 'export').ok, true, 'another shop is not affected')
  assert.equal(storeLimit('shop-A', 'newsletter').ok, true, 'and a different kind of request has its own ceiling')
  for (const [file, what] of [['app/api/orders/route.ts', 'orders'], ['app/api/visit/route.ts', 'visits'], ['app/api/newsletter/route.ts', 'newsletter'], ['app/admin/(panel)/products/export/route.ts', 'export']] as const) {
    assert.match(readFileSync(file, 'utf8'), new RegExp(`storeLimit\\((store|g\\.admin)\\.(id|storeId), '${what}'\\)`), file)
  }
})

test('photos are made light in the browser before upload', () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 2000, height: 1500 }); assert.deepEqual(fitWithin(1500, 3000), { width: 1000, height: 2000 })
  assert.deepEqual(fitWithin(1200, 800), { width: 1200, height: 800 }, 'never enlarged'); assert.deepEqual(fitWithin(SHRINK_MAX_SIDE, 1), { width: 2000, height: 1 })
  assert.equal(shouldShrink('image/jpeg', 3_000_000, 1000, 800), true, 'heavy'); assert.equal(shouldShrink('image/png', 100_000, 4000, 100), true, 'huge')
  assert.equal(shouldShrink('image/jpeg', 200_000, 1200, 800), false); assert.equal(shouldShrink('image/gif', 9_000_000, 4000, 4000), false, 'animations are left alone')
  assert.equal(shouldShrink('video/mp4', 9_000_000, 4000, 4000), false)
  // What it produces is a file the upload accepts.
  for (const name of ['photo.webp', 'photo.jpg']) assert.equal(classifyFile(name, 250_000).ok, true, name)
  for (const f of ['components/admin/MediaManager.tsx', 'components/admin/MediaPicker.tsx']) assert.match(readFileSync(f, 'utf8'), /const file = await shrinkImage\(original\)/, f)
  const src = readFileSync('lib/media/shrink.ts', 'utf8')
  assert.match(src, /catch \{ return file \}/, 'any failure means: upload the original'); assert.match(src, /blob\.size >= file\.size \* 0\.9\) return file/)
})
