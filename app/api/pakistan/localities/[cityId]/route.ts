import { NextResponse } from 'next/server';
import { listLocalities } from '@/lib/address-db';

const CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cityId: string }> }
) {
  const { cityId } = await params;
  if (!/^[\w-]{1,64}$/.test(cityId)) {
    return NextResponse.json({ error: 'Invalid city id' }, { status: 400 });
  }
  try {
    const data = await listLocalities(cityId);
    // Browsers and the CDN may keep a real list; an empty list is never cached (it may be a hiccup).
    return NextResponse.json(data, { headers: { 'Cache-Control': data.length ? CACHE : 'no-store' } });
  } catch (err) {
    console.error('localities failed:', err);
    return NextResponse.json({ error: 'Failed to load localities' }, { status: 500 });
  }
}
