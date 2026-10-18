'use client';

import { useCallback, useEffect, useState } from 'react';

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
  });

/**
 * Loads a list from our API for a dropdown.
 *  - `url === null` means "nothing to load yet" (e.g. no province chosen) and yields an empty list.
 *  - Switching `url` cancels the previous request, so a slow answer for province A can never
 *    overwrite the list that belongs to province B.
 *  - Temporary failures (e.g. the database waking up) are retried automatically, then shown with a Retry button.
 */
export function useList<T>(url: string | null) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    setItems([]);
    setError(false);
    if (!url) { setLoading(false); return; }
    const ctl = new AbortController();
    setLoading(true);
    (async () => {
      for (let i = 0; i < 3; i++) {
        try {
          const res = await fetch(url, { signal: ctl.signal });
          if (!res.ok) throw new Error(String(res.status));
          const data: unknown = await res.json();
          if (!Array.isArray(data)) throw new Error('unexpected data');
          setItems(data as T[]);
          setLoading(false);
          return;
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
          if (i < 2) await wait(500 * (i + 1) ** 2, ctl.signal); // 0.5s, then 2s
        }
      }
      setError(true);
      setLoading(false);
    })().catch(() => {}); // only the abort of a pending wait lands here
    return () => ctl.abort();
  }, [url, attempt]);

  return { items, loading, error, retry };
}
