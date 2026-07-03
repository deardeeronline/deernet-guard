# Changelog

## 1.1.0 — 2026-07-03

### RDAP 覆蓋大幅擴充與修復

- **RDAP server map 改由 IANA RDAP bootstrap registry 自動生成**(`npm run generate-rdap-servers`),覆蓋從手動維護的 54 個 TLD 擴充到 **1,199 個 TLD / 379 個 RDAP hosts**。
- **修復已失效的 endpoint**:`.site` `.online` `.store` `.tech` `.fun` `.space` `.pw`(CentralNic → Radix 遷移後回 403)、`.link` `.click`(Tucows 遷移後回 404)。這些 TLD 之前每次載入都被誤加 +20「查詢失敗」。
- **移除 Identity Digital fallback**:TLD 不在 IANA bootstrap(如 `.co` `.io` `.jp`)時直接回「無 RDAP server」,不再把域名送到第三方 registry(隱私改善,內網域名也不再外洩)。計分不變:無法驗證域名年齡仍 +20(高風險 TLD +30)——寧可多提醒。
- **查詢失敗也會 cache**(1 天 TTL):壞掉的 endpoint 或斷網不再造成每頁重查。
- **manifest `host_permissions` 改由 build 從 RDAP map 自動生成**,registry 遷移後重新產生資料即自動修正。

### 偵測強化

- **SPA 晚掛載的密碼欄位也會偵測**:初次掃描沒有密碼欄位時,用 MutationObserver 持續監看;密碼欄位出現後補計 +20,跨過門檻即彈警告(對 cache 命中的頁面也生效)。

### 更新機制

- 新增 **GitHub Actions weekly data refresh**(`.github/workflows/data-refresh.yml`):每週一自動重新生成 RDAP map(IANA)與白名單(Tranco 最新清單),跑 RDAP 健康檢查,有異動自動開 PR。
- 新增 **RDAP 健康檢查**(`npm run check-rdap-health`):對 12 個代表性 TLD 用已知域名驗證 endpoint 存活。
- 新增 **CI**(build + 語法檢查 + placeholder 檢查)。
- **白名單改抓 Tranco 最新清單**(之前固定在 Z264G snapshot,永遠拿到同一份)。
- **Cache 版本自動化**:報告 cache key 版本 = 手動 rules version + 注入資料的 hash,資料更新即自動失效重跑。

### 其他

- `packages/core/rules/domain-age.js` 改用同一份生成的 RDAP map(原本 14 個 server 且含已停用的 `rdap.afilias.net`)。
- 效能:域名相似度比對加長度差 prefilter;`checkTrustedSuffix` 不再重複計算。
- Service worker 啟動時清理過期的 `report:` / `rdap:` cache(每日至多一次),避免 `chrome.storage.local` 無限成長。
- Popup 輪詢加上限(20 秒),逾時顯示「此頁面無法偵測」。

## 1.0.1

- Add `.taipei` RDAP support, bump rules version

## 1.0.0

- Initial release: Deer Guard - 小鹿網路安全插件
