#!/usr/bin/env node

/**
 * RDAP Server Map Generator for Deernet Guard
 *
 * Source: IANA RDAP Bootstrap Registry (authoritative, RFC 9224)
 *   https://data.iana.org/rdap/dns.json
 *
 * Output:
 *   packages/core/data/rdap-servers.json
 *   { "publication": "<IANA timestamp>", "servers": { "<tld>": "<base url, no trailing slash>" } }
 *
 * Query URL for a domain is always: <base url>/domain/<domain>
 *
 * Usage:
 *   node scripts/generate-rdap-servers.js
 *   npm run generate-rdap-servers
 */

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, 'cache');
const CACHE_FILE = join(CACHE_DIR, 'iana-rdap-dns.json');
const CACHE_TTL_DAYS = 7;
const OUTPUT_FILE = join(__dirname, '..', 'packages', 'core', 'data', 'rdap-servers.json');

const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';

async function fetchBootstrap() {
  if (existsSync(CACHE_FILE)) {
    const ageDays = (Date.now() - statSync(CACHE_FILE).mtimeMs) / 86400000;
    if (ageDays < CACHE_TTL_DAYS) {
      console.log('  [cache] IANA RDAP bootstrap');
      return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
    }
  }
  console.log('  [fetch] ' + BOOTSTRAP_URL);
  const res = await fetch(BOOTSTRAP_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching IANA bootstrap`);
  const text = await res.text();
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, text);
  return JSON.parse(text);
}

async function main() {
  console.log('=== Deernet Guard RDAP Server Map Generator ===');

  const bootstrap = await fetchBootstrap();
  const servers = {};

  for (const [tlds, urls] of bootstrap.services) {
    // Prefer https; IANA lists https for virtually every registry.
    const url = urls.find((u) => u.startsWith('https://')) || urls[0];
    if (!url) continue;
    const base = url.replace(/\/+$/, '');
    for (const tld of tlds) {
      servers[tld.toLowerCase()] = base;
    }
  }

  const hosts = new Set(Object.values(servers).map((u) => new URL(u).host));

  const output = {
    publication: bootstrap.publication,
    servers: Object.fromEntries(Object.entries(servers).sort(([a], [b]) => a.localeCompare(b))),
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + '\n');
  console.log(`\n${Object.keys(servers).length} TLDs across ${hosts.size} RDAP hosts`);
  console.log(`Written to ${OUTPUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
