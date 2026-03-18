// Minimal service worker: RDAP proxy only.
// No ES modules, no imports, no top-level await.

const RDAP_SERVERS = {
  // Major TLDs
  com: 'https://rdap.verisign.com/com/v1',
  net: 'https://rdap.verisign.com/net/v1',
  org: 'https://rdap.publicinterestregistry.org/rdap',
  // CentralNic
  xyz: 'https://rdap.centralnic.com/xyz',
  icu: 'https://rdap.centralnic.com/icu',
  fun: 'https://rdap.centralnic.com/fun',
  site: 'https://rdap.centralnic.com/site',
  online: 'https://rdap.centralnic.com/online',
  store: 'https://rdap.centralnic.com/store',
  lol: 'https://rdap.centralnic.com/lol',
  tech: 'https://rdap.centralnic.com/tech',
  space: 'https://rdap.centralnic.com/space',
  monster: 'https://rdap.centralnic.com/monster',
  quest: 'https://rdap.centralnic.com/quest',
  cfd: 'https://rdap.centralnic.com/cfd',
  sbs: 'https://rdap.centralnic.com/sbs',
  cyou: 'https://rdap.centralnic.com/cyou',
  pw: 'https://rdap.centralnic.com/pw',
  // IdentityDigital
  info: 'https://rdap.identitydigital.services/rdap',
  live: 'https://rdap.identitydigital.services/rdap',
  digital: 'https://rdap.identitydigital.services/rdap',
  life: 'https://rdap.identitydigital.services/rdap',
  today: 'https://rdap.identitydigital.services/rdap',
  news: 'https://rdap.identitydigital.services/rdap',
  media: 'https://rdap.identitydigital.services/rdap',
  email: 'https://rdap.identitydigital.services/rdap',
  support: 'https://rdap.identitydigital.services/rdap',
  services: 'https://rdap.identitydigital.services/rdap',
  // Other gTLDs
  top: 'https://rdap.zdnsgtld.com/top',
  shop: 'https://rdap.gmoregistry.net/rdap',
  club: 'https://rdap.nic.club',
  buzz: 'https://rdap.nic.buzz',
  link: 'https://rdap.tucowsregistry.net/rdap',
  click: 'https://rdap.tucowsregistry.net/rdap',
  work: 'https://rdap.nic.work',
  cloud: 'https://rdap.registry.cloud/rdap',
  bid: 'https://rdap.nic.bid',
  win: 'https://rdap.nic.win',
  loan: 'https://rdap.nic.loan',
  cc: 'https://tld-rdap.verisign.com/cc/v1',
  // Country TLDs
  tw: 'https://ccrdap.twnic.tw/taiwan',
  uk: 'https://rdap.nominet.uk/uk',
  fr: 'https://rdap.nic.fr',
  nl: 'https://rdap.sidn.nl',
  au: 'https://rdap.cctld.au/rdap',
  ca: 'https://rdap.ca.fury.ca/rdap',
  br: 'https://rdap.registro.br',
  sg: 'https://rdap.sgnic.sg/rdap',
  no: 'https://rdap.norid.no',
  fi: 'https://rdap.fi/rdap/rdap',
  pl: 'https://rdap.dns.pl',
  cz: 'https://rdap.nic.cz',
  ar: 'https://rdap.nic.ar',
};

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type !== 'RDAP_QUERY') return;

  var domain = message.domain;
  var parts = domain.split('.');
  var tld = parts[parts.length - 1].toLowerCase();
  var isExplicit = !!RDAP_SERVERS[tld];
  var server = RDAP_SERVERS[tld] || 'https://rdap.identitydigital.services/rdap';
  var url = server + '/domain/' + domain;
  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, 5000);

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
        // 404 or empty: if fallback, treat as no server
        sendResponse({ registrationDate: null, hasServer: isExplicit });
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
      sendResponse({ registrationDate: null, hasServer: isExplicit });
    });

  return true;
});
