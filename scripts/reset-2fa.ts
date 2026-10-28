// Switches OFF two-factor protection for one login, for the day someone loses their phone AND their recovery codes.
//
//   pnpm admin:reset-2fa you@example.com
//
// Runs on YOUR computer with database access, so only the person who controls the server can do it.
// The person signs in with their password, then turns protection back on from "My security".
import 'dotenv/config'
import { db } from '../lib/db'

async function main() {
  const email = (process.argv[2] ?? '').trim().toLowerCase()
  if (!email) throw new Error('Usage: pnpm admin:reset-2fa you@example.com')
  const user = await db.user.findUnique({ where: { email }, select: { id: true, storeId: true, twoFactorEnabled: true } })
  if (!user) throw new Error(`No login with the email ${email}.`)
  await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecretEnc: null, twoFactorRecovery: [], twoFactorLastStep: null } })
  await db.session.deleteMany({ where: { userId: user.id } }) // sign out every browser, to be safe
  await db.auditLog.create({ data: { storeId: user.storeId, userId: user.id, action: 'auth.2fa_reset_by_operator', entity: 'User', entityId: user.id } })
  console.log(user.twoFactorEnabled ? `Two-factor protection switched off for ${email}. They are signed out everywhere.` : `${email} did not have two-factor protection on. They are signed out everywhere.`)
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
