import { requireAdmin } from '@/lib/auth/guard'
import { loadSettings } from '@/lib/admin/settings'
import { LOCKED_FIELDS, TRUST_ICONS } from '@/lib/admin/settings-rules'
import ActionForm from '@/components/admin/ActionForm'
import ServiceCard from '@/components/admin/ServiceCard'
import { loadServiceViews } from '@/lib/services/store-services'
import { loadCourierConfig } from '@/lib/couriers/store'
import CourierSettings from '@/components/admin/CourierSettings'
import OtpSettings from '@/components/admin/OtpSettings'
import { loadOtpSettings } from '@/lib/otp/service'
import { DEFAULT_OTP_SETTINGS } from '@/lib/otp/rules'
import { SERVICES } from '@/lib/services/registry'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { saveFieldsAction, savePaymentsAction, saveProductPageAction, saveStoreInfoAction, saveTrackingAction } from './actions'

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

export default async function SettingsPage() {
  const admin = await requireAdmin('settings.edit')
  const [{ settings: s, wallets, fields, productPage: pp }, services, courierConfig, otp] = await Promise.all([loadSettings(admin.storeId), loadServiceViews(admin.storeId), loadCourierConfig(admin.storeId), loadOtpSettings(admin.storeId)])
  if (!s) return <p>Store settings are missing. Run the seed again.</p>

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-slate-600 -mt-3">Changes apply to your customers right away.</p>

      <Card title="Store details" hint="Shown to customers on the site and used for support.">
        <ActionForm action={saveStoreInfoAction} className="grid sm:grid-cols-2 gap-4">
          <Field label="Store name"><input name="displayName" defaultValue={s.displayName} required maxLength={60} className={inputCls} /></Field>
          <Field label="Support email"><input name="supportEmail" type="email" defaultValue={s.supportEmail} maxLength={120} className={inputCls} /></Field>
          <Field label="Support phone"><input name="supportPhone" defaultValue={s.supportPhone} placeholder="03001234567" className={inputCls} /></Field>
          <Field label="WhatsApp number"><input name="supportWhatsapp" defaultValue={s.supportWhatsapp} placeholder="03001234567" className={inputCls} /></Field>
          <div className="sm:col-span-2"><button className={primaryBtn}>Save store details</button></div>
        </ActionForm>
      </Card>

      <Card title="Payments and delivery" hint="How customers pay and what delivery costs. Online payments are checked by you before you ship.">
        <ActionForm action={savePaymentsAction} className="space-y-5">
          <Field label="Payment policy">
            <select name="paymentPolicy" defaultValue={s.paymentPolicy} className={inputCls}>
              {Object.entries(POLICY_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Delivery charge (Rs.)" hint="0 for free delivery."><input name="deliveryCharge" inputMode="numeric" defaultValue={s.deliveryCharge} className={inputCls} /></Field>
            <Field label="Free delivery on orders over (Rs.)" hint="Leave empty to always charge delivery."><input name="freeDeliveryOver" inputMode="numeric" defaultValue={s.freeDeliveryOver ?? ''} className={inputCls} /></Field>
            <Field label="Advance amount (only for “advance first”)">
              <select name="advanceAmountMode" defaultValue={s.advanceAmountMode} className={inputCls}>
                <option value="DELIVERY_CHARGE">Equal to the delivery charge</option>
                <option value="FIXED">A fixed amount (Rs.)</option>
                <option value="PERCENT">A percentage of the order</option>
              </select>
            </Field>
            <Field label="Fixed amount or percentage"><input name="advanceAmountValue" inputMode="numeric" defaultValue={s.advanceAmountValue ?? ''} className={inputCls} /></Field>
          </div>
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
          <button className={primaryBtn}>Save payments and delivery</button>
        </ActionForm>
      </Card>

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

      <OtpSettings otp={otp ?? DEFAULT_OTP_SETTINGS} views={services} />

      <CourierSettings config={courierConfig} views={services} />

      <Card title="Order tracking" hint="Customers track orders at /track with their tracking code.">
        <ActionForm action={saveTrackingAction} className="space-y-3">
          <Check name="orderTrackingEnabled" label="Let customers track their orders" defaultChecked={s.orderTrackingEnabled} />
          <Check name="trackingRequiresPhoneLast4" label="Also ask for the last 4 digits of their phone" hint="Recommended: stops strangers from guessing codes." defaultChecked={s.trackingRequiresPhoneLast4} />
          <button className={primaryBtn}>Save tracking</button>
        </ActionForm>
      </Card>


      <Card title="Photos and videos" hint="Product photos and videos are stored in your own Cloudinary account, so you stay in control of cost and files. Cloudinary has a free plan.">
        <div className="space-y-4">
          {SERVICES.filter((d) => d.key === 'cloudinary').map((d) => <ServiceCard key={d.key} def={d} view={services.get(d.key)!} />)}
        </div>
      </Card>

      <Card title="Product page" hint="Switch parts of the product page on or off.">
        <ActionForm action={saveProductPageAction} className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <Check name="showReviews" label="Reviews" defaultChecked={pp.showReviews} />
            <Check name="showFaq" label="Questions and answers" defaultChecked={pp.showFaq} />
            <Check name="showTrustBadges" label="Trust badges" defaultChecked={pp.showTrustBadges} />
            <Check name="showStickyBuyBar" label="Sticky buy bar on phones" defaultChecked={pp.showStickyBuyBar} />
            <Check name="showStockCount" label="“Only N left” warning" defaultChecked={pp.showStockCount} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Show warning when stock is at or below"><input name="lowStockThreshold" inputMode="numeric" defaultValue={pp.lowStockThreshold} className={inputCls} /></Field>
            <Field label="Most a customer can order at once"><input name="maxQuantity" inputMode="numeric" defaultValue={pp.maxQuantity} className={inputCls} /></Field>
            <Field label="Buy button text"><input name="buyButtonLabel" defaultValue={pp.buyButtonLabel} maxLength={30} className={inputCls} /></Field>
            <Field label="Badge text (optional)"><input name="badgeText" defaultValue={pp.badgeText ?? ''} maxLength={80} className={inputCls} /></Field>
            <div className="sm:col-span-2"><Field label="Guarantee text (optional)"><input name="guaranteeText" defaultValue={pp.guaranteeText ?? ''} maxLength={200} className={inputCls} /></Field></div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Trust badges (up to 5)</p>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="grid grid-cols-[8rem_1fr] gap-2">
                <select name={`trustIcon${i}`} defaultValue={pp.trustBadges[i]?.icon ?? 'shield'} className={inputCls} aria-label={`Badge ${i + 1} icon`}>
                  {TRUST_ICONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input name={`trustText${i}`} defaultValue={pp.trustBadges[i]?.text ?? ''} maxLength={60} placeholder="e.g. Cash on delivery all over Pakistan" className={inputCls} aria-label={`Badge ${i + 1} text`} />
              </div>
            ))}
          </div>
          <button className={primaryBtn}>Save product page</button>
        </ActionForm>
      </Card>
    </div>
  )
}
