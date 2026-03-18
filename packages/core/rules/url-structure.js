/**
 * Check URL structure for phishing indicators.
 * Covers: IP address, @-sign, excessive subdomains, long URL.
 * @param {{ url: string, hostname: string }} ctx
 * @returns {Array<{ id: string, score: number, detail: string }>}
 */
export function checkUrlStructure(ctx) {
  const { url, hostname } = ctx;
  const results = [];

  // IP address detection
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Pattern = /^\[?[0-9a-fA-F:]+\]?$/;
  if (hostname && (ipv4Pattern.test(hostname) || ipv6Pattern.test(hostname.replace(/^\[|\]$/g, '')))) {
    results.push({ id: 'ip-address', score: 25, detail: hostname });
  }

  // @-sign in URL (before the hostname in authority)
  if (url) {
    try {
      // Check for @ in the authority portion (between :// and first /)
      const afterScheme = url.replace(/^https?:\/\//, '');
      const authority = afterScheme.split('/')[0];
      if (authority.includes('@')) {
        results.push({ id: 'url-at-sign', score: 25, detail: '@' });
      }
    } catch {
      // ignore parse errors
    }
  }

  // Excessive subdomains (≥ 4 levels)
  if (hostname) {
    const parts = hostname.split('.');
    // Subtract TLD parts (approximate: if last part is short ccTLD-like, count 2 for TLD)
    const tldParts = parts.length > 1 && parts[parts.length - 2].length <= 3 ? 2 : 1;
    const subdomainDepth = parts.length - tldParts - 1; // -1 for the registrable domain label
    if (subdomainDepth >= 4) {
      results.push({ id: 'excessive-subdomain', score: 15, detail: `${parts.length} 層` });
    }
  }

  return results;
}
