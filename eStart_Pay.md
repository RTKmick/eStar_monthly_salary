# eStar 薪資系統發佈說明（V1.0.13）

## 本版重點

- 專案已改為 GitHub 管理，並可透過 `clasp` 與 Google Apps Script 同步。
- Apps Script 入口頁已統一使用 `index.html`（`doGet()` 載入 `index`）。
- 前端版本顯示更新為 `V1.0.13`。

## 專案檔案（Apps Script 核心）

- `Code.gs`：後端計算與資料處理邏輯
- `index.html`：Apps Script Web App 前端
- `appsscript.json`：Apps Script 設定與授權範圍

## 日常維護流程（Cursor + GitHub + Apps Script）

1. 在 Cursor 修改程式碼
2. 先同步到 GitHub
   - `git add .`
   - `git commit -m "你的訊息"`
   - `git push`
3. 再同步到 Apps Script
   - `npm run gas:status`
   - `npm run gas:push`

## 常用指令

- `npm run gas:status`：檢查目前追蹤檔案狀態
- `npm run gas:pull`：拉回 Apps Script 最新程式
- `npm run gas:push`：推送本機程式到 Apps Script
- `npm run gas:open`：直接開啟 Apps Script 專案
- `npm run gas:deploy`：建立新部署版本

## 注意事項

- Google 表單維持在 Google 平台，不搬移到 GitHub。
- 若有改 Web App 功能，`clasp push` 後請到 Apps Script 重新部署版本。
- 若多人協作，先 `git pull` 再改，避免衝突。
