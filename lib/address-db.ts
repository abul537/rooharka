import { db } from '@/lib/db';
import { groupBy, memoAsync } from '@/lib/memo';

/**
 * Province > city > locality lists for the checkout dropdowns.
 *
 * The dataset is tiny and almost never changes (8 provinces, ~1,060 cities, ~7,200 localities), so the
 * whole thing is loaded ONCE (3 parallel queries) and kept in server memory. Every dropdown request after
 * that is answered instantly, with no database round trip. That matters because each database round trip
 * from Pakistan to a US-hosted database costs a quarter of a second or more.
 *
 * Ids are strings because that is what <select> elements and URLs use.
 */
type Province = { id: string; name: string };
type City = { id: string; name: string; provinceId: string };
type Locality = { id: string; name: string; cityId: string };
interface Dataset {
  provinces: Province[];
  citiesByProvince: Map<string, City[]>;
  localitiesByCity: Map<string, Locality[]>;
}

const TTL_MS = 6 * 60 * 60 * 1000;
const group = groupBy;

async function load(): Promise<Dataset> {
  const [p, c, l] = await Promise.all([
    db.province.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.city.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, provinceId: true } }),
    db.locality.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, cityId: true } }),
  ]);
  return {
    provinces: p.map((r) => ({ id: String(r.id), name: r.name })),
    citiesByProvince: group(c.map((r) => ({ id: String(r.id), name: r.name, provinceId: String(r.provinceId) })), (r) => r.provinceId),
    localitiesByCity: group(l.map((r) => ({ id: String(r.id), name: r.name, cityId: String(r.cityId) })), (r) => r.cityId),
  };
}

// Shared across hot reloads in development so editing a file does not drop the loaded data.
const g = globalThis as unknown as { __addr?: ReturnType<typeof memoAsync<Dataset>> };
const store = (g.__addr ??= memoAsync(TTL_MS, load));
const dataset = () => store.get();

export async function listProvinces() {
  return (await dataset()).provinces;
}
export async function listCities(provinceId: string) {
  return (await dataset()).citiesByProvince.get(provinceId) ?? [];
}
export async function listLocalities(cityId: string) {
  return (await dataset()).localitiesByCity.get(cityId) ?? [];
}

/** Confirms province > city > locality really belong together; returns their names (no database trip once loaded). */
export async function resolveAddress(provinceId: number, cityId: number, localityId: number) {
  const d = await dataset();
  const [p, c, l] = [String(provinceId), String(cityId), String(localityId)];
  const province = d.provinces.find((x) => x.id === p);
  const city = d.citiesByProvince.get(p)?.find((x) => x.id === c);
  const locality = d.localitiesByCity.get(c)?.find((x) => x.id === l);
  return province && city && locality ? { province: province.name, city: city.name, locality: locality.name } : null;
}
