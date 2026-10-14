import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// The Prisma CLI (db push / migrate / studio) needs a DIRECT connection, not
// the "-pooler" one. Put it in DIRECT_URL; it falls back to DATABASE_URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'],
  },
})
