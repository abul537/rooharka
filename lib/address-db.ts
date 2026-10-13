import { Pool } from 'pg';

/**
 * Read-only connection to the shared "Pakistan_Address" database.
 * The connection string comes from ADDRESS_DATABASE_URL (server-side only,
 * never prefixed NEXT_PUBLIC_, never committed to git).
 *
 * If your tables/columns are named differently, change ONLY this mapping.
 * Run `node scripts/inspect-address-db.mjs` to see the real names.
 */
export const ADDRESS_SCHEMA = {
  provinces: { table: 'provinces', id: 'id', name: 'name' },
  cities: { table: 'cities', id: 'id', name: 'name', provinceId: 'province_id' },
  localities: {
    table: 'localities',
    id: 'id',
    name: 'name',
    cityId: 'city_id',
    postalCode: null as string | null, // e.g. 'postal_code', or null if absent
  },
} as const;

declare global {
  // Reuse one pool across hot reloads in development.
  // eslint-disable-next-line no-var
  var __addressPool: Pool | undefined;
}

function getPool(): Pool {
  const connectionString = process.env.ADDRESS_DATABASE_URL;
  if (!connectionString) {
    throw new Error('ADDRESS_DATABASE_URL is not set');
  }
  if (!globalThis.__addressPool) {
    globalThis.__addressPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalThis.__addressPool;
}

const q = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

export async function listProvinces() {
  const s = ADDRESS_SCHEMA.provinces;
  const { rows } = await getPool().query(
    `SELECT ${q(s.id)}::text AS id, ${q(s.name)} AS name FROM ${q(s.table)} ORDER BY ${q(s.name)}`
  );
  return rows as { id: string; name: string }[];
}

export async function listCities(provinceId: string) {
  const s = ADDRESS_SCHEMA.cities;
  const { rows } = await getPool().query(
    `SELECT ${q(s.id)}::text AS id, ${q(s.name)} AS name, ${q(s.provinceId)}::text AS "provinceId"
       FROM ${q(s.table)} WHERE ${q(s.provinceId)}::text = $1 ORDER BY ${q(s.name)}`,
    [provinceId]
  );
  return rows as { id: string; name: string; provinceId: string }[];
}

export async function listLocalities(cityId: string) {
  const s = ADDRESS_SCHEMA.localities;
  const postal = s.postalCode ? `, ${q(s.postalCode)} AS "postalCode"` : '';
  const { rows } = await getPool().query(
    `SELECT ${q(s.id)}::text AS id, ${q(s.name)} AS name, ${q(s.cityId)}::text AS "cityId"${postal}
       FROM ${q(s.table)} WHERE ${q(s.cityId)}::text = $1 ORDER BY ${q(s.name)}`,
    [cityId]
  );
  return rows as { id: string; name: string; cityId: string; postalCode?: string }[];
}
