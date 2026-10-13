import { NextResponse } from 'next/server';
import { listCities } from '@/lib/address-db';

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
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    });
  } catch (err) {
    console.error('cities failed:', err);
    return NextResponse.json({ error: 'Failed to load cities' }, { status: 500 });
  }
}
