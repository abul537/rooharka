// Creates a dashboard login (or resets the password of an existing one).
//
//   pnpm admin:create
//
// The password is typed here, on YOUR computer, hidden as you type. It is hashed
// before it is saved and is never printed, logged or sent anywhere else.
import 'dotenv/config'
import { db } from '../lib/db'
import { hashPassword, passwordProblem } from '../lib/auth/password'

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question)
    const stdin = process.stdin
    let value = ''
    if (hidden && stdin.isTTY) stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\u0003') process.exit(1) // Ctrl+C
        if (ch === '\r' || ch === '\n') {
          stdin.off('data', onData)
          if (hidden && stdin.isTTY) stdin.setRawMode(false)
          stdin.pause()
          process.stdout.write('\n')
          return resolve(value)
        }
        if (ch === '\u007f' || ch === '\b') {
          if (value.length) {
            value = value.slice(0, -1)
            if (!hidden) process.stdout.write('\b \b')
          }
        } else {
          value += ch
          if (!hidden) process.stdout.write(ch)
        }
      }
    }
    stdin.on('data', onData)
  })
}

async function main() {
  const slug = (await ask('Store slug [mppmhk]: ')).trim() || 'mppmhk'
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true } })
  if (!store) throw new Error(`No store with slug "${slug}". Run "pnpm db:seed" first.`)

  const email = (await ask('Email: ')).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That does not look like an email address.')

  const existing = await db.user.findUnique({ where: { email }, select: { id: true, storeId: true } })
  if (existing && existing.storeId !== store.id) throw new Error('That email already belongs to another account.')

  const name = existing ? undefined : (await ask('Full name: ')).trim() || 'Store owner'
  const roleInput = existing ? '' : (await ask('Role (owner / manager / staff) [owner]: ')).trim().toLowerCase() || 'owner'
  const role = ({ owner: 'STORE_OWNER', manager: 'STORE_MANAGER', staff: 'STORE_STAFF' } as const)[roleInput as 'owner']
  if (!existing && !role) throw new Error('Role must be owner, manager or staff.')

  const password = await ask('Password (at least 12 characters, hidden): ', true)
  const problem = passwordProblem(password, email)
  if (problem) throw new Error(problem)
  if (password !== (await ask('Repeat password: ', true))) throw new Error('The two passwords did not match.')

  const passwordHash = await hashPassword(password)
  if (existing) {
    await db.user.update({ where: { id: existing.id }, data: { passwordHash, failedLogins: 0, lockedUntil: null } })
    await db.session.deleteMany({ where: { userId: existing.id } }) // signs the user out everywhere
    console.log(`Password updated for ${email}. All their sessions were signed out.`)
  } else {
    await db.user.create({ data: { email, name: name!, role: role!, passwordHash, storeId: store.id } })
    console.log(`Created ${roleInput} login ${email} for store "${store.name}". Sign in at /admin/login`)
  }
}

main()
  .catch((e) => {
    console.error(`\nError: ${e instanceof Error ? e.message : e}`)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
