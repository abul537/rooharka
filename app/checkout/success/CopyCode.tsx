'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export default function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked: the code is visible to copy by hand */ }
      }}
      className="inline-flex items-center gap-2 text-sm font-medium text-amber-800 hover:text-amber-900"
    >
      {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
      {copied ? 'Copied' : 'Copy code'}
    </button>
  );
}
