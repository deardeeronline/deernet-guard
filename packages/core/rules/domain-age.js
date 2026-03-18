// TLD → RDAP server mapping
const RDAP_SERVERS = {
  com: 'https://rdap.verisign.com/com/v1',
  net: 'https://rdap.verisign.com/net/v1',
  org: 'https://rdap.org/domain',
  tw: 'https://rdap.twnic.tw/rdap/domain',
  uk: 'https://rdap.nominet.uk/uk/domain',
  de: 'https://rdap.denic.de/domain',
  jp: 'https://rdap.jprs.jp/rdap/domain',
  au: 'https://rdap.auda.org.au/domain',
  fr: 'https://rdap.nic.fr/domain',
  nl: 'https://rdap.sidn.nl/domain',
  io: 'https://rdap.nic.io/domain',
  xyz: 'https://rdap.centralnic.com/xyz/domain',
  top: 'https://rdap.centralnic.com/top/domain',
  info: 'https://rdap.afilias.net/rdap/info/domain',
};

const RDAP_TIMEOUT = 5000;

/**
 * Get the RDAP server URL for a given domain.
 * @param {string} domain - registrable domain
 * @returns {string|null}
 */
function getRdapUrl(domain) {
  const parts = domain.split('.');
  const tld = parts[parts.length - 1].toLowerCase();
  const server = RDAP_SERVERS[tld];
  if (!server) return null;

  // Some servers use /domain/{name} path format, others use path directly
  if (server.endsWith('/domain')) {
    return `${server}/${domain}`;
  }
  return `${server}/domain/${domain}`;
}

/**
 * Query RDAP for domain registration date.
 * @param {string} domain - registrable domain
 * @param {Function} [fetchFn] - fetch function (for testing/environment flexibility)
 * @returns {Promise<string|null>} registration date ISO string, or null
 */
export async function queryRdap(domain, fetchFn = globalThis.fetch) {
  const url = getRdapUrl(domain);
  if (!url) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RDAP_TIMEOUT);

    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: { Accept: 'application/rdap+json' },
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    const events = data.events || [];
    const registration = events.find(
      (e) => e.eventAction === 'registration'
    );

    return registration?.eventDate || null;
  } catch {
    return null;
  }
}

/**
 * Calculate domain age score based on registration date.
 * @param {string} registrationDate - ISO date string
 * @returns {{ id: string, score: number, detail: string }|null}
 */
export function scoreDomainAge(registrationDate) {
  if (!registrationDate) return null;

  const regDate = new Date(registrationDate);
  const now = new Date();
  const ageDays = Math.floor((now - regDate) / (1000 * 60 * 60 * 24));

  if (ageDays < 30) {
    return { id: 'domain-age', score: 30, detail: `註冊 ${ageDays} 天` };
  }
  if (ageDays < 90) {
    return { id: 'domain-age', score: 15, detail: `註冊 ${ageDays} 天` };
  }

  return null;
}

/**
 * Async check: query RDAP and score domain age.
 * @param {string} domain
 * @param {Function} [fetchFn]
 * @returns {Promise<{ id: string, score: number, detail: string }|null>}
 */
export async function checkDomainAge(domain, fetchFn) {
  const regDate = await queryRdap(domain, fetchFn);
  return scoreDomainAge(regDate);
}
