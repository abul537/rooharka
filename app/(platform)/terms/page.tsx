import type { Metadata } from 'next'
import Legal from '@/components/platform/Legal'
import { getPlatformSettings } from '@/lib/signup/store'
import { TERMS_VERSION } from '@/lib/signup/rules'

export const metadata: Metadata = { title: 'Terms of Service' }
export const dynamic = 'force-dynamic'

// NOTE FOR THE OWNER: this is a plain-language starting text, not legal advice. Have a lawyer review and adjust it
// (payment terms, refunds, liability) before you rely on it, and bump TERMS_VERSION in lib/signup/rules.ts whenever it changes.
export default async function Terms() {
  const s = await getPlatformSettings()
  return (
    <Legal title="Terms of Service" updated={TERMS_VERSION}>
      <section><h2>1. The service</h2><p>{s.brandName} provides online store software. You use it to sell your own products to your own customers. You are responsible for your products, prices, orders and deliveries.</p></section>
      <section><h2>2. Your account</h2><ul><li>Give accurate details and keep your password and two-factor codes private.</li><li>You are responsible for everything done through your account and your staff logins.</li><li>Tell us at once if you think your account was used without your permission.</li></ul></section>
      <section><h2>3. Plans, trial and payment</h2><p>Your plan, its price and its billing period (monthly or yearly) are shown when you sign up. A free trial, if offered, lasts the number of days shown. After it ends we invoice you for the plan you chose, and you pay by the methods shown on your invoice. Invoices not paid by their due date may lead to your store being paused.</p></section>
      <section><h2>4. Third-party providers</h2><p>Couriers, SMS or WhatsApp providers and payment wallets are separate companies. You contract with them and pay them directly, and their terms apply. We connect your store to them using the keys you provide, but we are not responsible for their services, fees or outages.</p></section>
      <section><h2>5. Acceptable use</h2><ul><li>Do not sell illegal goods or use the service for fraud or harassment.</li><li>Do not try to break, overload or gain unauthorised access to the service or other stores.</li><li>We may suspend a store that breaks these rules or the law.</li></ul></section>
      <section><h2>6. Your data</h2><p>Your store’s data belongs to you. We process it only to run the service, as described in the Privacy Policy.</p></section>
      <section><h2>7. Availability and liability</h2><p>We work to keep the service running but cannot promise it will always be uninterrupted or error-free. To the extent the law allows, we are not liable for indirect losses such as lost sales or profits.</p></section>
      <section><h2>8. Ending the service</h2><p>You may stop using the service at any time by contacting us. We may end or pause an account for non-payment or breach of these terms.</p></section>
      <section><h2>9. Changes and contact</h2><p>We may update these terms and will show the new date above. {s.supportEmail ? `Questions: ${s.supportEmail}.` : 'Contact us through the details on this site.'}</p></section>
    </Legal>
  )
}
