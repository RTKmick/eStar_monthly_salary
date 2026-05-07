# eStar Monthly Salary (Apps Script)

此專案以 GitHub 管理 Apps Script 原始碼，並用 `clasp` 與 Google Apps Script 專案同步。

## 檔案

- `Code.gs`
- `index.html`
- `appsscript.json`

## 常用指令

- `npm run gas:status`：檢查與遠端差異
- `npm run gas:pull`：拉下 Apps Script 最新內容
- `npm run gas:push`：推送目前程式到 Apps Script
- `npm run gas:open`：開啟 Apps Script 專案
- `npm run gas:deploy`：建立新部署版本

## 日常流程

1. 在 Cursor 修改程式
2. `npm run gas:status`
3. `npm run gas:push`
4. 到 Apps Script 重新部署 Web App 版本
