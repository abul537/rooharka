'use client'

import { useActionState, type ReactNode } from 'react'

export type ActionState = { ok?: string; error?: string } | null

/** A form wired to a server action that shows its success / error message. */
export default function ActionForm({
  action, children, className, confirm, id,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
  children: ReactNode
  className?: string
  /** Optional "are you sure?" text shown before submitting. */
  confirm?: string
  /** Lets a button elsewhere on the page submit this form via its `form` attribute. */
  id?: string
}) {
  const [state, formAction, pending] = useActionState(action, null)
  return (
    <form
      id={id}
      action={formAction}
      className={className}
      onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault() }}
    >
      <fieldset disabled={pending} className="contents">{children}</fieldset>
      {state?.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p role="status" className="mt-2 text-sm text-emerald-700">{state.ok}</p>}
    </form>
  )
}
