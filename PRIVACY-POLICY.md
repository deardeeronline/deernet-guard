# Deer Guard 隱私權政策 / Privacy Policy

最後更新：2026-03-18

## 中文

### 資料收集

Deer Guard **不收集、不傳送、不儲存任何用戶個人資料**。

### 運作方式

- 所有網站風險偵測邏輯完全在您的瀏覽器本地執行
- 偵測結果僅儲存在您瀏覽器的本地儲存空間（`chrome.storage.local`），不會傳送至任何外部伺服器
- 唯一的對外請求為 RDAP 查詢（Registration Data Access Protocol），僅向該域名的 TLD 註冊機構查詢域名註冊時間，查詢內容僅包含域名本身，不包含任何用戶資訊

### 權限說明

| 權限 | 用途 |
|------|------|
| `activeTab` | 讀取當前分頁的網址和頁面標題，用於風險偵測 |
| `storage` | 在本地儲存偵測結果快取，避免重複偵測 |
| `host_permissions`（RDAP servers） | 查詢域名註冊時間，判斷是否為新註冊的可疑域名 |

### 第三方服務

本擴充套件僅與各 TLD 註冊機構的 RDAP 服務通訊，查詢內容僅為域名名稱。不使用任何分析工具、追蹤器或廣告服務。

### 資料保留

所有快取資料儲存在瀏覽器本地，偵測結果快取 10 天後自動過期，RDAP 查詢結果快取 1 年後自動過期。用戶可隨時透過瀏覽器清除擴充套件資料。

### 開源

本擴充套件完全開源，您可以自行檢視原始碼確認以上聲明：https://github.com/deardeeronline/deernet-guard

### 聯絡方式

如有任何隱私相關問題，請透過 GitHub Issues 聯繫我們。

---

## English

### Data Collection

Deer Guard **does not collect, transmit, or store any personal user data**.

### How It Works

- All website risk detection logic runs entirely in your browser locally
- Detection results are stored only in your browser's local storage (`chrome.storage.local`) and are never sent to any external server
- The only external requests are RDAP queries (Registration Data Access Protocol) to TLD registries to check domain registration dates. These queries contain only the domain name and no user information

### Permissions

| Permission | Purpose |
|-----------|---------|
| `activeTab` | Read the current tab's URL and page title for risk detection |
| `storage` | Store detection result cache locally to avoid redundant checks |
| `host_permissions` (RDAP servers) | Query domain registration dates to identify newly registered suspicious domains |

### Third-Party Services

This extension communicates only with RDAP services operated by TLD registries. No analytics, trackers, or advertising services are used.

### Data Retention

All cached data is stored locally in the browser. Detection results expire after 10 days, and RDAP query results expire after 1 year. Users can clear extension data at any time through browser settings.

### Open Source

This extension is fully open source. You can review the source code to verify these claims: https://github.com/deardeeronline/deernet-guard

### Contact

For any privacy-related questions, please contact us via GitHub Issues.
