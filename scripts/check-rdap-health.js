#!/usr/bin/env node

/**
 * RDAP Health Check for Deernet Guard
 *
 * Queries a sample of known-registered domains against the generated RDAP
 * server map (packages/core/data/rdap-servers.json) and verifies each returns
 * HTTP 200 with a registration event. Catches registry endpoint migrations
 * (e.g. the 2025 CentralNic → Radix move) before users see false "query failed"
 * penalties.
 *
 * Exits non-zero if any sample fails.
 *
 * Usage:
 *   node scripts/check-rdap-health.js
 *   npm run check-rdap-health
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP_FILE = join(__dirname, '..', 'packages', 'core', 'data', 'rdap-servers.json');

// TLD → a domain known to be registered under it. gTLD registries must operate
// nic.<tld>, which makes samples easy; ccTLDs use well-known registrations.
const SAMPLES = [
  ['com', 'google.com'],
  ['net', 'cloudflare.net'],
  ['org', 'wikipedia.org'],
  ['xyz', 'abc.xyz'],
  ['site', 'notion.site'],
  ['online', 'nic.online'],
  ['top', 'nic.top'],
  ['shop', 'nic.shop'],
  ['info', 'nic.info'],
  ['tw', 'google.tw'],
  ['uk', 'google.co.uk'],
  ['fr', 'nic.fr'],
];

const TIMEOUT = 10000;

async function checkOne(tld, domain, servers) {
  const base = servers[tld];
  if (!base) return { tld, domain, ok: false, detail: 'no server in map' };

  const url = `${base}/domain/${domain}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { Accept: 'application/rdap+json' },
    });
    // 429 means the endpoint is alive but throttling us — that's healthy
    if (res.status === 429) return { tld, domain, ok: true, detail: `rate limited ${url}` };
    if (!res.ok) return { tld, domain, ok: false, detail: `HTTP ${res.status} ${url}` };
    const data = await res.json();
    const hasReg = (data.events || []).some((e) => e.eventAction === 'registration');
    if (!hasReg) return { tld, domain, ok: false, detail: `no registration event ${url}` };
    return { tld, domain, ok: true, detail: url };
  } catch (e) {
    return { tld, domain, ok: false, detail: `${e.message} ${url}` };
  }
}

async function main() {
  console.log('=== Deernet Guard RDAP Health Check ===\n');

  const map = JSON.parse(readFileSync(MAP_FILE, 'utf-8'));
  console.log(`Map: ${Object.keys(map.servers).length} TLDs (IANA bootstrap ${map.publication})\n`);

  const results = await Promise.all(SAMPLES.map(([tld, domain]) => checkOne(tld, domain, map.servers)));

  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} .${r.tld.padEnd(7)} ${r.domain.padEnd(16)} ${r.ok ? '' : r.detail}`);
    if (!r.ok) failed++;
  }

  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
