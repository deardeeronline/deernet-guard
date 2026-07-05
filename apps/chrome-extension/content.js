// Content Script: all detection logic runs here.
// Build script injects data and PSL library into the placeholders below.

(function () {
  'use strict';

  // --- Guard: only run on HTML documents ---
  if (document.contentType && !document.contentType.startsWith('text/html')) return;

  // === PSL (injected by build) ===
  const psl = __PSL__;

  // === Data (injected by build) ===
  const WHITELIST = new Set(__WHITELIST__);
  const TRUSTED_SUFFIXES = new Set(__TRUSTED_SUFFIXES__);
  const RISKY_DOMAINS = __RISKY_DOMAINS__;
  const SENSITIVE_KEYWORDS = __SENSITIVE_KEYWORDS__;
  const ALL_KEYWORDS = [...SENSITIVE_KEYWORDS.zh, ...SENSITIVE_KEYWORDS.en.map(k => k.toLowerCase())];

  // === Cache constants ===
  // Cache key version = manual rules version + build-time hash of injected data,
  // so both logic changes and data refreshes invalidate cached reports.
  const RULES_VERSION = '12.' + __DATA_HASH__;
  const REPORT_TTL = 10 * 24 * 60 * 60 * 1000;
  const RDAP_TTL = 365 * 24 * 60 * 60 * 1000;
  const RDAP_FAIL_TTL = 24 * 60 * 60 * 1000; // failed lookups retry after a day

  // === Domain parsing ===
  function parseDomain(urlStr) {
    let hostname;
    try { hostname = new URL(urlStr).hostname; } catch { hostname = urlStr; }
    hostname = hostname.replace(/^\.+|\.+$/g, '').toLowerCase();
    const parsed = psl.parse(hostname);
    return { hostname, domain: parsed.domain || null };
  }

  // === Rules ===
  function checkWhitelist(domain) {
    return domain && WHITELIST.has(domain);
  }

  const TRUSTED_PREFIXES = /^(gov|edu|mil|ac|go)\./;

  function checkTrustedSuffix(hostname) {
    // Use PSL to get the TLD/suffix
    const parsed = psl.parse(hostname);
    const tld = parsed.tld || '';

    // Pattern: gov.*/edu.*/mil.*/ac.*/go.* recognized by PSL as public suffix
    if (TRUSTED_PREFIXES.test(tld)) {
      return { id: 'trusted-suffix', score: -40, detail: tld };
    }

    // Special cases from list: bank, insurance, gc.ca, etc.
    if (TRUSTED_SUFFIXES.has(tld)) {
      return { id: 'trusted-suffix', score: -40, detail: tld };
    }

    return null;
  }

  function checkRiskyPlatform(hostname) {
    const lower = hostname.toLowerCase();
    for (const p of RISKY_DOMAINS.riskySubdomainPlatforms) {
      if (lower.endsWith('.' + p) || lower === p) return { id: 'risky-platform', score: 30, detail: p };
    }
    return null;
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    return dp[m][n];
  }

  function extractLabel(d) {
    const parts = d.split('.');
    const sl = parts.length > 1 ? parts[parts.length - 2] : '';
    const isCc = sl.length <= 3 && ['com','co','net','org','gov','edu','ac','go'].includes(sl);
    return (isCc ? parts.slice(0, -2) : parts.slice(0, -1)).join('.');
  }

  const whitelistLabels = __WHITELIST__.map(d => ({ label: extractLabel(d), full: d }));

  function checkSimilarity(domain) {
    if (!domain) return null;
    const label = extractLabel(domain);
    if (!label) return null;
    let best = 0, match = '';
    for (const e of whitelistLabels) {
      if (!e.label || e.full === domain) continue;
      // similarity ≥ 0.8 requires edit distance ≤ 0.2 × maxLen, and distance is
      // at least the length difference — skip pairs that can't possibly match
      const maxLen = Math.max(label.length, e.label.length);
      if (Math.abs(label.length - e.label.length) > 0.2 * maxLen) continue;
      const dist = levenshtein(label, e.label);
      const sim = 1 - dist / Math.max(label.length, e.label.length);
      if (sim > best) { best = sim; match = e.full; }
    }
    if (best >= 0.8) return { id: 'domain-similarity', score: 25, detail: '與 ' + match + ' 相似 (' + (best * 100).toFixed(0) + '%)' };
    return null;
  }

  function checkPunycode(hostname) {
    if (hostname.includes('xn--')) return { id: 'punycode', score: 30, detail: 'IDN (xn--)' };
    return null;
  }

  function checkUrlStructure(url, hostname) {
    const results = [];
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) results.push({ id: 'ip-address', score: 30, detail: hostname });
    try {
      const auth = url.replace(/^https?:\/\//, '').split('/')[0];
      if (auth.includes('@')) results.push({ id: 'url-at-sign', score: 25, detail: '@' });
    } catch {}
    const parts = hostname.split('.');
    const tldParts = parts.length > 1 && parts[parts.length - 2].length <= 3 ? 2 : 1;
    if (parts.length - tldParts - 1 >= 4) results.push({ id: 'excessive-subdomain', score: 15, detail: parts.length + ' 層' });
    return results;
  }

  function checkPageContent(title, metaKeywords, metaDescription, hasPassword) {
    const results = [];
    const text = [title, metaKeywords, metaDescription].join(' ').toLowerCase();
    const hit = ALL_KEYWORDS.find(kw => text.includes(kw.toLowerCase()));
    if (hit) results.push({ id: 'sensitive-keyword', score: 20, detail: hit });
    if (hasPassword) results.push({ id: 'password-input', score: 20, detail: null });
    return results;
  }

  function classifyRisk(score) {
    if (score <= 0) return 'low';
    if (score < 30) return 'normal';
    if (score < 60) return 'suspicious';
    return 'danger';
  }

  // === Cache helpers ===
  async function getCache(key) {
    const r = await chrome.storage.local.get(key);
    return r[key] || null;
  }
  async function setCache(key, value) {
    await chrome.storage.local.set({ [key]: value });
  }
  async function getReport(domain) {
    const e = await getCache('report:' + domain);
    if (!e || Date.now() - e.timestamp > REPORT_TTL) return null;
    if (e.rulesVersion !== RULES_VERSION) return null; // rules changed, re-run
    return e;
  }
  async function setReport(domain, report) {
    await setCache('report:' + domain, { ...report, rulesVersion: RULES_VERSION, timestamp: Date.now() });
  }

  // === RDAP (via service worker proxy) ===
  function queryRdap(domain) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'RDAP_QUERY', domain }, res => {
        if (chrome.runtime.lastError || !res) { resolve({ registrationDate: null, hasServer: false }); return; }
        resolve(res);
      });
    });
  }

  function scoreDomainAge(regDate) {
    if (!regDate) return null;
    const days = Math.floor((Date.now() - new Date(regDate).getTime()) / (1000 * 60 * 60 * 24));
    if (days < 30) return { id: 'domain-age', score: 30, detail: '註冊 ' + days + ' 天' };
    if (days < 90) return { id: 'domain-age', score: 15, detail: '註冊 ' + days + ' 天' };
    return null;
  }

  // === Warning overlay ===
  let warningHost = null;

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  const RULE_LABELS = {
    'risky-platform': '使用免費子域名平台',
    'domain-age': '域名註冊時間短',
    'domain-age-unknown': '無法驗證域名年齡',
    'domain-similarity': '域名與知名網站相似',
    'punycode': '域名使用國際化編碼 (IDN)',
    'ip-address': 'URL 使用 IP 位址',
    'url-at-sign': 'URL 含 @ 混淆',
    'excessive-subdomain': '過多子域名層級',
    'long-url': 'URL 過長',
    'sensitive-keyword': '頁面含敏感關鍵字',
    'password-input': '頁面要求輸入密碼',
    'trusted-suffix': '受信任域名後綴',
  };

  function showWarning(data) {
    hideWarning();
    const { score, level, rules, domain } = data;
    const isDanger = level === 'danger';

    warningHost = document.createElement('div');
    warningHost.id = 'deernet-guard-warning';
    const shadow = warningHost.attachShadow({ mode: 'closed' });

    const bgColor = isDanger ? '#dc2626' : '#f59e0b';
    const bgLight = isDanger ? '#fef2f2' : '#fffbeb';
    const titleText = isDanger ? '🚨 此網站高度危險' : '⚠️ 此網站可能有風險';
    const titleColor = isDanger ? '#991b1b' : '#92400e';
    const domainColor = isDanger ? '#dc2626' : '#d97706';
    const domainBg = isDanger ? '#fee2e2' : '#fef3c7';
    const domainBorder = isDanger ? '#fca5a5' : '#fcd34d';

    const rulesHtml = rules
      .map(r => '<li>' + (RULE_LABELS[r.id] || r.id) + (r.detail ? ' (' + escapeHtml(r.detail) + ')' : '') + '</li>')
      .join('');

    shadow.innerHTML = `
      <style>
        :host { all:initial; position:fixed!important; top:0!important; left:0!important; width:100vw!important; height:100vh!important; z-index:2147483647!important; display:flex!important; align-items:center!important; justify-content:center!important; background:rgba(0,0,0,0.6)!important; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important; }
        .card { background:${bgLight}; border:3px solid ${bgColor}; border-radius:16px; padding:48px 40px; max-width:520px; width:90vw; text-align:center; box-shadow:0 25px 50px rgba(0,0,0,0.3); }
        .title { font-size:28px; font-weight:700; color:${titleColor}; margin:0 0 16px; }
        .domain { font-size:24px; font-family:"SF Mono","Fira Code","Cascadia Code",Consolas,"Courier New",monospace; font-weight:700; color:${domainColor}; background:${domainBg}; border:2px solid ${domainBorder}; border-radius:8px; padding:12px 20px; margin:0 0 24px; word-break:break-all; letter-spacing:0.5px; }
        .subtitle { font-size:15px; color:#374151; margin:0 0 12px; }
        ul { text-align:left; margin:0 0 24px; padding:0 0 0 24px; color:#374151; font-size:15px; line-height:1.8; }
        .actions { display:flex; flex-direction:column; align-items:center; gap:16px; }
        .btn-analyze { display:inline-block; padding:10px 24px; background:${bgColor}; color:white; border:none; border-radius:8px; font-size:15px; font-weight:600; cursor:pointer; text-decoration:none; }
        .btn-continue { background:none; border:none; color:#9ca3af; font-size:13px; cursor:pointer; padding:4px 8px; }
        .btn-continue:hover { color:#6b7280; }
        .btn-continue:disabled { color:#d1d5db; cursor:default; }
      </style>
      <div class="card">
        <div id="main">
          <h1 class="title">${titleText}</h1>
          <div class="domain">${escapeHtml(domain || '')}</div>
          <p class="subtitle">此網站觸發了以下安全規則：</p>
          <ul>${rulesHtml}</ul>
          <div class="actions">
            <button class="btn-continue" id="btn-continue">我了解風險，繼續瀏覽</button>
          </div>
        </div>
      </div>`;

    document.documentElement.appendChild(warningHost);

    const btnContinue = shadow.getElementById('btn-continue');
    btnContinue.addEventListener('click', () => {
      btnContinue.disabled = true;
      let remaining = 3;
      btnContinue.textContent = '繼續瀏覽（' + remaining + '）';
      const iv = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(iv);
          hideWarning();
        } else {
          btnContinue.textContent = '繼續瀏覽（' + remaining + '）';
        }
      }, 1000);
    });
  }

  function hideWarning() {
    if (warningHost && warningHost.parentNode) {
      warningHost.parentNode.removeChild(warningHost);
      warningHost = null;
    }
  }

  // === Debug overlay ===
  function showDebugOverlay(data) {
    hideWarning();
    const { score, level, rules, domain } = data;
    const isLow = score < 30;

    warningHost = document.createElement('div');
    warningHost.id = 'deernet-guard-warning';
    const shadow = warningHost.attachShadow({ mode: 'closed' });

    const bgColor = isLow ? '#22c55e' : (level === 'danger' ? '#dc2626' : '#f59e0b');
    const bgLight = isLow ? '#f0fdf4' : (level === 'danger' ? '#fef2f2' : '#fffbeb');
    const titleColor = isLow ? '#166534' : (level === 'danger' ? '#991b1b' : '#92400e');

    const rulesHtml = rules.length > 0
      ? rules.map(r => '<li>' + (RULE_LABELS[r.id] || r.id) + (r.detail ? ' (' + escapeHtml(r.detail) + ')' : '') + ' <span class="score">' + (r.score > 0 ? '+' : '') + r.score + '</span></li>').join('')
      : '<li class="no-rules">未觸發任何規則</li>';

    shadow.innerHTML = `
      <style>
        :host { all:initial; position:fixed!important; top:0!important; left:0!important; width:100vw!important; height:100vh!important; z-index:2147483647!important; display:flex!important; align-items:center!important; justify-content:center!important; background:rgba(0,0,0,0.6)!important; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important; }
        .card { background:${bgLight}; border:3px solid ${bgColor}; border-radius:16px; padding:40px 36px; max-width:480px; width:90vw; text-align:center; box-shadow:0 25px 50px rgba(0,0,0,0.3); }
        .badge { display:inline-block; font-size:12px; font-weight:600; background:${bgColor}; color:white; padding:3px 10px; border-radius:99px; margin-bottom:12px; letter-spacing:0.5px; }
        .domain { font-size:22px; font-family:"SF Mono","Fira Code","Cascadia Code",Consolas,"Courier New",monospace; font-weight:700; color:${titleColor}; margin:0 0 8px; word-break:break-all; letter-spacing:0.5px; }
        .score-line { font-size:16px; color:${titleColor}; font-weight:700; margin:0 0 16px; }
        ul { text-align:left; margin:0 0 20px; padding:0 0 0 20px; color:#374151; font-size:14px; line-height:1.8; }
        .score { color:#9ca3af; font-size:12px; margin-left:4px; }
        .no-rules { list-style:none; color:#9ca3af; margin-left:-20px; text-align:center; }
        .btn-close { padding:8px 28px; background:${bgColor}; color:white; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; }
        .btn-close:hover { opacity:0.9; }
      </style>
      <div class="card">
        <div class="badge">DEBUG</div>
        <div class="domain">${escapeHtml(domain || '')}</div>
        <div class="score-line">分數：${score}（${level}）</div>
        <ul>${rulesHtml}</ul>
        <button class="btn-close" id="btn-close">關閉</button>
      </div>`;

    document.documentElement.appendChild(warningHost);
    shadow.getElementById('btn-close').addEventListener('click', hideWarning);
  }

  // === Late password field detection ===
  // The initial scan runs at document_idle; SPAs often mount login forms later.
  // Watch for a password input appearing after the fact, add the rule to the
  // stored report, and escalate to a warning if the score crosses the threshold.
  function watchForPassword(report, cacheKey) {
    if (report.rules.some((r) => r.id === 'password-input')) return;

    const apply = async () => {
      const rules = [...report.rules, { id: 'password-input', score: 20, detail: null }];
      const score = rules.reduce((s, r) => s + r.score, 0);
      const level = classifyRisk(score);
      const updated = { ...report, score, level, rules };
      await setReport(cacheKey, updated);
      if (!updated.ignored && (level === 'suspicious' || level === 'danger')) {
        showWarning(updated);
      }
    };

    if (document.querySelector('input[type="password"]')) { apply(); return; }

    const observer = new MutationObserver(() => {
      if (document.querySelector('input[type="password"]')) {
        observer.disconnect();
        apply();
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['type'],
    });
  }

  // === Main flow ===
  async function run() {
    const url = location.href;
    const { hostname, domain } = parseDomain(url);
    const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    const displayDomain = isIP ? hostname : (domain || hostname);

    if (!domain && !isIP) return;

    // Check debug mode
    const debugData = await getCache('debugMode');
    const debugMode = !!debugData;

    // Whitelist bypass
    if (checkWhitelist(domain)) {
      const report = { score: 0, level: 'bypass', rules: [], domain: displayDomain, ignored: false };
      await setReport(displayDomain, report);
      if (debugMode) showDebugOverlay(report);
      return;
    }

    // Check cache
    const cacheKey = displayDomain;
    const cached = await getReport(cacheKey);
    if (cached) {
      if (!cached.ignored && (cached.level === 'suspicious' || cached.level === 'danger')) {
        showWarning(cached);
      } else if (debugMode) {
        showDebugOverlay(cached);
      }
      // Reports are cached per domain from whichever page was scanned first,
      // so this page may have a password field the cached report doesn't know about.
      watchForPassword(cached, cacheKey);
      return;
    }

    // Collect page data
    const title = document.title || '';
    const metaKw = document.querySelector('meta[name="keywords"]')?.content || '';
    const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
    const hasPw = !!document.querySelector('input[type="password"]');

    // Run all local rules
    const rules = [];
    const ts = checkTrustedSuffix(hostname); if (ts) rules.push(ts);
    const rp = checkRiskyPlatform(hostname); if (rp) rules.push(rp);
    const sim = checkSimilarity(domain); if (sim) rules.push(sim);
    const pc = checkPunycode(hostname); if (pc) rules.push(pc);
    rules.push(...checkUrlStructure(url, hostname));
    rules.push(...checkPageContent(title, metaKw, metaDesc, hasPw));

    // RDAP domain age — skip for trusted suffixes and IP addresses
    const isTrusted = !!ts;
    const tld = domain ? domain.split('.').pop().toLowerCase() : '';

    if (!isTrusted && !isIP) {
      let rdapCached = await getCache('rdap:' + domain);
      let regDate = null;
      let hasServer = false;

      // Failed lookups are cached too (short TTL) so a broken or missing RDAP
      // server doesn't trigger a fresh query on every page load.
      const rdapTtl = rdapCached && rdapCached.registrationDate ? RDAP_TTL : RDAP_FAIL_TTL;
      if (rdapCached && Date.now() - rdapCached.timestamp < rdapTtl) {
        regDate = rdapCached.registrationDate;
        hasServer = rdapCached.hasServer !== false; // entries from older versions lack hasServer
      } else {
        const rdapResult = await queryRdap(domain);
        regDate = rdapResult.registrationDate;
        hasServer = rdapResult.hasServer;
        await setCache('rdap:' + domain, { registrationDate: regDate, hasServer, timestamp: Date.now() });
      }

      if (regDate) {
        const ageRule = scoreDomainAge(regDate);
        if (ageRule) rules.push(ageRule);
      } else if (!hasServer) {
        const isRiskyTLD = RISKY_DOMAINS.riskyTLDs.includes(tld);
        rules.push({ id: 'domain-age-unknown', score: isRiskyTLD ? 30 : 20, detail: '無法查詢域名年齡 (.' + tld + ')' });
      } else {
        rules.push({ id: 'domain-age-unknown', score: 20, detail: '域名年齡查詢失敗' });
      }
    }

    // Final score
    const score = rules.reduce((s, r) => s + r.score, 0);
    const level = classifyRisk(score);

    const report = { score, level, rules, domain: displayDomain, ignored: false };
    await setReport(cacheKey, report);

    if (level === 'suspicious' || level === 'danger') {
      showWarning(report);
    } else if (debugMode) {
      showDebugOverlay(report);
    }

    if (!hasPw) watchForPassword(report, cacheKey);
  }

  run();
})();
