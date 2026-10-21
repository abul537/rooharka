import ActionForm from '@/components/admin/ActionForm'
import ServiceCard from '@/components/admin/ServiceCard'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { resolveProvider, type OtpSettings as Otp } from '@/lib/otp/rules'
import { SERVICES, type ServiceView } from '@/lib/services/registry'
import { saveOtpAction, testOtpAction } from '@/app/admin/(panel)/settings/actions'

/** Settings > Phone verification: the on/off switch plus the owner's OWN SMS / WhatsApp account (they pay it, not the platform). */
export default function OtpSettings({ otp, views }: { otp: Otp; views: Map<string, ServiceView> }) {
  const provider = resolveProvider(views.values(), otp.channel)
  const broken = otp.enabled && 'problem' in provider
  return (
    <Card title="Phone verification (stops fake orders)" hint="When ON, a customer who presses Buy must enter a code sent to their phone before the checkout opens, and orders without it are refused. The messages are sent from YOUR own provider account, so the cost is yours: the platform pays nothing.">
      <div className="space-y-6">
        {broken && (
          <p role="alert" className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">
            Verification is ON but cannot send codes: {'problem' in provider ? provider.problem : ''} Customers cannot place orders until this is fixed.
          </p>
        )}
        <ActionForm action={saveOtpAction} className="space-y-4">
          <Check name="phoneVerificationEnabled" label="Verify customers' phone numbers before checkout" defaultChecked={otp.enabled} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Send the code by" hint="WhatsApp needs Twilio with a WhatsApp number.">
              <select name="otpChannel" defaultValue={otp.channel} className={inputCls}>
                <option value="SMS">SMS</option>
                <option value="WHATSAPP">WhatsApp</option>
              </select>
            </Field>
            <Field label="Code length (digits)"><input name="otpLength" inputMode="numeric" defaultValue={otp.length} className={inputCls} /></Field>
            <Field label="Code stays valid for (minutes)"><input name="otpExpiryMinutes" inputMode="numeric" defaultValue={otp.expiryMinutes} className={inputCls} /></Field>
            <Field label="Wrong tries allowed per code"><input name="otpMaxAttempts" inputMode="numeric" defaultValue={otp.maxAttempts} className={inputCls} /></Field>
            <div className="sm:col-span-2">
              <Field label="Most messages per day (your cost cap)" hint="Protects your balance: once reached, customers see “temporarily unavailable” until the next day. Each customer can also request only one code a minute and five an hour.">
                <input name="otpDailyLimit" inputMode="numeric" defaultValue={otp.dailyLimit} className={inputCls} />
              </Field>
            </div>
          </div>
          <button className={primaryBtn}>Save phone verification</button>
        </ActionForm>

        <div className="space-y-4">
          <h3 className="font-semibold">Your message provider</h3>
          {SERVICES.filter((d) => d.type === 'MESSAGING').map((d) => <ServiceCard key={d.key} def={d} view={views.get(d.key)!} showDefault />)}
        </div>

        <ActionForm action={testOtpAction} className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 border border-slate-200 p-3">
          <input type="hidden" name="otpChannel" value={otp.channel} />
          <div className="min-w-56 flex-1">
            <Field label="Send myself a test message" hint="Uses one real message from your provider (billed to you).">
              <input name="testPhone" type="tel" placeholder="Your number, 03001234567" className={inputCls} />
            </Field>
          </div>
          <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium">Send test</button>
        </ActionForm>
      </div>
    </Card>
  )
}
