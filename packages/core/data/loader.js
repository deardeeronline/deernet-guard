// Data loader: resolves JSON data files relative to this module.
// Works in both Node.js and Chrome Extension contexts.

let _data = {};

async function loadJSON(path) {
  const url = new URL(path, import.meta.url);
  const response = await fetch(url);
  return response.json();
}

export async function initData() {
  if (_data.loaded) return _data;

  const [whitelistDomains, trustedSuffixes, riskyDomains, sensitiveKeywords] = await Promise.all([
    loadJSON('./whitelist-domains.json'),
    loadJSON('./trusted-suffixes.json'),
    loadJSON('./risky-domains.json'),
    loadJSON('./sensitive-keywords.json'),
  ]);

  _data = {
    loaded: true,
    whitelistDomains,
    trustedSuffixes,
    riskyDomains,
    sensitiveKeywords,
  };

  return _data;
}

export function getData() {
  if (!_data.loaded) {
    throw new Error('Data not initialized. Call initData() first.');
  }
  return _data;
}
