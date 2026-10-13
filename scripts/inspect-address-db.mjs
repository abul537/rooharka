// Prints the tables, columns and row counts of the address database so the
// mapping in lib/address-db.ts can be set correctly.
// Usage:  node --env-file=.env.local scripts/inspect-address-db.mjs
import pg from 'pg';

const url = process.env.ADDRESS_DATABASE_URL;
if (!url) throw new Error('ADDRESS_DATABASE_URL is not set');

const client = new pg.Client({ connectionString: url });
await client.connect();
const { rows: cols } = await client.query(`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position`);
const tables = [...new Set(cols.map(c => c.table_name))];
for (const t of tables) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM "${t}"`);
  console.log(`\n${t}  (${rows[0].n} rows)`);
  for (const c of cols.filter(c => c.table_name === t)) {
    console.log(`  - ${c.column_name}: ${c.data_type}`);
  }
}
await client.end();
