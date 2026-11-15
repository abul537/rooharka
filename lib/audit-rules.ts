/** Changes that cannot alter what a shop's visitors see (sign-ins, the fake-order check, private notes, downloads): the shop's cache is kept. */
export const keepsCache = (action: string) => /^(auth|login|session|order\.verification|order\.note|pos\.shift)|\.export$/.test(action)
