# Chrome 線上應用程式商店上架資料

所有欄位依 [Chrome Web Store 開發人員資訊主頁](https://chrome.google.com/webstore/devconsole) 的分頁順序排列，可直接複製貼上。

---

## 一、商店資訊（Store listing）

### 名稱（取自 manifest，45 字元內）
```
SOP Snap 圖文手冊
```

### 摘要（manifest `description`，132 字元內，目前 60 字元）
```
把網頁操作變成圖文手冊：擷取畫面、標示重點、遮蔽機敏資料，匯出 HTML / PDF。by chichinliu.com
```

### 說明（繁體中文，主要語系）
```
把網頁操作變成圖文手冊。擷取畫面、標示重點，整理成可分享的操作流程。

還在逐張截圖、貼圖、排版嗎？寫一份系統操作手冊動輒花掉半天，畫面一改版又要全部重做，交接時還常常漏掉步驟。
SOP Snap 讓你一邊操作、一邊自動產生步驟，擷取後直接編輯，讓交接、培訓與操作說明更清楚。

━━━━━━━━━━━━━━━━
▍擷取 → 編輯 → 匯出
━━━━━━━━━━━━━━━━

【三種截圖範圍】
・可視畫面：一鍵擷取目前看到的畫面
・手動框選：拖曳框出要說明的區塊
・全頁捲動截圖：自動捲動並拼接整頁，固定頁首不會重複出現

【滑鼠與鍵盤擷取】
・點擊錄製：開啟後每點一下就自動截圖，框出點擊的按鈕，並產生「點擊『新增訂單』」這類步驟標題
・Chrome 自訂快捷鍵：Alt+Shift+1／2／3 立即擷取，可自行修改

【焦點標示與遮蔽】
・框定紅框、移除自動焦點、拖曳移動與縮放
・遮蔽身分證字號、客戶名單、金額等機敏資料
・復原／重做，原圖永遠保留，隨時可重來

【本機草稿與匯出】
・草稿自動保存在你的電腦，不上傳任何伺服器
・匯出單一 HTML 檔（圖片內嵌，寄信、上傳內網都方便）
・列印或另存 PDF
・遮蔽區塊在匯出時直接合成到圖片中，原始內容不會外流

━━━━━━━━━━━━━━━━
▍三種方案
━━━━━━━━━━━━━━━━

【社群版】快速製作與分享手冊
適用臨時教學、問題回報、一次性交接。保留目前一份手冊，編輯操作與補充說明。

【標準版】管理並持續更新手冊
適用系統操作指南、新人教材、個人 SOP。
・多份草稿命名儲存，隨時選擇續編
・圖上文字標註：字級、字色、底色、邊框色自由調整
・單一步驟重新截圖：系統改版只換截圖，保留標題、說明與順序

【團隊版】共同維護與發布 SOP
適用跨部門交接、企業內訓、需要審核的正式流程。
・手冊庫：資料夾分類、全文搜尋、匯出／匯入分享套件
・角色權限：管理員、編輯者、檢視者
・審核發布：草稿送審 → 核准發布或退回修改；新版發布前同仁仍可查閱現行版
・版本控管：保留版本號、發布者、時間與變更摘要，逐步比對歷史版本的文字與截圖，舊版可一鍵恢復為草稿

━━━━━━━━━━━━━━━━
▍隱私承諾
━━━━━━━━━━━━━━━━
・所有手冊、截圖與設定只存在你的瀏覽器
・不收集、不傳送、不販售任何資料；無廣告、無追蹤
・點擊錄製只記錄滑鼠點擊位置，不記錄鍵盤輸入
・移除擴充功能即刪除所有資料

適用於：SOP 製作、教育訓練、工作交接、客服問題回報、系統導入說明、ISO 文件化。

由 chichinliu.com 開發 ── 顧問服務、企業內訓與更多數位轉型工具：https://chichinliu.com
```

### 說明（English，選填第二語系）
```
Turn any web workflow into an illustrated step-by-step manual — capture, annotate, mask sensitive data, and export to HTML or PDF.

CAPTURE
• Visible area, drag-to-select region, or full-page scrolling screenshot (sticky headers are not duplicated)
• Click recording: every click captures a screenshot, highlights the clicked element and titles the step automatically (e.g. Click “New order”)
• Customisable keyboard shortcuts (Alt+Shift+1/2/3)

EDIT
• Step titles and notes, text-only steps, drag-and-drop reordering
• Highlight boxes, masking for sensitive data, text callouts, undo/redo
• Retake a single step's screenshot while keeping its title, notes and position

PUBLISH (Team)
• Manual library with folders, full-text search and share packages
• Admin / editor / viewer roles, review-and-approve workflow
• Version history with publisher, timestamp and change notes; compare versions step-by-step and restore any version as a draft

PRIVACY
Everything stays in your browser. No servers, no analytics, no tracking. Masked areas are flattened into exported images so original pixels never leave your device.

Made by chichinliu.com
```

### 類別與語言
| 欄位 | 填寫 |
|---|---|
| 類別 | 生產力 › 工作流程與規劃（Productivity › Workflow & Planning） |
| 語言 | 中文（繁體）；可另加 English |

### 圖片素材（尚待製作）
| 素材 | 規格 | 必填 |
|---|---|---|
| 商店圖示 | 128×128 PNG（已有 `icons/icon128.png`） | ✓ |
| 螢幕截圖 | 1280×800 或 640×400，1–5 張 | ✓（至少 1 張） |
| 小型宣傳圖 | 440×280 | ✓ |
| 大型宣傳圖 | 1400×560 | 選填（被精選時使用） |

建議截圖順序：① 編輯器全貌（步驟清單）② 點擊錄製自動框選 ③ 遮蔽與文字標註 ④ 版本比對 ⑤ 匯出的 HTML 手冊。

### 連結
| 欄位 | 填寫 |
|---|---|
| 官方網址 | `https://chichinliu.com` |
| 支援網址 | `https://chichinliu.com`（建議另建 `/sop-snap` 產品頁） |
| 隱私權政策網址 | `https://chichinliu.com/sop-snap/privacy`（部署 `store/privacy-policy.html` 後填入） |

---

## 二、隱私權做法（Privacy practices）

### 單一用途說明（Single purpose）
```
將使用者在網頁上的操作擷取為截圖，並編輯、標註、整理成可匯出的圖文操作手冊（SOP）。
Capture web page screenshots of a user's workflow and turn them into an editable, annotated step-by-step manual that can be exported to HTML or PDF.
```

### 權限理由（Permission justification）

**activeTab**
```
When the user clicks the toolbar button or presses a capture shortcut, the extension needs temporary access to the current tab to capture its visible area with chrome.tabs.captureVisibleTab.
```

**scripting**
```
Injects (1) a temporary overlay so the user can drag-select a capture region, (2) a short script that scrolls the page and temporarily hides fixed/sticky elements to stitch a full-page screenshot, and (3) a click listener while the user has turned on "click recording". All injected code is bundled in the extension; no remote code is executed.
```

**tabs**
```
Reads the active tab's title and URL to prefill the step title and source of each captured screenshot, and finds an already-open editor tab so the extension focuses it instead of opening duplicates.
```

**storage**
```
Stores user settings, the currently selected manual and the pending "retake screenshot" target locally in chrome.storage.local. Nothing is synced or sent off the device.
```

**unlimitedStorage**
```
Manuals contain many full-resolution screenshots (full-page captures can be several MB each). They are kept locally in IndexedDB, which would otherwise exceed the default quota and cause users to lose their drafts.
```

**Host permission (<all_urls>)**
```
Users document workflows on arbitrary websites and internal business systems that cannot be listed in advance. A small content script (recorder.js) is declared at document_start so that, when the user has turned on click recording for a tab, the click listener is ready immediately after each page navigation and no step of a multi-page workflow is lost. On tabs that are not recording, the script only asks the background whether recording is on and then stays idle: it attaches no listeners and reads no page content. Screenshots and element labels are processed locally only and never transmitted.
```

### 遠端程式碼（Remote code）
```
否，我未使用遠端程式碼（No, I am not using remote code）
```

### 資料使用（Data usage）
建議勾選：
- [x] **網站內容（Website content）**：截圖與被點擊元素的文字標籤

其餘類別（個人識別資訊、健康、財務、驗證資訊、個人通訊、位置、網頁瀏覽記錄、使用者活動）**不勾選**。

> 判斷依據：所有資料只在本機處理、從未傳出裝置，依 Google 定義可能不屬於「收集」。但截圖必然含有網頁內容，主動揭露能降低審查時被認定「揭露不實」而退件的風險，多勾一項沒有壞處，漏勾可能被下架。

三項聲明全部勾選：
- [x] 我不會基於核准用途以外的目的，將使用者資料出售或轉移給第三方
- [x] 我不會基於與項目單一用途無關的目的，使用或轉移使用者資料
- [x] 我不會基於判斷信用度或借貸目的，使用或轉移使用者資料

---

## 三、發布設定（Distribution）

| 欄位 | 建議 |
|---|---|
| 公開範圍 | 先選「**不公開（Unlisted）**」：只有拿到連結的人能安裝，用來收集首批使用者回饋，穩定後再改為公開 |
| 發布地區 | 所有地區 |
| 價格 | 免費（Chrome 商店已不提供付費功能；團隊版收費需自建授權機制） |

## 四、審查人員測試說明（Test instructions，選填但建議填寫）
```
No account or login is required.
1. Open any website (e.g. https://example.com) and click the SOP Snap toolbar icon.
2. Click "可視畫面" (Visible area) – a step is added to the current manual.
3. Click "開始點擊錄製" (Start click recording), then click a link or button on the page – each click adds a step with a red highlight box. Click the icon again and stop recording.
4. Click "開啟編輯器" (Open editor) to edit steps, add masks/boxes/text, and use "匯出 HTML" (Export HTML) or "列印 / 另存 PDF" (Print / Save as PDF).
All data stays in the browser; the extension makes no network requests.
```

---

## 五、上傳前檢查清單

- [ ] 將 `store/privacy-policy.html` 部署到 `https://chichinliu.com/sop-snap/privacy`，確認可公開存取
- [ ] 製作至少 1 張 1280×800 截圖與 440×280 小型宣傳圖
- [ ] 執行 `./scripts/package.sh` 產生上傳用 zip（不含 `store/`、`.git`、`*.pem`）
- [ ] 支付一次性 US$5 開發人員註冊費，並完成開發人員帳戶的聯絡信箱驗證
- [ ] 首次上傳後，到「套件」分頁記下擴充功能 ID；之後的更新都會沿用
