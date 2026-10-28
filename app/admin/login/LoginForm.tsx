'use client'

import SignInForm from '@/components/auth/SignInForm'
import { loginAction, loginCodeAction, loginRestartAction } from './actions'

export default function LoginForm({ next }: { next: string }) {
  return <SignInForm next={next} loginAction={loginAction} codeAction={loginCodeAction} restartAction={loginRestartAction} />
}
