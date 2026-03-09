#Cursor 

npx @google/clasp push


## 專案說明：eStar_monthly（薪資系統）

這個資料夾裡目前有 **兩包程式一起運作**：

- **Apps Script 後端專案**：負責跟 Google Sheet / Google Drive 溝通與計算邏輯。
- **GitHub / 前端網頁專案**：放在 GitHub 上、給瀏覽器使用的畫面（之後可以部署成 GitHub Pages）。

為了避免混淆，下面整理實際的檔案分類與操作方式。

---

## 一、資料夾結構與檔案分類

- **專案根目錄 (`C:\ngrok\eStar_monthly`)**
  - `index.html`：
    - 主要給 **GitHub / 瀏覽器** 用的前端畫面（使用 `fetch` + `config.js` 方式呼叫 API）。
  - `config.js`：
    - 前端設定檔，內含 `CONFIG.API_URL`，指向 Apps Script 部署好的 Web App URL (`.../exec`)。
  - `eStar_Pay.md`：
    - 本說明文件，記錄專案結構、clasp 指令與注意事項。

- **`backend/` 資料夾（Apps Script 專案，由 clasp 管理）**
  - `appsscript.json`：
    - Apps Script 專案設定檔（不要手動亂改路徑與類型）。
  - `Code.js`：
    - Apps Script **後端主程式**，包含：
      - `doGet()`：Web App 入口，會載入 `index_GAS.html`。
      - `onOpen()`：在 Google Sheet 裡建立選單。
      - 匯入打卡資料：`importCleanData()`、`addSubtotalRow()`。
      - 伙食津貼 / 總工時 / 獎金計算：`updateMealAllowanceCount()`、`calculatePerformanceBonus()`、`setupBonusTable()`、`linkTotalHours()`、`calculateAllowanceAndHours()`。
      - 備份與匯出 UBB 報表：`backupAndExportUBB()`。
      - 提供前端查詢用的 API：
        - `getSalaryDashboardData()`（薪資總覽）
        - `updateSalaryMultiplier()`（更新 G 欄實拿倍數）
        - `getDailyBonusTable()` / `updateDailyRevenue()`（每日獎金）
        - `getEmployeeDetailData()`（員工打卡明細）
      - 共用工具函式：`parseAnyDate()`、`normalizeTime()`、`calculateHours()`…等。
  - `index_GAS.html`：
    - Apps Script Web App 使用的前端畫面。
    - 透過 `google.script.run` 呼叫 `Code.js` 裡的各個函式（只在 Apps Script 環境可用）。

- **clasp 設定**
  - 專案根目錄有 `.clasp.json`（自動建立）：
    - 指向此 Apps Script 專案的 `scriptId`。
    - 設定 `rootDir: "backend"`，代表 `backend/` 底下所有檔案會被 push 上去。

---

## 二、開發與部署流程（後端：Apps Script）

- **只做一次的環境準備**
  - 安裝 Node.js（Windows）  
    - 到 `https://nodejs.org/` 下載 LTS 版本 (Windows x64 Installer) 安裝。
  - 全域安裝 `clasp` 並登入正確帳號：

    ```powershell
    npm install -g @google/clasp
    clasp -v                # 應該會顯示版本號
    clasp login             # 用 estar0518@gmail.com 登入
    ```

  - 在 `https://script.google.com/home/usersettings`  
    - 使用 `estar0518@gmail.com` 帳號登入。
    - 把 **「Google Apps Script API」** 開關打成 **ON / 啟用**。

- **（已完成）綁定現有 Apps Script 專案到本機**

  ```powershell
  cd C:\ngrok\eStar_monthly
  clasp clone 1Wrm8Iu0palQ8a_-Eb0NJt_43OY0FXQcwxKMtrg9NMLE88DLuHpos57j- --rootDir ./backend
  ```

- **之後每次修改 Apps Script 後端程式的標準流程**

  1. 在 Cursor 裡修改：
     - `backend\Code.js`（後端邏輯）
     - 或 `backend\index_GAS.html`（Web App 畫面）
  2. 存檔後，在 PowerShell：

     ```powershell
     cd C:\ngrok\eStar_monthly
     clasp push
     ```

  3. 回到 Apps Script / Web App 重新載入頁面即可看到新功能。

---

## 三、前端（GitHub / index.html + config.js）與後端的關係

- `index.html` + `config.js`：
  - 適合放在 GitHub 上或部署成靜態網站。
  - 透過 `CONFIG.API_URL` 指向 Apps Script Web App 的網址 (`.../exec`)。
  - 前端用 `fetch` 傳送 `{ action, data }` 給 Apps Script 的 `doPost()`（未來可在 `Code.js` 中實作）。

- `backend\index_GAS.html`：
  - 專門給 Apps Script 內建的 Web App 使用。
  - 透過 `google.script.run.xxx()` 直接呼叫同一個專案內的 `Code.js` 函式。

> 簡單記：  
> - **`backend/` = Apps Script 專案（連 Google Sheet 的後端 + 內建 Web App）**  
> - **根目錄 `index.html` / `config.js` = GitHub / 外部前端**  
> 未來所有程式修改，都在 `C:\ngrok\eStar_monthly` 用 Cursor 改，然後：  
> - 後端：`clasp push` 同步到 Apps Script  
> - 前端：照一般 Git 流程 commit / push 到 GitHub
