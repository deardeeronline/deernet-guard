#!/usr/bin/env node

/**
 * Remote data bundle generator for Deernet Guard.
 *
 * Assembles all detection data into a single signed JSON envelope and writes
 * it to site/data/v1/rules.json for GitHub Pages deployment:
 *
 *   { "schema": 1, "signature": "<base64 ECDSA P-256 / SHA-256>", "payload": "<JSON string>" }
 *
 * The signature covers the exact payload string bytes. The extension verifies
 * it with the baked-in public key (packages/core/data/signing-public-key.json)
 * before accepting a bundle — see apps/chrome-extension/background.js.
 *
 * Signing key comes from the DATA_SIGNING_KEY env var (PKCS8 PEM). Generate
 * with scripts/generate-signing-key.js. Pass --allow-unsigned only for local
 * inspection: the extension always rejects unsigned bundles.
 *
 * Usage:
 *   DATA_SIGNING_KEY="$(cat key.pem)" node scripts/generate-data-bundle.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createHash, sign as cryptoSign } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'packages', 'core', 'data');
const OUT_DIR = join(ROOT, 'site', 'data', 'v1');
const OUT_FILE = join(OUT_DIR, 'rules.json');

// Lowest extension version that understands schema 1
const MIN_APP_VERSION = '1.2.0';

const readJson = (f) => JSON.parse(readFileSync(join(DATA_DIR, f), 'utf-8'));

const whitelist = readJson('whitelist-domains.json');
const trustedSuffixes = readJson('trusted-suffixes.json');
const riskyDomains = readJson('risky-domains.json');
const sensitiveKeywords = readJson('sensitive-keywords.json');
const rdapServers = readJson('rdap-servers.json').servers;
const scoring = readJson('scoring.json');

const body = { whitelist, trustedSuffixes, riskyDomains, sensitiveKeywords, rdapServers, scoring };
const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 8);
const dataVersion = new Date().toISOString().slice(0, 10) + '.' + hash;

const payload = JSON.stringify({
  schema: 1,
  dataVersion,
  minAppVersion: MIN_APP_VERSION,
  ...body,
});

let signature = null;
const keyPem = process.env.DATA_SIGNING_KEY;
if (keyPem) {
  // ieee-p1363 (raw r||s) is the signature format WebCrypto's ECDSA verify expects
  signature = cryptoSign('sha256', Buffer.from(payload, 'utf-8'), {
    key: keyPem,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64');
} else if (!process.argv.includes('--allow-unsigned')) {
  console.error('DATA_SIGNING_KEY is not set. Refusing to build an unsigned bundle.');
  console.error('Set the env var (see scripts/generate-signing-key.js) or pass --allow-unsigned for local inspection.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify({ schema: 1, signature, payload }) + '\n');

console.log(`Bundle: ${OUT_FILE}`);
console.log(`  dataVersion: ${dataVersion}`);
console.log(`  minAppVersion: ${MIN_APP_VERSION}`);
console.log(`  signed: ${signature ? 'yes' : 'NO (unsigned — extension will reject this)'}`);
console.log(`  size: ${(payload.length / 1024).toFixed(0)} KB payload`);
