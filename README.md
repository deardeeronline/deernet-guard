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
| 無法驗證域名年齡（高風險 TLD） | +30 | TLD 無 RDAP server 且在高風險清單 |
| 無法驗證域名年齡（一般） | +20 | TLD 無 RDAP server（如 `.co`、`.io`、`.jp`）或查詢失敗。設計取向：寧可多提醒，false positive 可接受 |

### 風險等級

| 等級 | 分數 | 動作 |
|------|------|------|
| bypass | 白名單命中 | 直接放行 |
| low | ≤ 0 | 低風險 |
| normal | > 0 且 < 30 | 顯示分數與規則 |
| suspicious | ≥ 30 | 黃色全屏警告 |
| danger | ≥ 60 | 紅色全屏警告 |

## 涵蓋範圍

- 5,000+ 知名網站白名單（Tranco 全球排名最新清單 + 台灣本地 + Web3）
- 1,199 個 TLD 的 RDAP 域名年齡查詢（由 IANA RDAP bootstrap registry 自動生成，`npm run generate-rdap-servers`）
- 54 個高風險 TLD 識別
- 16 個免費子域名平台識別
- 全球政府 / 教育 / 軍事域名的受信任識別（PSL 自動判斷）

對外請求只有兩種：RDAP 查詢（只送出域名名稱給該 TLD 的官方 registry；TLD 沒有 RDAP service 時如 `.co`、`.io`、`.jp` **不會**發出任何請求、也不會 fallback 到第三方）、以及每日一次向 GitHub Pages 下載簽章過的偵測資料包（純靜態檔案，不含任何瀏覽資訊，可關閉）。

## Debug Mode

Popup 底部有 Debug Mode 開關（預設關閉）。開啟後，每個頁面偵測完畢都會自動彈出 overlay 顯示偵測結果，方便開發者檢視評分細節。

- 分數 < 30：綠色 overlay，顯示域名、分數、觸發規則，一個關閉按鈕
- 分數 ≥ 30：正常的黃色 / 紅色警告（與一般模式相同）

## 專案結構

```
apps/chrome-extension/       # Chrome Extension (Manifest V3)
├── manifest.json            # host_permissions 由 build 從 RDAP map 生成
├── background.js            # Service Worker — RDAP proxy + cache 清理
├── content.js               # 偵測邏輯 + 警告 overlay + cache
├── popup/                   # 點擊 icon 的面板
└── icons/

packages/core/               # 偵測邏輯參考實作（注意：extension 的偵測邏輯
├── scorer.js                # 在 content.js 內獨立實作，build 只共用 data/；
├── rules/                   # 修改規則時兩邊都要改）
└── data/                    # JSON 清單資料（白名單、TLD 清單、RDAP map）

scripts/
├── build-extension.js       # Build：注入 PSL + data 到 content.js/background.js，生成 manifest host_permissions
├── generate-whitelist.js    # 產生白名單（Tranco 最新清單 + 手動清單）
├── generate-rdap-servers.js # 產生 RDAP server map（IANA bootstrap）
├── check-rdap-health.js     # RDAP endpoint 健康檢查
└── generate-icons.js        # 產生 icon 尺寸

.github/workflows/
├── ci.yml                   # PR / push：build + 語法檢查
└── data-refresh.yml         # 每週一：重新生成資料 + 健康檢查 + 自動開 PR
```

## 開發

```bash
# 安裝依賴
npm install

# 產生資料（結果已 commit，只有要更新資料時才需要跑）
npm run generate-whitelist       # 白名單（Tranco 最新清單 + 手動清單）
npm run generate-rdap-servers    # RDAP server map（IANA bootstrap）
npm run check-rdap-health        # 驗證 RDAP endpoints 存活

# Build extension
npm run build

# 載入 extension
# Chrome → chrome://extensions → 開發人員模式 → 載入未封裝項目 → 選 dist/chrome-extension/
```

## 更新機制

偵測資料（白名單、TLD 清單、RDAP map、計分參數）有兩條更新管道：

**1. Remote data 更新（日級，不需發版）**

- Merge 進 main 的資料異動會觸發 `publish-data.yml`：打包 + ECDSA P-256 簽章 → 部署到 GitHub Pages（`https://deardeeronline.github.io/deernet-guard/data/v1/rules.json`）。
- 已安裝的 extension 每天（`chrome.alarms`）抓一次資料包：**驗簽（公鑰燒在 extension 內）→ schema / 結構 / sanity bounds 三道驗證** → 通過才存進 `chrome.storage.local`;任一步失敗保留上一份好資料，最終 fallback 是 build 時燒進去的內建資料。
- MV3 合規：遠端更新的是純 JSON **資料**,不含任何可執行程式碼(Chrome 明確允許)。
- 使用者可在 popup 關閉「自動更新偵測資料」。
- 一次性設定:GitHub Pages Source 選 **GitHub Actions**、跑 `npm run generate-signing-key`、把私鑰加進 repo secret `DATA_SIGNING_KEY`、commit 公鑰檔。

**2. 發版更新（邏輯 / 權限變更時）**

1. **每週一** GitHub Actions（`data-refresh.yml`）自動重新生成 RDAP map 與白名單、跑健康檢查，有異動自動開 PR。
2. 偵測**邏輯**、manifest 權限、UI 變更仍需發版：bump `manifest.json` 版本 → `npm run build` → 上傳 Chrome Web Store。
3. 使用者端 cache 會自動失效重跑：報告 cache key 帶「rules version + 資料版本」，資料一換就重新評分。

## 架構說明

- **Content Script** — 在每個頁面執行偵測，build 時將 PSL 解析器 + 所有資料 + 偵測邏輯打包為單一 IIFE；初掃沒有密碼欄位時以 MutationObserver 監看 SPA 晚掛載的登入表單
- **Service Worker** — RDAP 查詢代理（利用 `host_permissions` 繞過 CORS；TLD 無 RDAP 時直接回覆、不發請求）+ 每日清理過期 cache
- **Popup** — 從 `chrome.storage.local` 讀取偵測結果顯示
- **Cache** — 偵測結果 10 天 TTL；RDAP 查詢成功 1 年 TTL、失敗 1 天 TTL（避免壞 endpoint 每頁重查）；cache key 帶「規則版本 + 資料 hash」，任一變更即自動失效

## License

MIT
