// Minimal service worker: RDAP proxy + storage pruning.
// No ES modules, no imports, no top-level await.
// Build script injects the IANA-bootstrap-generated TLD → RDAP server map below.
// Query URL is always: <base url>/domain/<domain>

var RDAP_SERVERS = __RDAP_SERVERS__;

var RDAP_TIMEOUT = 5000;

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type !== 'RDAP_QUERY') return;

  var domain = message.domain;
  var parts = domain.split('.');
  var tld = parts[parts.length - 1].toLowerCase();
  var server = RDAP_SERVERS[tld];

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

  return true;
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
