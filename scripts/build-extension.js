#!/usr/bin/env node

import { cpSync, rmSync, existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EXT_SRC = join(ROOT, 'apps', 'chrome-extension');
const DIST = join(ROOT, 'dist', 'chrome-extension');

// Clean
if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

// Copy all extension source files
cpSync(EXT_SRC, DIST, { recursive: true });
console.log('Copied apps/chrome-extension/ → dist/');

// --- Build content.js: inject PSL + data ---

// 1. Build psl as a self-executing function that returns the psl object
const umdSource = readFileSync(join(ROOT, 'node_modules', 'psl', 'dist', 'psl.umd.cjs'), 'utf-8');
const pslExpr = `(function() { var _e = {}; (${
  umdSource
    .replace(/^\(function\(g,A\)\{.*?\}\)\(this,/, '(')
    .replace(/\);\s*$/, ')')
})(_e); return _e; })()`;

// 2. Read data files
const dataDir = join(ROOT, 'packages', 'core', 'data');
const whitelist = readFileSync(join(dataDir, 'whitelist-domains.json'), 'utf-8').trim();
const trustedSuffixes = readFileSync(join(dataDir, 'trusted-suffixes.json'), 'utf-8').trim();
const riskyDomains = readFileSync(join(dataDir, 'risky-domains.json'), 'utf-8').trim();
const sensitiveKeywords = readFileSync(join(dataDir, 'sensitive-keywords.json'), 'utf-8').trim();
const rdapServers = JSON.parse(readFileSync(join(dataDir, 'rdap-servers.json'), 'utf-8'));

// Short hash of all injected data — combined with the manual rules version so
// cached reports are invalidated whenever a data refresh ships.
const dataHash = createHash('sha256')
  .update([whitelist, trustedSuffixes, riskyDomains, sensitiveKeywords, JSON.stringify(rdapServers.servers)].join('\n'))
  .digest('hex')
  .slice(0, 8);

// 3. Replace placeholders in content.js
// Use function replacer to avoid $ special chars in replacement strings
let contentJs = readFileSync(join(DIST, 'content.js'), 'utf-8');
contentJs = contentJs.replaceAll('__PSL__', () => pslExpr);
contentJs = contentJs.replaceAll('__WHITELIST__', () => whitelist);
contentJs = contentJs.replaceAll('__TRUSTED_SUFFIXES__', () => trustedSuffixes);
contentJs = contentJs.replaceAll('__RISKY_DOMAINS__', () => riskyDomains);
contentJs = contentJs.replaceAll('__SENSITIVE_KEYWORDS__', () => sensitiveKeywords);
contentJs = contentJs.replaceAll('__DATA_HASH__', () => JSON.stringify(dataHash));

writeFileSync(join(DIST, 'content.js'), contentJs);
console.log('Built content.js with injected PSL + data (data hash ' + dataHash + ')');

// 3b. Inject RDAP server map into background.js
let backgroundJs = readFileSync(join(DIST, 'background.js'), 'utf-8');
backgroundJs = backgroundJs.replaceAll('__RDAP_SERVERS__', () => JSON.stringify(rdapServers.servers));
writeFileSync(join(DIST, 'background.js'), backgroundJs);
console.log('Built background.js with ' + Object.keys(rdapServers.servers).length + ' RDAP TLDs (IANA bootstrap ' + rdapServers.publication + ')');

// 3c. Generate manifest host_permissions from the RDAP server map, so adding
// or migrating registries never requires a hand-edited manifest.
const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf-8'));
const rdapOrigins = [...new Set(Object.values(rdapServers.servers).map((u) => 'https://' + new URL(u).host + '/*'))].sort();
manifest.host_permissions = rdapOrigins;
writeFileSync(join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Generated manifest host_permissions: ' + rdapOrigins.length + ' RDAP hosts');

// 4. Generate icon sizes from 128px source
const ICON_SRC = join(EXT_SRC, 'icons', 'icon-128.png');
if (existsSync(ICON_SRC)) {
  const { execSync } = await import('child_process');
  const iconsDir = join(DIST, 'icons');
  mkdirSync(iconsDir, { recursive: true });
  copyFileSync(ICON_SRC, join(iconsDir, 'icon-128.png'));
  // Use sips (macOS built-in) to resize
  for (const size of [48, 16]) {
    const dest = join(iconsDir, 'icon-' + size + '.png');
    copyFileSync(ICON_SRC, dest);
    execSync('sips -z ' + size + ' ' + size + ' ' + dest + ' --out ' + dest, { stdio: 'ignore' });
  }
  console.log('Generated icons: 128, 48, 16');
}

console.log('\nExtension ready at: dist/chrome-extension/');
console.log('Load this directory in chrome://extensions');
