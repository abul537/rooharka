import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { default: 'CSMI', template: '%s | CSMI' },
  robots: { index: false, follow: false },
}

export default function CsmiRoot({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 text-slate-900">{children}</div>
}
