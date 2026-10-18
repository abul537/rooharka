import { NextResponse } from 'next/server';
import { listCities } from '@/lib/address-db';

const CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provinceId: string }> }
) {
  const { provinceId } = await params;
  if (!/^[\w-]{1,64}$/.test(provinceId)) {
    return NextResponse.json({ error: 'Invalid province id' }, { status: 400 });
  }
  try {
    const data = await listCities(provinceId);
    // Browsers and the CDN may keep a real list; an empty list is never cached (it may be a hiccup).
    return NextResponse.json(data, { headers: { 'Cache-Control': data.length ? CACHE : 'no-store' } });
  } catch (err) {
    console.error('cities failed:', err);
    return NextResponse.json({ error: 'Failed to load cities' }, { status: 500 });
  }
}
