import { getData } from '../data/loader.js';

let _whitelistLabels = null;

function getWhitelistLabels() {
  if (!_whitelistLabels) {
    _whitelistLabels = getData().whitelistDomains.map((d) => {
      const parts = d.split('.');
      const secondLast = parts.length > 1 ? parts[parts.length - 2] : '';
      const isCcTld = secondLast.length <= 3 && ['com', 'co', 'net', 'org', 'gov', 'edu', 'ac', 'go'].includes(secondLast);
      const labelParts = isCcTld ? parts.slice(0, -2) : parts.slice(0, -1);
      return { label: labelParts.join('.'), full: d };
    });
  }
  return _whitelistLabels;
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

/**
 * Check if a domain is similar to a whitelisted domain.
 * @param {{ domain: string|null }} ctx
 * @returns {{ id: string, score: number, detail: string }|null}
 */
export function checkDomainSimilarity(ctx) {
  const { domain } = ctx;
  if (!domain) return null;

  const parts = domain.split('.');
  const secondLast = parts.length > 1 ? parts[parts.length - 2] : '';
  const isCcTld = secondLast.length <= 3 && ['com', 'co', 'net', 'org', 'gov', 'edu', 'ac', 'go'].includes(secondLast);
  const labelParts = isCcTld ? parts.slice(0, -2) : parts.slice(0, -1);
  const label = labelParts.join('.');

  if (!label) return null;

  let bestSimilarity = 0;
  let bestMatch = '';

  for (const entry of getWhitelistLabels()) {
    if (!entry.label) continue;
    if (entry.full === domain) continue;

    const dist = levenshtein(label, entry.label);
    const maxLen = Math.max(label.length, entry.label.length);
    const similarity = 1 - dist / maxLen;

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = entry.full;
    }
  }

  if (bestSimilarity >= 0.8) {
    return {
      id: 'domain-similarity',
      score: 25,
      detail: `與 ${bestMatch} 相似 (${(bestSimilarity * 100).toFixed(0)}%)`,
    };
  }

  return null;
}
