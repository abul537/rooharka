import type { Metadata } from 'next'
import Legal from '@/components/platform/Legal'
import { getPlatformSettings } from '@/lib/signup/store'
import { TERMS_VERSION } from '@/lib/signup/rules'

export const metadata: Metadata = { title: 'Privacy Policy' }
export const dynamic = 'force-dynamic'

// NOTE FOR THE OWNER: a plain-language starting text, not legal advice. Have it reviewed before relying on it.
export default async function Privacy() {
  const s = await getPlatformSettings()
  return (
    <Legal title="Privacy Policy" updated={TERMS_VERSION}>
      <section><h2>What we collect from store owners</h2><ul><li>Your name, email address and mobile number, and your store’s name and address.</li><li>Your password, stored only as a one-way hash that cannot be read back.</li><li>Your sign-up details such as time and network address, to prevent abuse.</li><li>Your plan, invoices and payments to us.</li></ul></section>
      <section><h2>What your store holds about your customers</h2><p>When your customers order, your store records their name, phone, address and order details. You are the owner of that data; we store and process it on your behalf to run your store.</p></section>
      <section><h2>How we use it</h2><ul><li>To create and run your account and store.</li><li>To send you account emails, such as email confirmation and invoices.</li><li>To keep the service secure and prevent fraud.</li></ul><p>We do not sell your data.</p></section>
      <section><h2>Your provider keys</h2><p>Keys you give us for couriers, SMS or wallets are stored encrypted and used only to act on your behalf with those providers.</p></section>
      <section><h2>Sharing</h2><p>We share data only with the providers needed to run the service (for example hosting, database and email delivery) and with the providers you connect yourself, or when the law requires it.</p></section>
      <section><h2>Security</h2><p>Each store’s data is kept separate, sign-in supports two-factor protection, and changes are recorded in an audit log.</p></section>
      <section><h2>Your choices</h2><p>You can ask us to correct or delete your account data. {s.supportEmail ? `Write to ${s.supportEmail}.` : 'Contact us through the details on this site.'}</p></section>
    </Legal>
  )
}
