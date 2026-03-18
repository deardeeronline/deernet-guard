import { getData } from '../data/loader.js';

let _riskyTLDSet = null;

function getRiskyTLDSet() {
  if (!_riskyTLDSet) {
    _riskyTLDSet = new Set(getData().riskyDomains.riskyTLDs);
  }
  return _riskyTLDSet;
}

/**
 * Check if the domain uses a risky TLD.
 * @param {{ hostname: string }} ctx
 * @returns {{ id: string, score: number, detail: string }|null}
 */
export function checkRiskyTLD(ctx) {
  const { hostname } = ctx;
  if (!hostname) return null;

  const parts = hostname.split('.');
  const tld = parts[parts.length - 1].toLowerCase();

  if (getRiskyTLDSet().has(tld)) {
    return { id: 'risky-tld', score: 20, detail: `.${tld}` };
  }

  return null;
}
