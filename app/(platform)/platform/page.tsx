import Link from 'next/link'
import { MapPin, ShieldCheck, Truck, Wallet, PackageSearch, Users, Lock, Globe, Banknote, ArrowRight, Check, Minus } from 'lucide-react'
import PlanCards, { IncludedInAll } from '@/components/platform/PlanCards'
import { getPlatformSettings } from '@/lib/signup/store'
import { getPublicPlans } from '@/lib/signup/public-plans'

export const dynamic = 'force-dynamic'

const FEATURES = [
  { icon: MapPin, title: 'Pakistan address dropdowns', text: 'Customers pick province, city and locality from a full Pakistan address list instead of typing. Cleaner addresses, fewer failed deliveries.' },
  { icon: ShieldCheck, title: 'Fake-order protection', text: 'Switch on a phone-code check before checkout. Only customers who can receive the code place an order, sent through your own SMS or WhatsApp account.' },
  { icon: Truck, title: 'Courier booking and tracking', text: 'Use PostEx, Leopards, TCS or any local company. Book in one click where supported, track every parcel, and let orders update as the courier does.' },
  { icon: Wallet, title: 'Payment rules you control', text: 'Cash on delivery, delivery-fee advance or full advance, with JazzCash and EasyPaisa each switched on or off. You set the policy.' },
  { icon: PackageSearch, title: 'Order tracking page', text: 'Buyers paste their tracking code and see their order and delivery status. It builds trust and cuts "where is my order" calls.' },
  { icon: Users, title: 'Customer profiles', text: 'See each customer’s details, order history and what they bought, in one place.' },
  { icon: Globe, title: 'Your own web address', text: 'Start on a free address right away and connect your own domain when you are ready.' },
  { icon: Lock, title: 'Security built in', text: 'Two-factor sign-in, encrypted API keys, a full audit trail of every change, and each store’s data kept strictly apart.' },
  { icon: Banknote, title: 'No markup on your providers', text: 'You pay couriers, SMS and wallets directly. The platform never sits between you and those costs.' },
]

const COMPARE: { row: string; us: string; others: string; diy: string }[] = [
  { row: 'Pakistan province, city and locality dropdowns', us: 'Built in', others: 'Usually a plain text box or a paid add-on', diy: 'You collect and maintain the data' },
  { row: 'Fake-order check before checkout (phone code)', us: 'One switch in Settings', others: 'Usually a paid add-on', diy: 'Custom development' },
  { row: 'PostEx, Leopards, TCS and local couriers', us: 'Choose yours; tracking included', others: 'Mostly through paid add-ons', diy: 'One integration at a time' },
  { row: 'Cash on delivery and advance-payment rules', us: 'Built in, per store', others: 'Often needs workarounds', diy: 'Custom development' },
  { row: 'Prices in rupees, JazzCash and EasyPaisa', us: 'Built in', others: 'Varies by plan and add-on', diy: 'Custom development' },
]

const FAQ = [
  ['How much does it cost?', 'Plans are listed on the pricing page. You start with a free trial, and no card is needed to begin.'],
  ['Who pays for SMS codes and couriers?', 'You do, directly to those companies. We never add a markup, and the platform is not in the middle of that money.'],
  ['Do I need my own domain?', 'No. Your store starts on a free address. You can connect your own domain later.'],
  ['Can I sell with cash on delivery?', 'Yes. You choose between cash on delivery, a delivery-fee advance, or full advance payment, and you can require a phone-code check on top.'],
  ['Which couriers can I use?', 'PostEx and Leopards can be booked and tracked from your dashboard. TCS and any other local company work by entering the tracking number.'],
  ['Is my data safe?', 'Each store’s data is kept strictly separate. Sign-in supports two-factor protection, your provider keys are stored encrypted, and every change is logged.'],
]

export default async function Home() {
  const [s, plans] = await Promise.all([getPlatformSettings(), getPublicPlans()])
  return (
    <>
      <section className="bg-gradient-to-b from-emerald-50 to-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 text-center">
          <p className="inline-block rounded-full bg-emerald-100 text-emerald-800 text-xs sm:text-sm font-semibold px-4 py-1.5">Built for sellers in Pakistan</p>
          <h1 className="mt-6 text-4xl sm:text-6xl font-bold tracking-tight text-balance">Your online store, ready for Pakistan from day one</h1>
          <p className="mt-6 mx-auto max-w-2xl text-lg text-stone-600 text-balance">Address dropdowns your customers can actually use, protection against fake orders, and courier booking and tracking, all in one dashboard.</p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 text-white px-7 py-3.5 font-semibold hover:bg-emerald-800">{s.trialDays > 0 ? `Start your ${s.trialDays}-day free trial` : 'Create your store'}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
            <Link href="/pricing" className="inline-flex items-center justify-center rounded-lg border border-stone-300 px-7 py-3.5 font-semibold hover:bg-stone-50">See pricing</Link>
          </div>
          <p className="mt-4 text-sm text-stone-500">No card needed. Set up in minutes.</p>
        </div>
      </section>

      <section aria-label="Works with" className="border-y border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm font-semibold text-stone-500">
          {['Cash on delivery', 'JazzCash', 'EasyPaisa', 'PostEx', 'Leopards', 'TCS', 'Rupees (PKR)'].map((n) => <span key={n}>{n}</span>)}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 sm:px-6 pt-24 scroll-mt-20">
        <div className="text-center max-w-2xl mx-auto"><h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Everything a Pakistani store needs</h2><p className="mt-4 text-stone-600">The things other platforms leave you to fix yourself are already here.</p></div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-2xl border border-stone-200 p-6 hover:shadow-md transition-shadow">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800"><Icon className="h-5 w-5" aria-hidden /></span>
              <h3 className="mt-4 font-semibold text-lg">{title}</h3>
              <p className="mt-2 text-sm text-stone-600 leading-relaxed">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="compare" className="mx-auto max-w-6xl px-4 sm:px-6 pt-24 scroll-mt-20">
        <div className="text-center max-w-2xl mx-auto"><h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Why sellers in Pakistan choose {s.brandName}</h2></div>
        <div className="mt-12 overflow-x-auto rounded-2xl border border-stone-200">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="bg-stone-50 text-left"><th className="p-4 font-semibold">What you need</th><th className="p-4 font-semibold text-emerald-800">{s.brandName}</th><th className="p-4 font-semibold text-stone-600">Typical global store builder</th><th className="p-4 font-semibold text-stone-600">Build it yourself</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {COMPARE.map((r) => (
                <tr key={r.row}>
                  <th scope="row" className="p-4 text-left font-medium">{r.row}</th>
                  <td className="p-4 bg-emerald-50/60"><span className="flex gap-2 font-medium text-emerald-900"><Check className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />{r.us}</span></td>
                  <td className="p-4 text-stone-600"><span className="flex gap-2"><Minus className="h-4 w-4 mt-0.5 shrink-0 text-stone-400" aria-hidden />{r.others}</span></td>
                  <td className="p-4 text-stone-600"><span className="flex gap-2"><Minus className="h-4 w-4 mt-0.5 shrink-0 text-stone-400" aria-hidden />{r.diy}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-stone-500">Comparison reflects typical default setups. Other platforms differ by plan and by the add-ons you install.</p>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-24">
        <h2 className="text-center text-3xl sm:text-4xl font-bold tracking-tight">Launch in three steps</h2>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {[['Create your account', 'Choose a plan, name your store and confirm your email.'], ['Add your products and couriers', 'Upload photos, set prices, pick your couriers and payment rules.'], ['Start selling', 'Share your store address. Orders, tracking and customers appear in your dashboard.']].map(([t, d], i) => (
            <li key={t} className="rounded-2xl bg-stone-50 border border-stone-200 p-7"><span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-stone-900 text-white font-bold">{i + 1}</span><h3 className="mt-4 font-semibold text-lg">{t}</h3><p className="mt-2 text-sm text-stone-600">{d}</p></li>
          ))}
        </ol>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-4 sm:px-6 pt-24 scroll-mt-20">
        <div className="text-center max-w-2xl mx-auto mb-14"><h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Simple pricing</h2><p className="mt-4 text-stone-600">Choose a plan. Change it any time with us.</p></div>
        <PlanCards plans={plans} trialDays={s.trialDays} />
        <IncludedInAll />
      </section>

      <section className="mx-auto max-w-3xl px-4 sm:px-6 pt-24">
        <h2 className="text-center text-3xl sm:text-4xl font-bold tracking-tight">Questions, answered</h2>
        <div className="mt-10 divide-y divide-stone-200 border-y border-stone-200">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-5"><summary className="cursor-pointer list-none flex justify-between gap-4 font-semibold">{q}<span className="text-stone-400 group-open:rotate-45 transition-transform text-xl leading-none" aria-hidden>+</span></summary><p className="mt-3 text-stone-600 leading-relaxed">{a}</p></details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 sm:px-6 pt-24">
        <div className="rounded-3xl bg-stone-900 text-white text-center px-6 py-14">
          <h2 className="text-3xl font-bold tracking-tight">Ready to open your store?</h2>
          <p className="mt-3 text-stone-300">Create your account in a few minutes.</p>
          <Link href="/signup" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-7 py-3.5 font-semibold hover:bg-emerald-500">{s.trialDays > 0 ? `Start your ${s.trialDays}-day free trial` : 'Create your store'}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      </section>
    </>
  )
}
