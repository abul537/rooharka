import { promises as dns } from 'node:dns'

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

const safe = async <T,>(p: Promise<T[]>): Promise<T[]> => { try { return await withTimeout(p, 4000) } catch { return [] } }

/** Where a web address points right now (for the owner to compare with what the hosting company asks for). Never throws. */
export async function lookupDomain(host: string): Promise<{ cname: string[]; a: string[] }> {
  const [cname, a] = await Promise.all([safe<string>(dns.resolveCname(host)), safe<string>(dns.resolve4(host))])
  return { cname, a }
}
