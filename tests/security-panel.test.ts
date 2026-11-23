import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The security page's forms start with no state (null). Every action they call must accept that, or the build fails.
test('security actions accept the empty starting state the security panel gives them', () => {
  const actions = readFileSync('lib/auth/security-actions.ts', 'utf8'), panel = readFileSync('components/auth/SecurityPanel.tsx', 'utf8')
  for (const name of ['confirmTwoFactorAction', 'disableTwoFactorAction', 'regenerateCodesAction', 'changePasswordAction']) {
    assert.match(actions, new RegExp(`export async function ${name}\\(_: SecurityState \\| null, fd: FormData\\)`), name)
    assert.match(panel, new RegExp(name), `${name} is still used by the panel`)
  }
  assert.equal((panel.match(/useActionState<SecurityState \| null, FormData>\([^]*?, null\)/g) ?? []).length, 5, 'all five forms start from null')
})
