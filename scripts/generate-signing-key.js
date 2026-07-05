#!/usr/bin/env node

/**
 * One-time signing key generator for the remote data bundle.
 *
 * Generates an ECDSA P-256 key pair (chosen over Ed25519 for universal
 * WebCrypto support across Chrome / Firefox / Safari):
 *   - PUBLIC key  → written to packages/core/data/signing-public-key.json
 *                   (commit this file; the build bakes it into the extension)
 *   - PRIVATE key → printed to stdout ONLY. Add it as the GitHub Actions
 *                   repository secret `DATA_SIGNING_KEY`. Never commit it.
 *
 * Usage:
 *   node scripts/generate-signing-key.js [--force]
 */

import { generateKeyPairSync } from 'crypto';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUB_FILE = join(__dirname, '..', 'packages', 'core', 'data', 'signing-public-key.json');

if (existsSync(PUB_FILE) && !process.argv.includes('--force')) {
  console.error(`Refusing to overwrite existing ${PUB_FILE}`);
  console.error('A new key invalidates all published bundles for already-installed extensions.');
  console.error('If you really mean it, re-run with --force and rotate the DATA_SIGNING_KEY secret.');
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const pkcs8Pem = privateKey.export({ type: 'pkcs8', format: 'pem' });

writeFileSync(PUB_FILE, JSON.stringify({ alg: 'ECDSA-P256-SHA256', spki }, null, 2) + '\n');

console.log(`Public key written to ${PUB_FILE} — commit this file.\n`);
console.log('PRIVATE key below. Add it as the GitHub Actions repository secret DATA_SIGNING_KEY');
console.log('(repo Settings → Secrets and variables → Actions → New repository secret).');
console.log('Do NOT commit it, do NOT paste it anywhere else.\n');
console.log(pkcs8Pem);
