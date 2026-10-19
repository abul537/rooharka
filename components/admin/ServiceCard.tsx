import ActionForm from '@/components/admin/ActionForm'
import { Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import type { FieldDef, ServiceDef, ServiceView } from '@/lib/services/registry'
import { removeServiceAction, saveServiceAction, testServiceAction } from '@/app/admin/(panel)/settings/service-actions'

const secondaryBtn = 'rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50'

/** One connectable third-party service: credentials (secrets masked), on/off, test and disconnect. */
export default function ServiceCard({ def, view, showDefault }: { def: ServiceDef; view: ServiceView; showDefault?: boolean }) {
  const field = (f: FieldDef, isCredential: boolean) => (
    <Field key={f.name} label={`${f.label}${f.required ? '' : ' (optional)'}`} hint={f.help}>
      <input
        name={`${def.key}.${f.name}`}
        type={f.secret ? 'password' : 'text'}
        autoComplete="off"
        defaultValue={f.secret ? '' : view.values[f.name] ?? ''}
        placeholder={f.secret && view.masked[f.name] ? `${view.masked[f.name]} (saved; leave empty to keep)` : f.placeholder}
        maxLength={600}
        className={inputCls}
        data-credential={isCredential || undefined}
      />
    </Field>
  )
  const status = !view.configured ? 'Not connected' : view.enabled ? (view.lastError ? 'Problem' : 'Connected') : 'Saved, switched off'
  const tone = !view.configured ? 'bg-slate-100 text-slate-700' : view.lastError ? 'bg-red-100 text-red-800' : view.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'

  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{def.name}</h3>
          <p className="text-sm text-slate-600">{def.description}</p>
        </div>
        <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${tone}`}>{status}</span>
      </div>
      {view.lastError && <p role="alert" className="text-sm text-red-700">Last problem: {view.lastError}</p>}

      <ActionForm action={saveServiceAction} className="space-y-3">
        <input type="hidden" name="serviceKey" value={def.key} />
        <div className="grid sm:grid-cols-2 gap-3">
          {def.credentials.map((f) => field(f, true))}
          {def.config.map((f) => field(f, false))}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Check name="enabled" label="Switch on" defaultChecked={view.enabled} />
          {showDefault && <Check name="isDefault" label="Use as my default" defaultChecked={view.isDefault} />}
        </div>
        <button className={primaryBtn}>Save {def.name.split(' (')[0]}</button>
      </ActionForm>

      {view.configured && (
        <div className="flex flex-wrap gap-2">
          <ActionForm action={testServiceAction}>
            <input type="hidden" name="serviceKey" value={def.key} />
            <button className={secondaryBtn}>Test connection</button>
          </ActionForm>
          <ActionForm action={removeServiceAction} confirm={`Disconnect ${def.name}? Its saved keys will be deleted.`}>
            <input type="hidden" name="serviceKey" value={def.key} />
            <button className={`${secondaryBtn} text-red-700`}>Disconnect</button>
          </ActionForm>
        </div>
      )}
    </div>
  )
}
