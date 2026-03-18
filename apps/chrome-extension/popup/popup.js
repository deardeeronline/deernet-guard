const domainDisplay = document.getElementById('domain-display');
const statusIcon = document.getElementById('status-icon');
const statusText = document.getElementById('status-text');
const scoreDisplay = document.getElementById('score-display');
const rulesList = document.getElementById('rules-list');
const actions = document.getElementById('actions');
const btnTrust = document.getElementById('btn-trust');

const RULE_LABELS = {
  'risky-platform': '使用免費子域名平台',
  'domain-age': '域名註冊時間短',
  'domain-age-unknown': '無法驗證域名年齡',
  'domain-similarity': '域名與知名網站相似',
  'punycode': '域名使用國際化編碼 (IDN)',
  'ip-address': 'URL 使用 IP 位址',
  'url-at-sign': 'URL 含 @ 混淆',
  'excessive-subdomain': '過多子域名層級',
  'sensitive-keyword': '頁面含敏感關鍵字',
  'password-input': '頁面要求輸入密碼',
  'trusted-suffix': '受信任域名後綴',
};

function renderChecking(hostname) {
  domainDisplay.textContent = hostname || '—';
  domainDisplay.className = 'domain';
  statusIcon.textContent = '🔍';
  statusText.textContent = '偵測中…';
  scoreDisplay.classList.add('hidden');
  rulesList.classList.add('hidden');
  actions.classList.add('hidden');
}

function render(report) {
  if (!report) {
    domainDisplay.textContent = '—';
    statusIcon.textContent = '';
    statusText.textContent = '無法取得資訊';
    return;
  }

  const { domain, score, level, rules, ignored } = report;

  domainDisplay.textContent = domain || '—';
  domainDisplay.className = 'domain';
  if (level === 'bypass') domainDisplay.classList.add('bypass');
  else if (level === 'low') domainDisplay.classList.add('low');
  else if (level === 'normal') domainDisplay.classList.add('normal');
  else if (level === 'suspicious') domainDisplay.classList.add('suspicious');
  else if (level === 'danger') domainDisplay.classList.add('danger');

  if (level === 'bypass') {
    statusIcon.textContent = '✅';
    statusText.textContent = '此網站安全';
    scoreDisplay.classList.add('hidden');
    rulesList.classList.add('hidden');
    actions.classList.add('hidden');
    return;
  }

  // Score ≤ 0 but not whitelisted: low risk
  if (level === 'low') {
    statusIcon.textContent = '🟢';
    statusText.textContent = '低風險';
    if (rules && rules.length > 0) {
      scoreDisplay.classList.remove('hidden');
      rulesList.classList.remove('hidden');
      rulesList.innerHTML = rules
        .map(r => {
          const label = RULE_LABELS[r.id] || r.id;
          const detail = r.detail ? ' (' + r.detail + ')' : '';
          const scorePrefix = r.score > 0 ? '+' : '';
          return '<li>' + label + detail + ' <span class="rule-score">' + scorePrefix + r.score + '</span></li>';
        })
        .join('');
    } else {
      scoreDisplay.classList.add('hidden');
      rulesList.classList.add('hidden');
    }
    actions.classList.add('hidden');
    return;
  }

  if (level === 'normal') {
    statusIcon.textContent = 'ℹ️';
    statusText.textContent = '風險分數：' + score;
  } else if (level === 'suspicious') {
    statusIcon.textContent = '⚠️';
    statusText.textContent = '此網站可疑 — 風險分數：' + score + (ignored ? '（已忽略）' : '');
  } else {
    statusIcon.textContent = '🚨';
    statusText.textContent = '此網站危險 — 風險分數：' + score + (ignored ? '（已忽略）' : '');
  }

  scoreDisplay.classList.remove('hidden');

  if (rules && rules.length > 0) {
    rulesList.classList.remove('hidden');
    rulesList.innerHTML = rules
      .map(r => {
        const label = RULE_LABELS[r.id] || r.id;
        const detail = r.detail ? ' (' + r.detail + ')' : '';
        const scorePrefix = r.score > 0 ? '+' : '';
        return '<li>' + label + detail + ' <span class="rule-score">' + scorePrefix + r.score + '</span></li>';
      })
      .join('');
  } else {
    rulesList.classList.add('hidden');
  }

  if (level === 'suspicious' || level === 'danger') {
    actions.classList.remove('hidden');

    if (ignored) {
      btnTrust.textContent = '取消信任';
      btnTrust.className = 'btn btn-trust untrust';
    } else {
      btnTrust.textContent = '信任此網站';
      btnTrust.className = 'btn btn-trust';
    }

    btnTrust.onclick = () => {
      chrome.storage.local.get('report:' + domain, (result) => {
        const entry = result['report:' + domain];
        if (entry) {
          entry.ignored = !ignored;
          entry.timestamp = Date.now();
          chrome.storage.local.set({ ['report:' + domain]: entry }, () => {
            loadReport();
          });
        }
      });
    };
  } else {
    actions.classList.add('hidden');
  }
}

let pollTimer = null;

function renderUnavailable() {
  domainDisplay.textContent = '—';
  domainDisplay.className = 'domain';
  statusIcon.textContent = '—';
  statusText.textContent = '此頁面無法偵測';
  scoreDisplay.classList.add('hidden');
  rulesList.classList.add('hidden');
  actions.classList.add('hidden');
}

function loadReport() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.url) { renderUnavailable(); return; }

    const tabUrl = tabs[0].url;
    if (!tabUrl.startsWith('http://') && !tabUrl.startsWith('https://')) {
      renderUnavailable();
      return;
    }

    let hostname;
    try { hostname = new URL(tabUrl).hostname; } catch { renderUnavailable(); return; }

    const parts = hostname.split('.');
    const keys = [];
    for (let i = 0; i < parts.length - 1; i++) {
      keys.push('report:' + parts.slice(i).join('.'));
    }

    chrome.storage.local.get(keys, (result) => {
      for (const key of keys) {
        if (result[key]) {
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
          render(result[key]);
          return;
        }
      }
      // No report yet — show checking state and poll
      renderChecking(hostname);
      if (!pollTimer) {
        pollTimer = setInterval(() => loadReport(), 500);
      }
    });
  });
}

loadReport();

// --- Debug mode ---
const debugCheckbox = document.getElementById('debug-mode');

chrome.storage.local.get('debugMode', (r) => {
  debugCheckbox.checked = !!r.debugMode;
});

debugCheckbox.addEventListener('change', () => {
  chrome.storage.local.set({ debugMode: debugCheckbox.checked });
});
