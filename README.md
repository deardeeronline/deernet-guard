# Deer Guard - 小鹿網路安全插件

即時偵測釣魚網站與可疑連結，在您受害之前發出警告。

## 設計原則

- **使用者安全優先** — 寧可多提醒，不放過可疑網站。判定可疑即彈出全屏警告
- **即時偵測** — 不依賴黑名單，透過規則引擎即時分析每個網站的風險特徵，新釣魚網站也能第一時間偵測到
- **隱私優先** — 零後端、零資料收集，所有偵測邏輯在瀏覽器本地執行
- **唯一對外請求** — 僅 RDAP 查詢域名註冊時間，只送出域名名稱
- **開源可審計** — 可自行檢視原始碼確認無 phone home 行為

## 偵測規則

### 減分（受信任）

| 規則 | 分數 | 說明 |
|------|------|------|
| 受信任後綴 | -40 | `gov.*`、`edu.*`、`mil.*`、`ac.*`、`go.*`（PSL 驗證）及 `bank`、`insurance` 等 |

### 加分（可疑指標）

| 規則 | 分數 | 說明 |
|------|------|------|
| 免費子域名平台 | +30 | Vercel、Cloudflare Pages、Netlify 等 16 個平台 |
| 域名相似度 | +25 | 與白名單域名 Levenshtein 相似度 ≥ 0.8 |
| Punycode / IDN | +30 | 域名含 `xn--` 前綴 |
| IP 直連 | +30 | URL 使用 IP 位址而非域名 |
| URL 含 @ | +25 | URL authority 含 `@` 混淆 |
| 過多子域名 | +15 | subdomain 層級 ≥ 4 |
| 敏感關鍵字 | +20 | 頁面 title / meta 含敏感詞（不疊加） |
| 密碼輸入框 | +20 | 頁面有 `<input type="password">` |
| 域名年齡 < 30 天 | +30 | RDAP 查詢結果 |
| 域名年齡 30-90 天 | +15 | RDAP 查詢結果 |
| 無法驗證域名年齡（高風險 TLD） | +30 | 無 RDAP server 且 TLD 在高風險清單 |
| 無法驗證域名年齡（一般） | +20 | 無 RDAP server 或查詢失敗 |

### 風險等級

| 等級 | 分數 | 動作 |
|------|------|------|
| bypass | 白名單命中 | 直接放行 |
| low | ≤ 0 | 低風險 |
| normal | > 0 且 < 30 | 顯示分數與規則 |
| suspicious | ≥ 30 | 黃色全屏警告 |
| danger | ≥ 60 | 紅色全屏警告 |

## 涵蓋範圍

- 5,000+ 知名網站白名單（Tranco 全球排名 + 台灣本地 + Web3）
- 46+ TLD 的 RDAP 域名年齡查詢（含 IdentityDigital fallback 覆蓋 400+ TLD）
- 54 個高風險 TLD 識別
- 16 個免費子域名平台識別
- 全球政府 / 教育 / 軍事域名的受信任識別（PSL 自動判斷）

## Debug Mode

Popup 底部有 Debug Mode 開關（預設關閉）。開啟後，每個頁面偵測完畢都會自動彈出 overlay 顯示偵測結果，方便開發者檢視評分細節。

- 分數 < 30：綠色 overlay，顯示域名、分數、觸發規則，一個關閉按鈕
- 分數 ≥ 30：正常的黃色 / 紅色警告（與一般模式相同）

## 專案結構

```
apps/chrome-extension/       # Chrome Extension (Manifest V3)
├── manifest.json
├── background.js            # Service Worker — RDAP proxy
├── content.js               # 偵測邏輯 + 警告 overlay + cache
├── popup/                   # 點擊 icon 的面板
└── icons/

packages/core/               # 共用偵測邏輯（source of truth）
├── scorer.js                # 評分引擎
├── rules/                   # 偵測規則模組
└── data/                    # JSON 清單資料

scripts/
├── build-extension.js       # Build：注入 PSL + data 到 content.js
├── generate-whitelist.js    # 產生白名單（Tranco + 手動清單）
└── generate-icons.js        # 產生 icon 尺寸
```

## 開發

```bash
# 安裝依賴
npm install

# 產生白名單
npm run generate-whitelist

# Build extension
npm run build

# 載入 extension
# Chrome → chrome://extensions → 開發人員模式 → 載入未封裝項目 → 選 dist/chrome-extension/
```

## 架構說明

- **Content Script** — 在每個頁面執行偵測，build 時將 PSL 解析器 + 所有資料 + 偵測邏輯打包為單一 IIFE
- **Service Worker** — 僅做 RDAP 查詢代理（利用 `host_permissions` 繞過 CORS）
- **Popup** — 從 `chrome.storage.local` 讀取偵測結果顯示
- **Cache** — 偵測結果 10 天 TTL、RDAP 查詢 1 年 TTL，帶規則版本號（版本變更時自動失效）

## License

MIT
