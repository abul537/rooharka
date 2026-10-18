import { NextResponse } from 'next/server';
import { listProvinces } from '@/lib/address-db';

const CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

export async function GET() {
  try {
    const data = await listProvinces();
    // Browsers and the CDN may keep a real list; an empty list is never cached (it may be a hiccup).
    return NextResponse.json(data, { headers: { 'Cache-Control': data.length ? CACHE : 'no-store' } });
  } catch (err) {
    console.error('provinces failed:', err);
    return NextResponse.json({ error: 'Failed to load provinces' }, { status: 500 });
  }
}
