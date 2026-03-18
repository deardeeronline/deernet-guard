#!/usr/bin/env node

/**
 * Whitelist Generator for Deernet Guard
 *
 * Sources (auto-fetched):
 *   1. Tranco Top 5000 — global popular domains (https://tranco-list.eu)
 *
 * Sources (manual, auto-merged):
 *   2. packages/core/data/whitelist-*.json — any file matching this pattern
 *      - whitelist-tw.json: Taiwan local sites
 *      - whitelist-io.json: Popular .io domains (since .io has no RDAP)
 *      - whitelist-web3.json: Web3 domains (from MetaMask eth-phishing-detect allowlist)
 *      Add new files as needed, they will be auto-discovered.
 *
 * Filters:
 *   - Adult sites, URL shorteners, content farms are excluded
 *   - Gambling sites (casino, betting, poker) are excluded
 *
 * Output:
 *   packages/core/data/whitelist-domains.json
 *
 * Usage:
 *   node scripts/generate-whitelist.js
 *   npm run generate-whitelist
 */

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CACHE_DIR = join(__dirname, 'cache');
const CACHE_TTL_DAYS = 7;
const DATA_DIR = join(__dirname, '..', 'packages', 'core', 'data');
const OUTPUT_FILE = join(DATA_DIR, 'whitelist-domains.json');

// --- Filters ---

const FILTER_PATTERNS = [
  // Adult
  /^pornhub/i, /^xvideos/i, /^xnxx/i, /^xhamster/i, /^redtube/i,
  /^youporn/i, /^livejasmin/i, /^chaturbate/i, /^stripchat/i, /^xn--/i,
  // URL shorteners
  /^bit\.ly$/i, /^t\.co$/i, /^goo\.gl$/i, /^tinyurl\.com$/i, /^ow\.ly$/i,
  // Content farms
  /^clickbait/i,
  // Gambling
  /casino/i, /betting/i, /poker/i, /^bet\d/i, /gambling/i,
];

function shouldFilter(domain) {
  return FILTER_PATTERNS.some((p) => p.test(domain));
}

// --- HTTP download ---

function download(url) {
  return new Promise((resolve, reject) => {
    const request = (reqUrl) => {
      https.get(reqUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location;
          request(loc.startsWith('http') ? loc : new URL(loc, reqUrl).href);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString()));
        res.on('error', reject);
      }).on('error', reject);
    };
    request(url);
  });
}

function cachedDownload(cacheFile, url, label) {
  if (existsSync(cacheFile)) {
    const ageDays = (Date.now() - statSync(cacheFile).mtimeMs) / 86400000;
    if (ageDays < CACHE_TTL_DAYS) {
      console.log(`  [cache] ${label}`);
      return Promise.resolve(readFileSync(cacheFile, 'utf-8'));
    }
  }
  console.log(`  [fetch] ${label}`);
  return download(url).then((content) => {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cacheFile, content);
    return content;
  });
}

// --- Source: Tranco ---

async function fetchTranco() {
  console.log('\n1. Tranco Top 5000');
  try {
    const csv = await cachedDownload(
      join(CACHE_DIR, 'tranco-top5000.csv'),
      'https://tranco-list.eu/download/Z264G/5000',
      'tranco-list.eu top 5000'
    );
    const domains = csv
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => { const p = l.split(','); return p.length >= 2 ? p[1].trim().toLowerCase() : ''; })
      .filter((d) => d.length > 0 && !shouldFilter(d));
    console.log(`  ${domains.length} domains after filtering`);
    return domains;
  } catch (e) {
    console.error(`  Failed: ${e.message}`);
    return [];
  }
}


// --- Source: Manual whitelist-*.json files ---

function loadManualWhitelists() {
  console.log('\n2. Manual whitelist files (whitelist-*.json)');
  const files = readdirSync(DATA_DIR).filter((f) => f.startsWith('whitelist-') && f.endsWith('.json') && f !== 'whitelist-domains.json');
  let all = [];
  for (const file of files) {
    const domains = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf-8'));
    console.log(`  ${file}: ${domains.length}`);
    all.push(...domains);
  }
  return all;
}

// --- Main ---

async function main() {
  console.log('=== Deernet Guard Whitelist Generator ===');

  const tranco = await fetchTranco();
  const manual = loadManualWhitelists();

  const all = [...new Set([...tranco, ...manual])].sort();
  console.log(`\nTotal: ${all.length} domains`);

  writeFileSync(OUTPUT_FILE, JSON.stringify(all, null, 2) + '\n');
  console.log(`Written to ${OUTPUT_FILE}`);
}

main().catch(console.error);
