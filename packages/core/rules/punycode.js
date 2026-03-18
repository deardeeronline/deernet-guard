/**
 * Check if the domain uses Punycode (IDN - internationalized domain name).
 * @param {{ hostname: string }} ctx
 * @returns {{ id: string, score: number, detail: string }|null}
 */
export function checkPunycode(ctx) {
  const { hostname } = ctx;
  if (!hostname) return null;

  if (hostname.includes('xn--')) {
    return { id: 'punycode', score: 30, detail: 'IDN (xn--)' };
  }

  return null;
}
