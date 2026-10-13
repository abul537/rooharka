import { NextResponse } from 'next/server';
import { listProvinces } from '@/lib/address-db';

export async function GET() {
  try {
    const data = await listProvinces();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    });
  } catch (err) {
    console.error('provinces failed:', err);
    return NextResponse.json({ error: 'Failed to load provinces' }, { status: 500 });
  }
}
