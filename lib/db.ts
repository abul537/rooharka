import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/lib/generated/prisma/client'

// One shared Prisma client for the whole app.
// In development Next.js reloads modules on every edit; without caching the
// client on `globalThis` each reload would open a new set of connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

/**
 * Fails early with a readable message (and never prints the password) when
 * DATABASE_URL is not a proper postgres:// address. A malformed value would
 * otherwise surface later as the confusing "Can't reach database server at base".
 */
function assertValidPostgresUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(
      'DATABASE_URL is not a valid URL. It must look like: postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=verify-full ' +
        '(no spaces, no "psql" prefix, and the whole value inside double quotes).'
    )
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`DATABASE_URL must start with postgresql:// (found "${url.protocol}//").`)
  }
  if (!url.hostname || url.hostname === 'base') {
    throw new Error('DATABASE_URL has no database host. Re-copy the connection string from the Neon Connect dialog.')
  }
}

function createClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
  }
  assertValidPostgresUrl(connectionString)
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 10,
      // Neon closes idle connections; drop ours first so we never reuse a dead one.
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000, // allows for a sleeping Neon database to wake up
      keepAlive: true,
    }),
    // Several sequential queries over a long-distance link can outlast Prisma's 5 second default.
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  })
}

export const db = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
