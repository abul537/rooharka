/**
 * Platform emails (sign-up verification, approval). Sent through Resend's web API with plain `fetch`, so there is
 * nothing extra to install. Set RESEND_API_KEY and MAIL_FROM ("Rooharka <hello@yourdomain.pk>", a domain verified at
 * Resend). Without both, `mailConfigured()` is false and sign-up falls back to manual approval.
 * Failure rules: a timeout, a refusal or a strange reply is reported as "not sent" and NEVER throws; the key never
 * appears in an error.
 */
export const mailConfigured = (env: Record<string, string | undefined> = process.env) => !!env.RESEND_API_KEY && !!env.MAIL_FROM && env.RESEND_API_KEY.length > 8

export interface Mail { to: string; subject: string; text: string; html: string }
type Fetch = typeof fetch

export async function sendMail(mail: Mail, f: Fetch = fetch, env: Record<string, string | undefined> = process.env): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!mailConfigured(env)) return { ok: false, error: 'Email is not set up on the server.' }
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(mail.to)) return { ok: false, error: 'Invalid recipient address.' }
  let res: Response
  try {
    res = await f('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject.slice(0, 200), text: mail.text, html: mail.html }),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
  } catch { return { ok: false, error: 'Could not reach the email service.' } }
  const body = (await res.json().catch(() => null)) as { id?: unknown } | null
  if (res.ok && body && typeof body.id === 'string') return { ok: true }
  return { ok: false, error: res.status === 401 || res.status === 403 ? 'The email service refused our key.' : `The email service could not send it (status ${res.status}).` }
}

// ------------------------------------------------------------------ templates
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const shell = (brand: string, heading: string, bodyHtml: string, button?: { label: string; url: string }) => `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:520px;margin:0 auto;padding:32px 20px"><p style="font-weight:700;font-size:18px;margin:0 0 24px">${escapeHtml(brand)}</p>
<div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e7e5e4"><h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(heading)}</h1>${bodyHtml}
${button ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#1c1917;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:600">${escapeHtml(button.label)}</a></p>` : ''}</div>
<p style="font-size:12px;color:#78716c;margin-top:16px">You received this because someone used this email address on ${escapeHtml(brand)}. If it was not you, you can ignore this message.</p></div></body></html>`

export function verifyEmailMail(o: { brand: string; name: string; link: string; hours: number; to: string }): Mail {
  return {
    to: o.to, subject: `Confirm your email for ${o.brand}`,
    text: `Hello ${o.name},\n\nConfirm your email to finish creating your store:\n${o.link}\n\nThis link works once and expires in ${o.hours} hours.\nIf you did not sign up, ignore this email.\n\n${o.brand}`,
    html: shell(o.brand, 'Confirm your email', `<p style="line-height:1.6">Hello ${escapeHtml(o.name)}, confirm your email to finish creating your store. The link works once and expires in ${o.hours} hours.</p>`, { label: 'Confirm email', url: o.link }),
  }
}

export function alreadyRegisteredMail(o: { brand: string; to: string; loginUrl: string }): Mail {
  return {
    to: o.to, subject: `You already have an account with ${o.brand}`,
    text: `Someone tried to sign up with this email, but it already has an account.\nSign in here: ${o.loginUrl}\nIf it was not you, no action is needed.\n\n${o.brand}`,
    html: shell(o.brand, 'You already have an account', '<p style="line-height:1.6">Someone tried to sign up with this email, but it already has an account. If it was you, sign in instead.</p>', { label: 'Sign in', url: o.loginUrl }),
  }
}

export function approvedMail(o: { brand: string; name: string; to: string; loginUrl: string; shopUrl: string }): Mail {
  return {
    to: o.to, subject: `Your ${o.brand} store is approved`,
    text: `Hello ${o.name},\n\nYour store is ready. Sign in with the email and password you chose:\n${o.loginUrl}\nYour shop address: ${o.shopUrl}\n\n${o.brand}`,
    html: shell(o.brand, 'Your store is approved', `<p style="line-height:1.6">Hello ${escapeHtml(o.name)}, your store is ready. Sign in with the email and password you chose.</p><p style="color:#57534e">Your shop address: ${escapeHtml(o.shopUrl)}</p>`, { label: 'Sign in to your dashboard', url: o.loginUrl }),
  }
}

export function rejectedMail(o: { brand: string; name: string; to: string; reason: string; contact: string }): Mail {
  return {
    to: o.to, subject: `About your ${o.brand} sign-up`,
    text: `Hello ${o.name},\n\nWe could not approve your sign-up${o.reason ? `: ${o.reason}` : '.'}\n${o.contact ? `Questions? ${o.contact}\n` : ''}\n${o.brand}`,
    html: shell(o.brand, 'About your sign-up', `<p style="line-height:1.6">Hello ${escapeHtml(o.name)}, we could not approve your sign-up${o.reason ? `: ${escapeHtml(o.reason)}` : '.'}</p>${o.contact ? `<p style="color:#57534e">Questions? ${escapeHtml(o.contact)}</p>` : ''}`),
  }
}

/** "Your shop / service was approved or not approved", with the owner's reason on a refusal. */
export function decisionMail(o: { brand: string; name: string; to: string; subject: string; heading: string; approved: boolean; what: string; reason: string; contact: string }): Mail {
  const body = o.approved ? `${o.what} has been approved.` : `we could not approve ${o.what} at this time.${o.reason ? ` Reason: ${o.reason}` : ''}`
  return {
    to: o.to, subject: o.subject.slice(0, 150),
    text: `Hello ${o.name},\n\n${o.approved ? 'Good news: ' : ''}${body}\n${!o.approved ? 'If you have fixed the issue or think this is a mistake, reply to this email and we will look again.\n' : ''}${o.contact ? `Questions? ${o.contact}\n` : ''}\n${o.brand}`,
    html: shell(o.brand, o.heading, `<p style="line-height:1.6">Hello ${escapeHtml(o.name)}, ${o.approved ? 'good news: ' : ''}${escapeHtml(body)}</p>${!o.approved ? '<p style="color:#57534e">If you have fixed the issue or think this is a mistake, reply to this email and we will look again.</p>' : ''}${o.contact ? `<p style="color:#57534e">Questions? ${escapeHtml(o.contact)}</p>` : ''}`),
  }
}
