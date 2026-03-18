import { getData } from '../data/loader.js';

/**
 * Check if the domain is hosted on a free subdomain platform.
 * @param {{ hostname: string }} ctx
 * @returns {{ id: string, score: number, detail: string }|null}
 */
export function checkRiskyPlatform(ctx) {
  const { hostname } = ctx;
  if (!hostname) return null;

  const lower = hostname.toLowerCase();
  const platforms = getData().riskyDomains.riskySubdomainPlatforms;

  for (const platform of platforms) {
    if (lower.endsWith(`.${platform}`) || lower === platform) {
      return { id: 'risky-platform', score: 15, detail: platform };
    }
  }

  return null;
}
