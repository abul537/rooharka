'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { validatePakistaniPhone } from '@/lib/validation';

interface Props { next: string; length: number }

const box = 'w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 border-gray-300';
const button = 'w-full rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 disabled:opacity-60';

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: { error?: string; retryAfterSeconds?: number; length?: number } }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: 'We could not reach the server. Check your connection and try again.' } };
  }
}

export default function VerifyFlow({ next, length }: Props) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0); // seconds until a new code may be requested
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  useEffect(() => { if (step === 'code') codeRef.current?.focus(); }, [step]);

  async function sendCode() {
    const problem = validatePakistaniPhone(phone);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    const r = await post('/api/otp/send', { phone });
    setBusy(false);
    if (r.ok) { setStep('code'); setCode(''); setWait(60); return; }
    setError(r.data.error ?? 'Something went wrong. Please try again.');
    if (r.data.retryAfterSeconds) setWait(r.data.retryAfterSeconds);
    // A code was sent a moment ago: let the customer enter it instead of dead-ending.
    if (r.data.retryAfterSeconds && step === 'phone' && r.data.error?.includes('wait')) setStep('code');
  }

  async function confirm() {
    if (!new RegExp(`^\\d{${length}}$`).test(code.trim())) { setError(`Enter the ${length}-digit code.`); return; }
    setBusy(true); setError(null);
    const r = await post('/api/otp/verify', { phone, code: code.trim() });
    if (r.ok) { router.replace(next); return; } // keep the button disabled while navigating
    setBusy(false);
    setError(r.data.error ?? 'Something went wrong. Please try again.');
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
      {error && <p role="alert" className="mb-5 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</p>}

      {step === 'phone' ? (
        <form onSubmit={(e) => { e.preventDefault(); void sendCode(); }} className="space-y-4" noValidate>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Mobile number</span>
            <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03001234567" className={box} />
          </label>
          <button disabled={busy} className={button}>{busy ? 'Sending…' : 'Send code'}</button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void confirm(); }} className="space-y-4" noValidate>
          <p className="text-sm text-gray-600">We sent a {length}-digit code to <span className="font-semibold">{phone}</span>.</p>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Verification code</span>
            <input ref={codeRef} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, length))}
              inputMode="numeric" autoComplete="one-time-code" maxLength={length} placeholder={'•'.repeat(length)}
              className={`${box} text-center text-2xl tracking-[0.4em]`} />
          </label>
          <button disabled={busy} className={button}>{busy ? 'Checking…' : 'Verify and continue'}</button>
          <div className="flex justify-between text-sm">
            <button type="button" onClick={() => { setStep('phone'); setError(null); }} className="text-gray-600 underline">Change number</button>
            <button type="button" disabled={busy || wait > 0} onClick={() => void sendCode()} className="text-amber-700 underline disabled:text-gray-400 disabled:no-underline">
              {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
