// Lets plain Node run our pure-logic tests: maps "@/x" imports to "./x.ts".
import { register } from 'node:module'
register('data:text/javascript,' + encodeURIComponent(`
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
const root = ${JSON.stringify(process.cwd() + '/')}
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@/')) {
    const base = root + spec.slice(2)
    for (const ext of ['.ts', '/index.ts']) if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, ctx)
  }
  return next(spec, ctx)
}`))
