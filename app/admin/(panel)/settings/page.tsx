import { requireAdmin } from '@/lib/auth/guard'
import { loadSettings } from '@/lib/admin/settings'
import { LOCKED_FIELDS, TRUST_ICONS } from '@/lib/admin/settings-rules'
import ActionForm from '@/components/admin/ActionForm'
import ServiceCard from '@/components/admin/ServiceCard'
import { loadServiceViews } from '@/lib/services/store-services'
import { loadCourierConfig } from '@/lib/couriers/store'
import CourierSettings from '@/components/admin/CourierSettings'
import PostexConnect from '@/components/admin/PostexConnect'
import { connectionStatus, webhookKey } from '@/lib/couriers/vault'
import { headers } from 'next/headers'
import OtpSettings from '@/components/admin/OtpSettings'
import { loadOtpSettings } from '@/lib/otp/service'
import { DEFAULT_OTP_SETTINGS } from '@/lib/otp/rules'
import { SERVICES } from '@/lib/services/registry'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Card, Check, Field, Group, inputCls, primaryBtn } from '@/components/admin/ui'
import { SETTINGS_TABS, settingsHref, settingsTab } from '@/lib/admin/settings-tabs'
import { FRAUD_LIMITS } from '@/lib/fraud/rules'
import { PIXEL_HINTS, readPixels } from '@/lib/pixels'
import { EVENT_LABEL, NOTIFY_EVENTS, readNotify } from '@/lib/notify/rules'
import { resolveProvider } from '@/lib/otp/rules'
import { loadExtra } from '@/lib/admin/extra'
import { loadFraudSettings } from '@/lib/fraud/store'
import { saveNotifyAction, savePixelsAction, saveFieldsAction, savePaymentsAction, saveProductPageAction, saveStoreInfoAction, saveFraudAction, saveTrackingAction } from './actions'

export const dynamic = 'force-dynamic'

const FIELD_NAMES: Record<string, string> = {
  firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Mobile number', province: 'Province',
  city: 'City', locality: 'Locality', landmark: 'Street / landmark', addressType: 'Address type (home / office / shop)',
}
const POLICY_TEXT: Record<string, string> = {
  COD_ONLY: 'Cash on delivery only',
  DELIVERY_ADVANCE: 'Customer pays an advance first (e.g. the delivery charge), the rest on delivery',
  FULL_ADVANCE: 'Customer pays everything online first (JazzCash / EasyPaisa)',
  CUSTOMER_CHOICE: 'Customer chooses: cash on delivery, or pay everything online',
}

/**
 * SETTINGS. One group at a time (lib/admin/settings-tabs.ts), chosen in the list on the left: only that group's
 * data is loaded, and each card saves by itself.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const admin = await requireAdmin('settings.edit')
  const tab = settingsTab((await searchParams).tab)
  const current = SETTINGS_TABS.find((t) => t.key === tab)!
  const needsServices = tab === 'checkout' || tab === 'couriers' || tab === 'connections'
  const [loaded, services] = await Promise.all([
    tab === 'couriers' || tab === 'connections' ? null : loadSettings(admin.storeId),
    needsServices ? loadServiceViews(admin.storeId) : null,
  ])
  if (loaded && !loaded.settings) return <p>Store settings are missing. Run the seed again.</p>
  const s = loaded?.settings, wallets = loaded?.wallets, fields = loaded?.fields, pp = loaded?.productPage

  let content: ReactNode = null
  if (tab === 'general' && s) content = (
    <>
      <Card title="Store details" hint="Shown to customers on the site and used for support.">
        <ActionForm action={saveStoreInfoAction} className="grid sm:grid-cols-2 gap-4">
          <Field label="Store name"><input name="displayName" defaultValue={s.displayName} required maxLength={60} className={inputCls} /></Field>
          <Field label="Support email"><input name="supportEmail" type="email" defaultValue={s.supportEmail} maxLength={120} className={inputCls} /></Field>
          <Field label="Support phone"><input name="supportPhone" defaultValue={s.supportPhone} placeholder="03001234567" className={inputCls} /></Field>
          <Field label="WhatsApp number"><input name="supportWhatsapp" defaultValue={s.supportWhatsapp} placeholder="03001234567" className={inputCls} /></Field>
          <div className="sm:col-span-2"><button className={primaryBtn}>Save store details</button></div>
        </ActionForm>
      </Card>
    </>
  )
  else if (tab === 'payments' && s && wallets) content = (
    <>
      <Card title="Payments and delivery" hint="How customers pay and what delivery costs. Online payments are checked by you before you ship.">
        <ActionForm action={savePaymentsAction} className="space-y-5">
          <Group title="How customers pay">
          <Field label="Payment policy">
            <select name="paymentPolicy" defaultValue={s.paymentPolicy} className={inputCls}>
              {Object.entries(POLICY_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <Field label="Advance amount" hint="Only used when the customer pays an advance first.">
              <select name="advanceAmountMode" defaultValue={s.advanceAmountMode} className={inputCls}>
                <option value="DELIVERY_CHARGE">Equal to the delivery charge</option>
                <option value="FIXED">A fixed amount (Rs.)</option>
                <option value="PERCENT">A percentage of the order</option>
              </select>
            </Field>
            <Field label="Fixed amount or percentage" hint="Only for “fixed amount” or “percentage”."><input name="advanceAmountValue" inputMode="numeric" defaultValue={s.advanceAmountValue ?? ''} className={inputCls} /></Field>
          </div>
          </Group>
          <Group title="Delivery charge">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Delivery charge (Rs.)" hint="0 for free delivery."><input name="deliveryCharge" inputMode="numeric" defaultValue={s.deliveryCharge} className={inputCls} /></Field>
            <Field label="Free delivery on orders over (Rs.)" hint="Leave empty to always charge delivery."><input name="freeDeliveryOver" inputMode="numeric" defaultValue={s.freeDeliveryOver ?? ''} className={inputCls} /></Field>
          </div>
          </Group>
          <Group title="Your wallet accounts" hint="Customers who pay online send the money to these accounts; you check each payment before you ship.">
          <div className="grid sm:grid-cols-2 gap-4">
            {(['jazzcash', 'easypaisa'] as const).map((k) => (
              <fieldset key={k} className="rounded-lg border border-slate-200 p-4 space-y-3">
                <legend className="px-1 text-sm font-semibold">{k === 'jazzcash' ? 'JazzCash' : 'EasyPaisa'}</legend>
                <Check name={`${k}Enabled`} label="Accept payments here" defaultChecked={wallets[k].enabled} />
                <Field label="Account number"><input name={`${k}Number`} defaultValue={wallets[k].accountNumber} placeholder="03001234567" className={inputCls} /></Field>
                <Field label="Account holder name"><input name={`${k}Title`} defaultValue={wallets[k].accountTitle} maxLength={60} className={inputCls} /></Field>
              </fieldset>
            ))}
          </div>
          </Group>
          <button className={primaryBtn}>Save payments and delivery</button>
        </ActionForm>
      </Card>
    </>
  )
  else if (tab === 'checkout' && s && fields && services) {
    const [otp, fraud, extra] = await Promise.all([loadOtpSettings(admin.storeId), loadFraudSettings(admin.storeId), loadExtra(admin.storeId)])
    const notify = readNotify(extra), messaging = resolveProvider(services.values(), notify.channel)
    const ipqsOn = !!services.get('ipqs')?.enabled
    content = (
      <>
      <Card title="Checkout form" hint="Choose what customers must fill in. Name, mobile number and address are always required so you can deliver and call.">
        <ActionForm action={saveFieldsAction} className="space-y-4">
          <div className="divide-y divide-slate-100">
            {[...LOCKED_FIELDS.slice(0, 1), 'lastName', 'email', ...LOCKED_FIELDS.slice(1), 'landmark', 'addressType'].map((key) => {
              const f = fields.get(key)
              const locked = (LOCKED_FIELDS as readonly string[]).includes(key)
              const enabled = locked || (f?.enabled ?? true)
              return (
                <div key={key} className="py-3 grid sm:grid-cols-[1fr_1.2fr_auto_auto] gap-3 items-center">
                  <span className="text-sm font-medium">{FIELD_NAMES[key]}{locked && <span className="ml-2 text-xs text-slate-500">always required</span>}</span>
                  <input name={`${key}Label`} defaultValue={f?.label ?? ''} placeholder="Custom label (optional)" maxLength={40} className={inputCls} aria-label={`${FIELD_NAMES[key]} label`} />
                  {locked ? <span className="hidden sm:block" /> : <Check name={`${key}Enabled`} label="Show" defaultChecked={enabled} />}
                  {locked ? <span className="hidden sm:block" /> : <Check name={`${key}Required`} label="Required" defaultChecked={enabled && (f?.required ?? false)} />}
                </div>
              )
            })}
          </div>
          <button className={primaryBtn}>Save checkout form</button>
        </ActionForm>
      </Card>
      <Card title="Fake-order check" hint="Every cash-on-delivery order is checked within seconds, without asking the customer for a code: the phone number, this buyer’s delivered and refused parcels at every shop on the platform, and how many orders they placed today. You see one result on the order: Clear, Review or Blocked, with the reasons. Held orders get no courier until you approve them.">
        <ActionForm action={saveFraudAction} className="space-y-5">
          <Check name="enabled" label="Check every cash-on-delivery order" defaultChecked={fraud.enabled} />
          <Group title="Limits">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Orders per day from one phone" hint={`More than this in 24 hours (all shops together) is blocked. ${FRAUD_LIMITS.velocityLimit[0]} to ${FRAUD_LIMITS.velocityLimit[1]}.`}><input name="velocityLimit" inputMode="numeric" defaultValue={fraud.velocityLimit} className={inputCls} /></Field>
              <Field label="Large first order (times your usual)" hint="A first-time buyer ordering more than this many times your average first order is held for review."><input name="firstOrderMultiple" inputMode="numeric" defaultValue={fraud.firstOrderMultiple} className={inputCls} /></Field>
              <Field label="IP risk score for orders above (Rs.)" hint={ipqsOn ? 'Uses your IPQualityScore account.' : 'Only used after you connect IPQualityScore under Connected services.'}><input name="ipCheckOver" inputMode="numeric" defaultValue={fraud.ipCheckOver} className={inputCls} /></Field>
            </div>
          </Group>
          <p className="text-xs text-slate-500">No automatic check catches every fake order. It stops the obvious ones and shows you where to look; for expensive orders, the “Ask the buyer to confirm on WhatsApp” button on a held order is the surest step.</p>
          <button className={primaryBtn}>Save fake-order check</button>
        </ActionForm>
      </Card>

      <Card title="Messages to customers" hint="Tell customers by SMS or WhatsApp how their order is going. Messages are sent through your own SMS / WhatsApp provider (the one connected under Phone verification below), so each message costs what your provider charges. Tick only the ones worth it; “shipped” is the most useful.">
        <ActionForm action={saveNotifyAction} className="space-y-5">
          {'problem' in messaging && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">No message can be sent yet: {messaging.problem}</p>}
          <Group title="Send a message when the order is">
            <div className="grid gap-3 sm:grid-cols-2">
              {NOTIFY_EVENTS.map((e) => <Check key={e} name={`event-${e}`} label={EVENT_LABEL[e]} defaultChecked={notify.events.includes(e)} />)}
            </div>
          </Group>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Send by"><select name="channel" defaultValue={notify.channel} className={inputCls}><option value="SMS">SMS</option><option value="WHATSAPP">WhatsApp (needs Twilio)</option></select></Field>
            <Field label="At most this many messages a day" hint="A safety limit on your provider’s bill."><input name="dailyLimit" inputMode="numeric" defaultValue={notify.dailyLimit} className={inputCls} /></Field>
          </div>
          <Group title="For you">
            <Check name="ownerEmail" label="Email me when a new order arrives" defaultChecked={notify.ownerEmail} />
          </Group>
          <button className={primaryBtn}>Save messages</button>
        </ActionForm>
      </Card>

      <OtpSettings otp={otp ?? DEFAULT_OTP_SETTINGS} views={services} />

      <Card title="Order tracking" hint="Customers track orders at /track with their tracking code.">
        <ActionForm action={saveTrackingAction} className="space-y-3">
          <Check name="orderTrackingEnabled" label="Let customers track their orders" defaultChecked={s.orderTrackingEnabled} />
          <Check name="trackingRequiresPhoneLast4" label="Also ask for the last 4 digits of their phone" hint="Recommended: stops strangers from guessing codes." defaultChecked={s.trackingRequiresPhoneLast4} />
          <button className={primaryBtn}>Save tracking</button>
        </ActionForm>
      </Card>
      </>
    )
  } else if (tab === 'couriers' && services) {
    const [courierConfig, postex, host] = await Promise.all([loadCourierConfig(admin.storeId), connectionStatus(admin.storeId, 'postex'), headers().then((h) => h.get('host') ?? '')])
    const webhookUrl = `https://${host}/api/webhooks/postex/${admin.storeId}?key=${webhookKey(admin.storeId, 'postex')}`
    content = (
      <>
        <PostexConnect connected={postex.connected} lastError={postex.lastError} webhookUrl={webhookUrl} />
        <CourierSettings config={courierConfig} views={services} />
      </>
    )
  } else if (tab === 'product' && pp) content = (
    <>
      <Card title="Product page options" hint="These switches and words apply to every product. To change the layout of the page (photo side, tabs, order of sections), use Storefront, Product page.">
        <ActionForm action={saveProductPageAction} className="space-y-5">
          <Group title="Show on every product page">
          <div className="grid sm:grid-cols-2 gap-3">
            <Check name="showReviews" label="Reviews" defaultChecked={pp.showReviews} />
            <Check name="showFaq" label="Questions and answers" defaultChecked={pp.showFaq} />
            <Check name="showTrustBadges" label="Trust badges" defaultChecked={pp.showTrustBadges} />
            <Check name="showStickyBuyBar" label="Sticky buy bar on phones" defaultChecked={pp.showStickyBuyBar} />
            <Check name="showStockCount" label="“Only N left” warning" defaultChecked={pp.showStockCount} />
          </div>
          </Group>
          <Group title="Stock and quantity">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Show warning when stock is at or below"><input name="lowStockThreshold" inputMode="numeric" defaultValue={pp.lowStockThreshold} className={inputCls} /></Field>
            <Field label="Most a customer can order at once"><input name="maxQuantity" inputMode="numeric" defaultValue={pp.maxQuantity} className={inputCls} /></Field>
          </div>
          </Group>
          <Group title="Words on the page">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Buy button text"><input name="buyButtonLabel" defaultValue={pp.buyButtonLabel} maxLength={30} className={inputCls} /></Field>
            <Field label="Badge text (optional)"><input name="badgeText" defaultValue={pp.badgeText ?? ''} maxLength={80} className={inputCls} /></Field>
            <div className="sm:col-span-2"><Field label="Guarantee text (optional)"><input name="guaranteeText" defaultValue={pp.guaranteeText ?? ''} maxLength={200} className={inputCls} /></Field></div>
          </div>
          </Group>
          <Group title="Trust badges" hint="Up to 5 short promises shown under the order button. Leave a line empty to skip it.">
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="grid grid-cols-[8rem_1fr] gap-2">
                <select name={`trustIcon${i}`} defaultValue={pp.trustBadges[i]?.icon ?? 'shield'} className={inputCls} aria-label={`Badge ${i + 1} icon`}>
                  {TRUST_ICONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input name={`trustText${i}`} defaultValue={pp.trustBadges[i]?.text ?? ''} maxLength={60} placeholder="e.g. Cash on delivery all over Pakistan" className={inputCls} aria-label={`Badge ${i + 1} text`} />
              </div>
            ))}
          </div>
          </Group>
          <button className={primaryBtn}>Save product page</button>
        </ActionForm>
      </Card>
    </>
  )
  else if (tab === 'connections' && services) { const pixels = readPixels(await loadExtra(admin.storeId)); content = (
    <>
      <Card title="Photos and videos" hint="Product photos and videos are stored in your own Cloudinary account, so you stay in control of cost and files. Cloudinary has a free plan.">
        <div className="space-y-4">
          {SERVICES.filter((d) => d.key === 'cloudinary').map((d) => <ServiceCard key={d.key} def={d} view={services.get(d.key)!} />)}
        </div>
      </Card>
      <Card title="AI writing assistant" hint="Adds a “Generate with AI” button to the product description. It uses your own Anthropic account, so you control the cost (a description costs a tiny fraction of a rupee). Limit: 10 descriptions an hour.">
        <div className="space-y-4">
          {SERVICES.filter((d) => d.key === 'ai').map((d) => <ServiceCard key={d.key} def={d} view={services.get(d.key)!} />)}
        </div>
      </Card>
      <Card title="IP risk score" hint="Optional. Adds one more signal to the fake-order check for larger cash-on-delivery orders: whether the buyer hides behind a VPN or proxy, orders from abroad, or uses a connection known for abuse. It uses your own IPQualityScore account, so you control the cost. The order-value limit is under Checkout and orders.">
        <div className="space-y-4">
          {SERVICES.filter((d) => d.key === 'ipqs').map((d) => <ServiceCard key={d.key} def={d} view={services.get(d.key)!} />)}
        </div>
      </Card>
      <Card title="Advertising pixels" hint="If you run ads on Facebook, Instagram, TikTok or Google, paste your pixel IDs here. Your shop then reports page views, product views, add to cart, checkout and purchases to them, so you can see which ads bring orders. Leave a box empty if you do not use it.">
        <ActionForm action={savePixelsAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {(['meta', 'tiktok', 'ga4'] as const).map((k) => <Field key={k} label={PIXEL_HINTS[k].name} hint={PIXEL_HINTS[k].hint}><input name={k} defaultValue={pixels[k]} maxLength={30} autoComplete="off" className={`${inputCls} font-mono`} /></Field>)}
          </div>
          <button className={primaryBtn}>Save pixels</button>
        </ActionForm>
      </Card>
      <p className="text-sm text-slate-600">Looking for something else? Your SMS and WhatsApp provider is under <Link href={settingsHref('checkout')} className="underline">Checkout and orders</Link>, and courier accounts are under <Link href={settingsHref('couriers')} className="underline">Couriers</Link>.</p>
    </>
  ) }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-slate-600">Each card saves by itself, and changes apply to your customers right away.</p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Settings groups" className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-6 lg:flex-col lg:gap-1 lg:overflow-visible lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:p-2">
          {SETTINGS_TABS.map((t) => (
            <Link key={t.key} href={settingsHref(t.key)} aria-current={t.key === tab ? 'page' : undefined}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:whitespace-normal ${t.key === tab ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 lg:border-0'}`}>
              {t.label}
              <span className={`hidden text-xs font-normal lg:block ${t.key === tab ? 'text-slate-300' : 'text-slate-500'}`}>{t.about}</span>
            </Link>
          ))}
        </nav>
        <div className="max-w-3xl space-y-6">
          <div className="lg:hidden"><h2 className="text-lg font-semibold">{current.label}</h2><p className="text-sm text-slate-600">{current.about}</p></div>
          {content}
        </div>
      </div>
    </div>
  )
}
