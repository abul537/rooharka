import { db } from '@/lib/db';

/**
 * Province > city > locality lists for the checkout dropdowns.
 * These tables live in the same database as the app, so they are read with the app's own
 * Prisma connection (DATABASE_URL). No separate address connection string is needed.
 * Ids are returned as strings because that is what <select> elements and URLs use.
 */

const toInt = (v: string): number | null => (/^\d{1,9}$/.test(v) ? Number(v) : null);

export async function listProvinces() {
  const rows = await db.province.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
  return rows.map((r) => ({ id: String(r.id), name: r.name }));
}

export async function listCities(provinceId: string) {
  const id = toInt(provinceId);
  if (id === null) return [];
  const rows = await db.city.findMany({ where: { provinceId: id }, orderBy: { name: 'asc' }, select: { id: true, name: true, provinceId: true } });
  return rows.map((r) => ({ id: String(r.id), name: r.name, provinceId: String(r.provinceId) }));
}

export async function listLocalities(cityId: string) {
  const id = toInt(cityId);
  if (id === null) return [];
  const rows = await db.locality.findMany({ where: { cityId: id }, orderBy: { name: 'asc' }, select: { id: true, name: true, cityId: true } });
  return rows.map((r) => ({ id: String(r.id), name: r.name, cityId: String(r.cityId) }));
}
