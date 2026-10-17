/** Pakistan has no daylight saving: always UTC+5. */
const PKT_MS = 5 * 3600_000
/** Midnight (PKT) that starts the day `daysAgo` days before today, as a real Date. */
export function startOfPktDay(daysAgo = 0, now = new Date()): Date {
  const pkt = new Date(now.getTime() + PKT_MS)
  const midnightPkt = Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate()) - daysAgo * 86400_000
  return new Date(midnightPkt - PKT_MS)
}
export const formatPkt = (d: Date) =>
  new Intl.DateTimeFormat('en-PK', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d)
