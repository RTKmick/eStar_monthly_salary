# eStar 薪資系統（Google 表單 + Apps Script）維護說明

此文件是本 repo 的**單一權威說明**（包含架構、同步流程、發佈注意事項）。

## 版本

- UI 版本：`V1.0.13`
- `package.json`：`1.0.13`

---

## 一、專案定位（你現在的最佳實務）

- **Google 表單**：維持不變（Google 平台服務，不搬 GitHub）
- **Google Sheet**：資料落地與薪資計算
- **Apps Script**：後端計算 + Web App（`doGet()` + `google.script.run`）
- **GitHub**：程式碼版本控管、可在 Cursor 直接開發

---

## 二、repo 內的核心檔案（Apps Script）

- `Code.gs`：後端計算與資料處理邏輯
- `index.html`：Apps Script Web App 前端（`doGet()` 載入 `index`）
- `appsscript.json`：Apps Script 設定與授權範圍

> 本 repo 已透過 `.claspignore` 限制同步範圍，避免把非 GAS 檔案推上去。

---

## 三、第一次環境準備（只做一次）

- 安裝 Node.js（Windows LTS）
- 安裝 `clasp`（已在 repo 內用 devDependency 安裝）
- 到 `https://script.google.com/home/usersettings` 啟用 **Google Apps Script API**

---

## 四、日常維護流程（建議照這個順序）

1. 在 Cursor 修改程式碼
2. 先同步到 GitHub

```powershell
git add .
git commit -m "你的訊息"
git push
```

3. 再同步到 Apps Script

```powershell
npm run gas:status
npm run gas:push
```

4. 如果有改 Web App 行為：到 Apps Script 介面**重新部署**（或建立新版本）

---

## 五、常用指令

- `npm run gas:status`：檢查目前追蹤檔案狀態
- `npm run gas:pull`：拉回 Apps Script 最新程式
- `npm run gas:push`：推送本機程式到 Apps Script
- `npm run gas:open`：直接開啟 Apps Script 專案
- `npm run gas:deploy`：建立新部署版本

---

## 六、注意事項

- Google 表單維持在 Google 平台，不搬移到 GitHub
- 若多人協作：先 `git pull` 再改，避免衝突
