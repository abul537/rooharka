import { NextResponse } from 'next/server';
import { listLocalities } from '@/lib/address-db';

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
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    });
  } catch (err) {
    console.error('localities failed:', err);
    return NextResponse.json({ error: 'Failed to load localities' }, { status: 500 });
  }
}
