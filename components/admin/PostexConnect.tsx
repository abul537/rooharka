import ActionForm from '@/components/admin/ActionForm'
import { Card, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { connectPostexAction, disconnectPostexAction } from '@/app/admin/(panel)/settings/courier-connect-actions'

/** Settings > Couriers > PostEx: paste a token, press Connect. Nothing technical is shown except the one-time webhook link. */
export default function PostexConnect({ connected, lastError, webhookUrl }: { connected: boolean; lastError: string | null; webhookUrl: string }) {
  return (
    <Card title="PostEx: automatic booking" hint="Connect once. After that every new order is sent to PostEx for you and its tracking number appears on the order.">
      {connected ? (
        <div className="space-y-4">
          <p className="flex items-center gap-2 font-medium text-emerald-700"><span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-emerald-600 text-white">✓</span> PostEx is connected</p>
          {lastError && <p role="alert" className="text-sm text-amber-800">The last booking had a problem: {lastError}</p>}
          <details className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
            <summary className="cursor-pointer font-medium">Get live tracking updates (optional)</summary>
            <p className="mt-2 text-slate-600">In your PostEx Merchant Portal, open API &amp; Webhooks and paste this link as your webhook address. PostEx will then tell us the moment a parcel moves.</p>
            <input readOnly value={webhookUrl} className={`${inputCls} mt-2 font-mono text-xs`} aria-label="Webhook link for PostEx" />
            <p className="mt-1 text-xs text-slate-500">Keep this link private: it is your store’s own key.</p>
          </details>
          <ActionForm action={disconnectPostexAction} confirm="Disconnect PostEx? New orders will stop being sent automatically.">
            <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">Disconnect</button>
          </ActionForm>
        </div>
      ) : (
        <ActionForm action={connectPostexAction} className="space-y-3">
          <Field label="PostEx API Token" hint="Generate your token from PostEx Merchant Portal → API & Webhooks, then paste it below.">
            <input name="token" type="password" autoComplete="off" required maxLength={600} className={inputCls} placeholder="Paste your token here" />
          </Field>
          <button className={primaryBtn}>Connect</button>
        </ActionForm>
      )}
    </Card>
  )
}
