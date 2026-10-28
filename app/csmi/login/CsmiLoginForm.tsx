'use client'

import SignInForm from '@/components/auth/SignInForm'
import { csmiLoginAction, csmiLoginCodeAction, csmiLoginRestartAction } from './actions'

export default function CsmiLoginForm({ next }: { next: string }) {
  return <SignInForm next={next} loginAction={csmiLoginAction} codeAction={csmiLoginCodeAction} restartAction={csmiLoginRestartAction} />
}
