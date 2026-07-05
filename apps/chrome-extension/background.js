// Minimal service worker: RDAP proxy + remote data refresh + storage pruning.
// No ES modules, no imports, no top-level await.
// Build script injects the IANA-bootstrap-generated TLD → RDAP server map and
// the data-bundle signing public key below.
// RDAP query URL is always: <base url>/domain/<domain>

var RDAP_SERVERS = __RDAP_SERVERS__;
var DATA_PUBLIC_KEY = __DATA_PUBLIC_KEY__; // { alg, spki } or null (remote update disabled)

var DATA_URL = 'https://deardeeronline.github.io/deernet-guard/data/v1/rules.json';
var DATA_REFRESH_ALARM = 'data-refresh';
var DATA_REFRESH_PERIOD_MIN = 24 * 60;

var RDAP_TIMEOUT = 5000;

// Remote RDAP map (if a verified bundle is stored) with baked-in fallback.
// Resolved once per service worker lifetime; reset after a successful refresh.
var _serversPromise = null;
function getRdapServers() {
  if (!_serversPromise) {
    _serversPromise = new Promise(function (resolve) {
      chrome.storage.local.get('remoteData', function (r) {
        var d = r && r.remoteData;
        if (d && d.rdapServers && Object.keys(d.rdapServers).length > 500) {
          resolve(d.rdapServers);
        } else {
          resolve(RDAP_SERVERS);
        }
      });
    });
  }
  return _serversPromise;
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type !== 'RDAP_QUERY') return;

  getRdapServers().then(function (servers) {
    handleRdapQuery(message.domain, servers, sendResponse);
  });
  return true;
});

function handleRdapQuery(domain, servers, sendResponse) {
  var parts = domain.split('.');
  var tld = parts[parts.length - 1].toLowerCase();
  var server = servers[tld];

  if (!server) {
    // TLD has no RDAP service in the IANA bootstrap registry (e.g. .co, .io, .jp).
    // Answer immediately: no network request, and no fallback query to a
    // third-party registry (which would leak the domain and always 404 anyway).
    sendResponse({ registrationDate: null, hasServer: false });
    return;
  }

  var url = server + '/domain/' + domain;
  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, RDAP_TIMEOUT);

  fetch(url, {
    signal: controller.signal,
    headers: { Accept: 'application/rdap+json' },
  })
    .then(function (res) {
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      return res.json();
    })
    .then(function (data) {
      if (!data) {
        sendResponse({ registrationDate: null, hasServer: true });
        return;
      }
      var events = data.events || [];
      var reg = null;
      for (var i = 0; i < events.length; i++) {
        if (events[i].eventAction === 'registration') { reg = events[i]; break; }
      }
      sendResponse({ registrationDate: reg ? reg.eventDate : null, hasServer: true });
    })
    .catch(function () {
      clearTimeout(timeoutId);
      sendResponse({ registrationDate: null, hasServer: true });
    });
}

// --- Remote data refresh ---
// Fetches the signed data bundle from GitHub Pages once a day, verifies the
// ECDSA P-256 signature with the baked-in public key, sanity-validates the
// payload, and stores it as `remoteData`. content.js and the RDAP proxy prefer
// stored remote data over the baked-in copy. Any failure leaves the last good
// data untouched. MV3 allows remotely fetched *data* (JSON) — only remotely
// hosted *code* is banned.

function b64ToBuf(b64) {
  var bin = atob(b64);
  var buf = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// true if version a <= version b ('x.y.z')
function versionLte(a, b) {
  var pa = String(a).split('.'), pb = String(b).split('.');
  for (var i = 0; i < 3; i++) {
    var x = parseInt(pa[i], 10) || 0, y = parseInt(pb[i], 10) || 0;
    if (x !== y) return x < y;
  }
  return true;
}

// Sanity bounds: a bundle that shrinks below these is more likely corrupt or
// truncated than legitimate — reject it rather than silently weaken detection.
function validatePayload(p) {
  if (!p || p.schema !== 1) return 'schema';
  if (typeof p.dataVersion !== 'string' || !p.dataVersion) return 'dataVersion';
  if (typeof p.minAppVersion !== 'string' || !versionLte(p.minAppVersion, chrome.runtime.getManifest().version)) return 'minAppVersion';
  if (!Array.isArray(p.whitelist) || p.whitelist.length < 1000) return 'whitelist';
  if (!Array.isArray(p.trustedSuffixes) || p.trustedSuffixes.length < 3) return 'trustedSuffixes';
  if (!p.riskyDomains || !Array.isArray(p.riskyDomains.riskyTLDs) || p.riskyDomains.riskyTLDs.length < 20) return 'riskyTLDs';
  if (!Array.isArray(p.riskyDomains.riskySubdomainPlatforms) || p.riskyDomains.riskySubdomainPlatforms.length < 5) return 'riskyPlatforms';
  if (!p.sensitiveKeywords || !Array.isArray(p.sensitiveKeywords.zh) || !Array.isArray(p.sensitiveKeywords.en)) return 'keywords';
  if (!p.rdapServers || Object.keys(p.rdapServers).length < 500) return 'rdapServers';
  var s = p.scoring;
  if (!s) return 'scoring';
  var keys = ['domainAgeUnknown', 'domainAgeUnknownRiskyTld', 'suspiciousThreshold', 'dangerThreshold'];
  for (var i = 0; i < keys.length; i++) {
    var v = s[keys[i]];
    if (typeof v !== 'number' || v < 0 || v > 100) return 'scoring:' + keys[i];
  }
  return null;
}

async function refreshData() {
  if (!DATA_PUBLIC_KEY) return; // signing key not generated yet — feature stays dark

  var settings = await chrome.storage.local.get('dataAutoUpdate');
  if (settings.dataAutoUpdate === false) return; // user turned it off

  try {
    var res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) return;
    var envelope = await res.json();
    if (!envelope || envelope.schema !== 1) return;
    if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') return;

    var key = await crypto.subtle.importKey(
      'spki', b64ToBuf(DATA_PUBLIC_KEY.spki),
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
    );
    var valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key,
      b64ToBuf(envelope.signature),
      new TextEncoder().encode(envelope.payload)
    );
    if (!valid) return;

    var payload = JSON.parse(envelope.payload);
    if (validatePayload(payload) !== null) return;

    var existing = await chrome.storage.local.get('remoteData');
    if (existing.remoteData && existing.remoteData.dataVersion === payload.dataVersion) return;

    payload.fetchedAt = Date.now();
    await chrome.storage.local.set({ remoteData: payload });
    _serversPromise = null; // pick up the new RDAP map
  } catch (e) {
    // network error / bad JSON / crypto failure — keep last good data
  }
}

// Ensure the daily alarm exists without resetting its schedule on every
// service worker wake-up.
chrome.alarms.get(DATA_REFRESH_ALARM, function (alarm) {
  if (!alarm) {
    chrome.alarms.create(DATA_REFRESH_ALARM, {
      periodInMinutes: DATA_REFRESH_PERIOD_MIN,
      delayInMinutes: 1,
    });
  }
});

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === DATA_REFRESH_ALARM) refreshData();
});

// --- Storage pruning ---
// report:/rdap: entries are only TTL-checked on read and were never deleted,
// so chrome.storage.local grows without bound. Prune expired entries at most
// once per day, on service worker startup.

var PRUNE_INTERVAL = 24 * 60 * 60 * 1000;
var REPORT_TTL = 10 * 24 * 60 * 60 * 1000; // keep in sync with content.js
var RDAP_TTL = 365 * 24 * 60 * 60 * 1000;
var RDAP_FAIL_TTL = 24 * 60 * 60 * 1000;

function pruneStorage() {
  chrome.storage.local.get(null, function (all) {
    var now = Date.now();
    if (now - (all.lastPrune || 0) < PRUNE_INTERVAL) return;

    var remove = [];
    for (var key in all) {
      var entry = all[key];
      if (!entry || typeof entry.timestamp !== 'number') continue;
      if (key.indexOf('report:') === 0) {
        if (now - entry.timestamp > REPORT_TTL) remove.push(key);
      } else if (key.indexOf('rdap:') === 0) {
        var ttl = entry.registrationDate ? RDAP_TTL : RDAP_FAIL_TTL;
        if (now - entry.timestamp > ttl) remove.push(key);
      }
    }

    if (remove.length > 0) chrome.storage.local.remove(remove);
    chrome.storage.local.set({ lastPrune: now });
  });
}

pruneStorage();
