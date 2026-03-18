import { getData } from '../data/loader.js';

let _psl = null;
let _whitelistSet = null;

export function setPsl(pslModule) {
  _psl = pslModule;
}

function getWhitelistSet() {
  if (!_whitelistSet) {
    _whitelistSet = new Set(getData().whitelistDomains);
  }
  return _whitelistSet;
}

/**
 * Parse a URL or hostname into its registrable domain using PSL.
 * @param {string} urlOrHostname
 * @returns {{ hostname: string, domain: string|null }}
 */
export function parseDomain(urlOrHostname) {
  let hostname;
  try {
    const url = new URL(urlOrHostname);
    hostname = url.hostname;
  } catch {
    hostname = urlOrHostname;
  }

  hostname = hostname.replace(/^\.+|\.+$/g, '').toLowerCase();

  if (!_psl) {
    throw new Error('PSL not initialized. Call setPsl() first.');
  }

  const parsed = _psl.parse(hostname);
  return {
    hostname,
    domain: parsed.domain || null,
  };
}

/**
 * Check if a domain is whitelisted.
 * @param {string} domain
 * @returns {boolean}
 */
export function isWhitelisted(domain) {
  if (!domain) return false;
  return getWhitelistSet().has(domain);
}

/**
 * Run the whitelist rule.
 * @param {{ domain: string|null }} ctx
 * @returns {{ bypass: boolean }}
 */
export function checkWhitelist(ctx) {
  if (!ctx.domain) return { bypass: false };
  return { bypass: isWhitelisted(ctx.domain) };
}
