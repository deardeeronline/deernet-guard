import { getData } from '../data/loader.js';

let _suffixSet = null;

function getSuffixSet() {
  if (!_suffixSet) {
    _suffixSet = new Set(getData().trustedSuffixes);
  }
  return _suffixSet;
}

/**
 * Check if the domain has a trusted suffix (e.g., gov.tw, .edu, .bank).
 * @param {{ hostname: string }} ctx
 * @returns {{ id: string, score: number, detail: string }|null}
 */
export function checkTrustedSuffix(ctx) {
  const { hostname } = ctx;
  if (!hostname) return null;

  const suffixSet = getSuffixSet();
  const parts = hostname.split('.');

  for (let i = parts.length - 1; i >= 1; i--) {
    const suffix = parts.slice(i).join('.');
    if (suffixSet.has(suffix)) {
      return { id: 'trusted-suffix', score: -40, detail: suffix };
    }
    if (i >= 2) {
      const twoPartSuffix = parts.slice(i - 1).join('.');
      if (suffixSet.has(twoPartSuffix)) {
        return { id: 'trusted-suffix', score: -40, detail: twoPartSuffix };
      }
    }
  }

  const tld = parts[parts.length - 1];
  if (suffixSet.has(tld)) {
    return { id: 'trusted-suffix', score: -40, detail: tld };
  }

  return null;
}
