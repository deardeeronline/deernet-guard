import { initData } from './data/loader.js';
import { parseDomain, checkWhitelist, setPsl } from './rules/whitelist.js';
import { checkTrustedSuffix } from './rules/trusted-suffix.js';
import { checkRiskyTLD } from './rules/risky-tld.js';
import { checkRiskyPlatform } from './rules/risky-platform.js';
import { checkDomainSimilarity } from './rules/domain-similarity.js';
import { checkPunycode } from './rules/punycode.js';
import { checkUrlStructure } from './rules/url-structure.js';
import { checkPageContent } from './rules/page-content.js';

export { setPsl };

/**
 * Initialize the scorer: load data files and set PSL module.
 * Must be called once before analyzeSync().
 * @param {object} pslModule - the psl library instance
 */
export async function init(pslModule) {
  setPsl(pslModule);
  await initData();
}

/**
 * Classify total score into risk level.
 */
export function classifyRisk(score) {
  if (score <= 0) return 'safe';
  if (score < 30) return 'normal';
  if (score < 60) return 'suspicious';
  return 'danger';
}

/**
 * Run all synchronous detection rules on a URL.
 */
export function analyzeSync(url, pageData = {}) {
  const { hostname, domain } = parseDomain(url);

  const { bypass } = checkWhitelist({ domain });
  if (bypass) {
    return { bypass: true, score: 0, level: 'safe', rules: [], domain, hostname };
  }

  const rules = [];

  const trustedSuffix = checkTrustedSuffix({ hostname });
  if (trustedSuffix) rules.push(trustedSuffix);

  const riskyTLD = checkRiskyTLD({ hostname });
  if (riskyTLD) rules.push(riskyTLD);

  const riskyPlatform = checkRiskyPlatform({ hostname });
  if (riskyPlatform) rules.push(riskyPlatform);

  const similarity = checkDomainSimilarity({ domain, hostname });
  if (similarity) rules.push(similarity);

  const punycode = checkPunycode({ hostname });
  if (punycode) rules.push(punycode);

  const urlRules = checkUrlStructure({ url, hostname });
  rules.push(...urlRules);

  const contentRules = checkPageContent({ pageData });
  rules.push(...contentRules);

  const score = rules.reduce((sum, r) => sum + r.score, 0);
  const level = classifyRisk(score);

  return { bypass: false, score, level, rules, domain, hostname };
}

/**
 * Update an existing analysis result with an additional rule.
 */
export function updateWithRule(result, rule) {
  if (!rule) return result;

  const rules = [...result.rules, rule];
  const score = rules.reduce((sum, r) => sum + r.score, 0);
  const level = classifyRisk(score);

  return { ...result, score, level, rules };
}
