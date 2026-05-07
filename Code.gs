// --- 網頁版入口 ---
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('薪資管理系統')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 網頁版 / 觸發器執行時常沒有「使用中試算表」，getActiveSpreadsheet() 會為 null。
 * 若腳本是「獨立專案」，請把下方 SPREADSHEET_ID 改成你的試算表網址中 /d/ 與 /edit 之間那段 ID。
 */
function getSpreadsheetForWeb_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const SPREADSHEET_ID = '1wmxKaAMQkDT4OV1XxVL-_jqAO9uMubTBSyTGpGSBJqE';
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// --- 1. 選單與介面 ---
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔥 薪資計算系統')
    .addSeparator()
    .addItem('🍱 計算伙食津貼 (填入E欄)', 'updateMealAllowanceCount')
    .addItem('📅 設定獎金表 (L~O欄)', 'setupBonusTable') 
    .addItem('💰 計算業績獎金 (填入F欄)', 'calculatePerformanceBonus') 
    .addSeparator()
    .addItem('🔗 連動當月總工時 (填入D欄)', 'linkTotalHours') 
    .addItem('💾 備份並匯出 UBB 薪資表', 'backupAndExportUBB')
    .addToUi();
}

// --- 2. 接收資料 (存入 打卡之星匯入區) --------------------------------------------------
function importCleanData(cleanData) {
  const ss = getSpreadsheetForWeb_();
  let sheet = ss.getSheetByName('打卡之星匯入區');
  
  if (!sheet) {
    sheet = ss.insertSheet('打卡之星匯入區');
  }
  
  // 清除舊資料與舊格式
  sheet.clear(); 
  
  // 設定標題
  const headers = [['姓名', '打卡日期', '日期類別', '班別', '上班打卡時間', '下班打卡時間', '打卡工時']];
  const headerRange = sheet.getRange(1, 1, 1, 7);
  headerRange.setValues(headers);
  headerRange.setFontWeight("bold").setFontSize(12).setBackground("#EFEFEF");

  if (cleanData.length > 0) {
    let outputData = [];       // 存放文字資料
    let fontColors = [];       // 存放文字顏色
    let backgrounds = [];      // 存放背景顏色
    let subtotalRows = [];     // 記錄總計列位置 (用於加粗體)

    let previousName = ""; 
    let personStartRowIndex = 0; 

    // 迴圈處理每一筆資料
    cleanData.forEach((row) => {
      let currentName = row[0];

      // --- A. 插入分組總計 (換人時) ---
      if (previousName !== "" && currentName !== previousName) {
         addSubtotalRow(outputData, fontColors, backgrounds, subtotalRows, previousName, personStartRowIndex);
         
         // 插入空行
         outputData.push(["", "", "", "", "", "", ""]);
         fontColors.push(Array(7).fill("black"));
         backgrounds.push(Array(7).fill(null));
         
         personStartRowIndex = outputData.length; 
      }
      
      previousName = currentName;

      // --- B. 計算工時與資料檢查 ---
      let startVal = row[4];
      let endVal = row[5];
      let baseHourRaw = row[6]; 
      let calcResult = 0; 
      
      // 判斷是否缺資料
      let isStartMissing = !startVal || String(startVal).trim() === '--' || String(startVal).trim() === '';
      let isEndMissing = !endVal || String(endVal).trim() === '--' || String(endVal).trim() === '';
      let isBothMissing = isStartMissing && isEndMissing; // 兩者皆空 (沒上班)
      let isPartialMissing = (isStartMissing || isEndMissing) && !isBothMissing; // 只有一邊空 (漏打卡)

      // 計算邏輯
      if (isBothMissing) {
          calcResult = 0; // 沒上班
      } else if (isPartialMissing) {
          // 漏打卡：嘗試用總時數反推，或設為 0
          let t = normalizeTime(baseHourRaw);
          calcResult = t ? Number((t.total / 60).toFixed(2)) : 0; 
      } else {
          // 正常：計算時數
          calcResult = calculateHours(startVal, endVal);
      }

      // --- C. 樣式判斷 (需求修正重點) ---
      
      // 1. 文字顏色：預設全黑，若假日 "只有 B 欄 (index 1)" 變紅
      let dateStr = row[1];
      let dateObj = new Date(dateStr);
      let dayOfWeek = dateObj.getDay(); // 0=週日, 6=週六
      let isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      
      // 建立該列的文字顏色陣列 (預設全是黑色)
      let currentRowColors = Array(7).fill("black");
      if (isWeekend) {
          currentRowColors[1] = "red"; // ★ 需求2：只有 B 欄變紅
      }

      // 2. 背景顏色：放假日(灰) > 缺勤/漏打卡(黃) > 正常(白)
      let currentRowBg = Array(7).fill(null); // 預設無背景
      
      // 取得 C 欄文字 (日期類別)
      let dateType = String(row[2] || ""); 

      // ★ 修改處：判斷是否為不用上班的日子
      let isRestDay = dateType.includes("休息日") || dateType.includes("排班人員休假日");

      if (isRestDay) {
          currentRowBg.fill("#EEEEEE"); // 優先：若是休假日，填灰色 (不管有無打卡)
      } else if (isBothMissing || isPartialMissing) {
          currentRowBg.fill("#FFFF00"); // 只有在「非休假日」且「沒打卡」時，才填黃色
      }

      // --- D. 寫入陣列 ---
      outputData.push([row[0], row[1], row[2], row[3], row[4], row[5], calcResult]);
      fontColors.push(currentRowColors);
      backgrounds.push(currentRowBg);
    });

    // --- E. 處理最後一個人的總計 ---
    if (previousName !== "") {
       addSubtotalRow(outputData, fontColors, backgrounds, subtotalRows, previousName, personStartRowIndex);
    }

    // --- F. 寫入 Sheet ---
    sheet.getRange(2, 1, outputData.length, 7).setNumberFormat("@").setValues(outputData);
    sheet.getRange(2, 1, fontColors.length, 7).setFontColors(fontColors);
    sheet.getRange(2, 1, backgrounds.length, 7).setBackgrounds(backgrounds);

    if (subtotalRows.length > 0) {
       let boldRanges = subtotalRows.map(rowIndex => `A${rowIndex}:G${rowIndex}`);
       sheet.getRangeList(boldRanges).setFontWeight("bold");
    }
  }
  return "OK";
}

// --- 輔助函式：產生總計列 ---
function addSubtotalRow(outputData, fontColors, backgrounds, subtotalRows, name, startRowIndex) {
    let startSheetRow = startRowIndex + 2; 
    let endSheetRow = outputData.length + 1;     
    let sumFormula = `=SUM(G${startSheetRow}:G${endSheetRow})`;
    let label = `${name}當月總工時`; 

    outputData.push([label, "", "", "", "", "", sumFormula]);
    
    // 總計列：整行藍色
    fontColors.push(Array(7).fill("blue")); 
    backgrounds.push(Array(7).fill(null)); 
    
    subtotalRows.push(outputData.length + 1); 
}

// --- 3. 計算業績獎金 (網頁版安全版：已移除 alert/toast) --------------------------------------------------
function calculatePerformanceBonus() {
  const ss = getSpreadsheetForWeb_();
  const sheetData = ss.getSheetByName('打卡之星匯入區');
  const sheetConfig = ss.getSheetByName('當月薪資計算');

  if (!sheetData || !sheetConfig) return "❌ 找不到必要的工作表！";

  const timeZone = ss.getSpreadsheetTimeZone();
  
  try {
    // 1. 讀取 L~O 欄 (日期 & 金額)
    let lastConfigRow = sheetConfig.getLastRow();
    if (lastConfigRow < 3) return "⚠️ 當月薪資計算頁面沒有設定獎金表";
    
    const bonusData = sheetConfig.getRange(3, 12, lastConfigRow - 2, 4).getValues();
    let dailyBonusMap = {}; 

    bonusData.forEach(row => {
      let dateObj = row[0]; 
      let amount = row[3]; 
      let validDate = parseAnyDate(dateObj);
      if (validDate) {
        let dateKey = Utilities.formatDate(validDate, timeZone, "yyyy/MM/dd");
        dailyBonusMap[dateKey] = Number(amount) || 0;
      }
    });

    // 2. 掃描匯入區，計算總獎金
    const importData = sheetData.getDataRange().getValues();
    let personTotalBonus = {}; 

    for (let i = 1; i < importData.length; i++) {
      let row = importData[i];
      let name = row[0];
      let rawDate = row[1];
      let dateType = String(row[2] || ""); 
      let shiftName = String(row[3] || ""); 
      let workHours = Number(row[6]); 

      if (!name || name.includes("總工時")) continue;

      let dateObj = parseAnyDate(rawDate);
      
      if (workHours > 0 && dateObj) {
         let dateKey = Utilities.formatDate(dateObj, timeZone, "yyyy/MM/dd");
         let bonus = dailyBonusMap[dateKey] || 0;

         if (!personTotalBonus[name]) personTotalBonus[name] = { weekday: 0, holiday: 0 };

         let d = new Date(dateKey); 
         let isWeekendDay = (d.getDay() === 0 || d.getDay() === 6);
         let isHolidayBonus = isWeekendDay || shiftName.includes("假日") || !dateType.includes("平日");

         if (isHolidayBonus) {
            personTotalBonus[name].holiday += bonus;
         } else {
            personTotalBonus[name].weekday += bonus;
         }
      }
    }

    // --- 3. 準備寫入 F 欄 ---
    const allNames = sheetConfig.getRange("A:A").getValues();
    let lastRealNameIndex = -1;

    for (let i = allNames.length - 1; i >= 0; i--) {
      if (allNames[i][0] && String(allNames[i][0]).trim() !== "") {
        lastRealNameIndex = i; 
        break;
      }
    }

    if (lastRealNameIndex < 2) return "⚠️ A 欄找不到任何名字";

    let loopLimit = lastRealNameIndex + 1;
    let fColumnData = []; 
    let lastPersonName = ""; 
    let rowOffset = 0;        

    for (let i = 2; i <= loopLimit; i++) {
      let configName = "";
      if (i < allNames.length) {
          configName = String(allNames[i][0] || "").trim();
      }
      
      if (configName) {
          lastPersonName = configName;
          rowOffset = 0;
          let val = 0;
          if (personTotalBonus[configName]) val = personTotalBonus[configName].weekday;
          fColumnData.push([val]); 
      } else {
          rowOffset++;
          if (lastPersonName && rowOffset === 1) {
              let val = 0;
              if (personTotalBonus[lastPersonName]) val = personTotalBonus[lastPersonName].holiday;
              fColumnData.push([val]); 
          } else {
              fColumnData.push([""]); 
          }
      }
    }

    // --- 4. 寫入 F 欄 ---
    
    // 只清空 F 欄數值區 (F3 ~ F17)
    sheetConfig.getRange("F3:F17").clearContent();

    if (fColumnData.length > 0) {
      let writeLength = Math.min(fColumnData.length, 15); 
      sheetConfig.getRange(3, 6, writeLength, 1).setValues(fColumnData.slice(0, writeLength)); 
      
      // 指定寫入 E18 與 F18
      sheetConfig.getRange("E18").setValue("獎金總計")
          .setFontWeight("bold")
          .setHorizontalAlignment("right");
      
      sheetConfig.getRange("F18")
        .setFormula("=SUM(F3:F16)")
        .setFontWeight("bold")
        .setFontColor("blue")
        .setNumberFormat("#,##0"); 

      // ★ 這裡很重要：用 return 回傳文字，不要用 alert
      return "✅ F 欄業績獎金計算完成！\n已更新 F3~F16 數據及 F18 總計。";
    }
    return "⚠️ 沒有資料需要更新";

  } catch (e) {
    return "❌ 錯誤: " + e.message;
  }
}

// --- 4. 從 Drive 讀取檔案 ------------------------------------------------------------------------------------
const TARGET_FOLDER_ID = '1_cQXDMTSzB8yl5Qv38VpC1zvVlH2YJ10'; 

function getDriveFileList() {
  try {
    const folder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    const files = folder.getFiles();
    let fileList = [];

    while (files.hasNext()) {
      let file = files.next();
      let name = file.getName();
      if (name.toLowerCase().endsWith('.xlsx') && !name.startsWith('~$')) {
        fileList.push({
          id: file.getId(),
          name: name,
          updated: file.getLastUpdated().getTime() 
        });
      }
    }
    fileList.sort((a, b) => b.updated - a.updated);
    return fileList;
  } catch (e) {
    throw new Error("讀取列表失敗: " + e.message);
  }
}

function getFileContentById(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    return {
      filename: file.getName(),
      base64: Utilities.base64Encode(file.getBlob().getBytes())
    };
  } catch (e) {
    throw new Error("下載檔案失敗: " + e.message);
  }
}

// --- 5. 計算伙食津貼 (網頁版安全模式：移除 alert) ---
function updateMealAllowanceCount() {
  const ss = getSpreadsheetForWeb_();
  const sheetData = ss.getSheetByName('打卡之星匯入區');
  const sheetConfig = ss.getSheetByName('當月薪資計算');

  if (!sheetData || !sheetConfig) return "❌ 找不到工作表";

  const data = sheetData.getDataRange().getValues();
  if (data.length < 2) return "⚠️ 匯入區沒有資料";

  let mealCounts = {}; 

  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    let name = row[0];
    let dateType = String(row[2] || ""); 
    let shiftName = String(row[3] || ""); 
    let startVal = row[4];
    let endVal = row[5];
    let workHours = Number(row[6]); 
    
    if (!name || name.includes("總工時") || !workHours) continue;

    if (!mealCounts[name]) mealCounts[name] = { weekday: 0, holiday: 0 };

    const dailyAmount = computeDailyMealAllowance(dateType, shiftName, startVal, endVal, workHours);

    if (dateType.includes("平日")) {
        mealCounts[name].weekday += dailyAmount;
    } else {
        mealCounts[name].holiday += dailyAmount;
    }
  }

  const configData = sheetConfig.getDataRange().getValues();
  let outputColumn = []; 
  let lastPersonName = ""; 
  let rowOffset = 0;       

  for (let i = 2; i < configData.length; i++) {
    let configName = configData[i][0]; 
    if (configName) {
        lastPersonName = configName;
        rowOffset = 0;
        let val = 0;
        if (mealCounts[configName]) val = mealCounts[configName].weekday;
        outputColumn.push([val]); 
    } else {
        rowOffset++;
        if (lastPersonName && rowOffset === 1) {
            let val = 0;
            if (mealCounts[lastPersonName]) val = mealCounts[lastPersonName].holiday;
            outputColumn.push([val]); 
        } else {
            outputColumn.push([""]);
        }
    }
  }

  if (outputColumn.length > 0) {
    sheetConfig.getRange(3, 5, outputColumn.length, 1).setValues(outputColumn); 
  }
  return "OK";
}

// 共用：依單日打卡資料計算伙食津貼金額（嚴格版）
function computeDailyMealAllowance(dateType, shiftName, startVal, endVal, workHours) {
  const hours = Number(workHours) || 0;
  if (hours < 5) return 0;

  const hasPunch =
    startVal &&
    endVal &&
    String(startVal).trim() !== '--' &&
    String(endVal).trim() !== '--';

  if (!hasPunch) return 0;

  const LUNCH_START  = 11 * 60; // 11:00
  const LUNCH_END    = 13 * 60; // 13:00
  const DINNER_START = 17 * 60; // 17:00
  const DINNER_END   = 19 * 60; // 19:00

  let s = normalizeTime(startVal);
  let e = normalizeTime(endVal);
  if (!s || !e) return 0;

  let startMins = s.total;
  let endMins = e.total;
  if (endMins < startMins) endMins += 1440; // 跨午夜

  let qualifyLunch  = (startMins <= LUNCH_START  && endMins >= LUNCH_END);
  let qualifyDinner = (startMins <= DINNER_START && endMins >= DINNER_END);

  let dailyAmount = 0;
  if (qualifyLunch)  dailyAmount += 100;
  if (qualifyDinner) dailyAmount += 100;

  return dailyAmount;
}

// --- 6. 生成：設定獎金表 (網頁版安全模式：移除 alert) ---
function setupBonusTable() {
  const ss = getSpreadsheetForWeb_();
  const sheetData = ss.getSheetByName('打卡之星匯入區');
  const sheetConfig = ss.getSheetByName('當月薪資計算');

  // 1. 先從匯入區 B2 抓年份作為預設
  const rawValue = sheetData.getRange("B2").getValue();
  let baseDate = parseAnyDate(rawValue); 
  if (!baseDate) return `❌ 無法解析日期: ${rawValue}`;

  let targetYear = baseDate.getFullYear();

  // 2. 優先使用 M1 的「手動指定月份」，若無效再用匯入日期的月份
  let m1Val = sheetConfig.getRange("M1").getValue();
  let targetMonth = 0; // 1–12

  if (m1Val) {
    let mText = String(m1Val).replace("月", "").trim();
    let mNum = parseInt(mText, 10);
    if (!isNaN(mNum) && mNum >= 1 && mNum <= 12) {
      targetMonth = mNum;
    }
  }

  if (!targetMonth) {
    targetMonth = baseDate.getMonth() + 1; // 1–12
  }

  const monthIndex = targetMonth - 1; // Date() 用的 0–11

  // 3. 更新 L1 (年份) 與 M1 (月份) 顯示
  sheetConfig.getRange("L1").setValue(targetYear + "年");
  sheetConfig.getRange("M1").setValue(targetMonth + "月");

  // 4. 清理範圍縮小（只動 L:O），避免誤刪 P 欄以後的資料
  sheetConfig.getRange("L3:O40").clearContent().clearDataValidations().setBackground(null);

  // 設定標題 (如果您 L2~O2 已經有固定標題且不想被重寫，可以註解掉這幾行)
  sheetConfig.getRange("L2").setValue("日期").setFontWeight("bold");
  sheetConfig.getRange("M2").setValue("星期").setFontWeight("bold");
  sheetConfig.getRange("N2").setValue("當日營業額").setFontWeight("bold");
  sheetConfig.getRange("O2").setValue("當日獎金").setFontWeight("bold");
  // -------------------------------------------------------------------

  let daysInMonth = new Date(targetYear, monthIndex + 1, 0).getDate();
  let outputData = [];
  let backgrounds = [];
  const weekMap = ['(日)', '(一)', '(二)', '(三)', '(四)', '(五)', '(六)'];
  
  let ruleHoliday = SpreadsheetApp.newDataValidation().requireValueInList(['--', '9K', '10K', '11K', '12K'], true).build();
  let ruleWeekday = SpreadsheetApp.newDataValidation().requireValueInList(['--', '5.5K', '6.5K'], true).build();
  let validationRules = [];

  for (let d = 1; d <= daysInMonth; d++) {
    let currentDate = new Date(targetYear, monthIndex, d);
    let dayIndex = currentDate.getDay(); 
    let weekStr = weekMap[dayIndex];
    let isWeekend = (dayIndex === 0 || dayIndex === 6);
    let isWed = (dayIndex === 3); 
    let defaultRevenue = isWed ? "--" : "";
    let formula = `=SWITCH(N${d+2}, "--", 0, "9K", 100, "10K", 200, "11K", 300, "12K", 400, "5.5K", 100, "6.5K", 200, 0)`;
    
    outputData.push([currentDate, weekStr, defaultRevenue, formula]);
    let color = isWed ? "#EEEEEE" : "white";
    backgrounds.push([color, color, color, color]); 
    validationRules.push([isWeekend ? ruleHoliday : ruleWeekday]);
  }

  if (outputData.length > 0) {
    let range = sheetConfig.getRange(3, 12, outputData.length, 4);
    range.setValues(outputData);
    sheetConfig.getRange(3, 12, outputData.length, 1).setNumberFormat("yyyy/MM/dd");
    range.setBackgrounds(backgrounds);
    sheetConfig.getRange(3, 14, outputData.length, 1).setDataValidations(validationRules);

    // 根據星期設定 M 欄字體樣式：週六/週日紅色粗體，其餘黑色一般
    for (let d = 1; d <= daysInMonth; d++) {
      let currentDate = new Date(targetYear, monthIndex, d);
      let dayIndex = currentDate.getDay();
      let isWeekend = (dayIndex === 0 || dayIndex === 6);
      let mCell = sheetConfig.getRange(2 + d, 13); // M3 起
      if (isWeekend) {
        mCell.setFontColor("red").setFontWeight("bold");
      } else {
        mCell.setFontColor("black").setFontWeight("normal");
      }
    }
  }
  return "OK";
}

// --- 輔助函式：強力解析各種日期格式 ------------------------------------------------------------------------------------
function parseAnyDate(val) {
  if (!val) return null;
  let dateObj = null;
  
  if (val instanceof Date) {
    dateObj = val;
  } else if (typeof val === 'number') {
    // Excel 序列號
    dateObj = new Date((val - 25569) * 86400 * 1000);
  } else if (typeof val === 'string') {
    dateObj = new Date(val);
  }
  
  if (dateObj && !isNaN(dateObj.getTime())) {
    // ★ 關鍵：重設時間為中午 12:00，避免時區導致的日期誤差
    dateObj.setHours(12, 0, 0, 0);
    return dateObj;
  }
  return null;
}

function normalizeTime(val) {
  if (!val) return null;
  let h=0, m=0;
  if (typeof val === 'number') {
      let totalMins = Math.round(val * 24 * 60);
      h = Math.floor(totalMins / 60);
      m = totalMins % 60;
  }
  else if (val instanceof Date) { h=val.getHours(); m=val.getMinutes(); }
  else {
    let parts = String(val).trim().split(':');
    if (parts.length >= 2) { h=parseInt(parts[0]); m=parseInt(parts[1]); }
    else return null;
  }
  return {h, m, total: h*60+m};
}

function calculateHours(sVal, eVal) {
  let s = normalizeTime(sVal), e = normalizeTime(eVal);
  if (!s || !e) return 0;
  let diff = e.total - s.total;
  if (diff < 0) diff += 1440; 
  let h = Math.floor(diff/60), m = diff%60;
  if (m <= 15) return h;
  if (m <= 45) return h + 0.5;
  return h + 1.0;
}

function checkMealAllowance(sVal, eVal, hours) {
  if (hours < 4) return false; 
  let s = normalizeTime(sVal), e = normalizeTime(eVal);
  if (!s || !e) return false;
  let sMin = s.total, eMin = e.total;
  if (eMin < sMin) eMin += 1440;
  let lunch = (Math.max(sMin, 660) < Math.min(eMin, 780)); 
  let dinner = (Math.max(sMin, 1020) < Math.min(eMin, 1140));
  return lunch || dinner;
}

function outputResults(payroll, configMap, bonusMap, sheetOutput) {
  let output = [];
  let allNames = new Set([...Object.keys(payroll), ...Object.keys(configMap)]);
  allNames.forEach(name => {
    let p = payroll[name] || { hours: 0, mealCount: 0, baseSalary: 0 };
    let mealMoney = p.mealCount * 100;
    let fixed = configMap[name] ? configMap[name].fixedBonus : 0;
    let variable = bonusMap[name] || 0;
    let totalBonus = fixed + variable;
    let total = p.baseSalary + mealMoney + totalBonus;
    if (total > 0 || p.hours > 0) output.push([name, p.hours, p.baseSalary, mealMoney, totalBonus, total]);
  });
  
  sheetOutput.getRange('A2:F100').clearContent();
  if (output.length > 0) sheetOutput.getRange(2, 1, output.length, 6).setValues(output);
}

function loadConfig(sheet) {
  let d = sheet.getDataRange().getValues(), map = {};
  for(let i=1; i<d.length; i++) if(d[i][0]) map[d[i][0]]={weekdayRate:d[i][1], holidayRate:d[i][2], fixedBonus:d[i][3]};
  return map;
}

function loadBonus(sheet, targetMonth) {
  let d = sheet.getDataRange().getValues(), map = {};
  for(let i=1; i<d.length; i++) {
     let dateStr = String(d[i][1]); 
     if(dateStr.includes(targetMonth) || dateStr.replace('/','-').includes(targetMonth)) { 
        let n=d[i][2]; 
        if(!map[n]) map[n]=0; 
        map[n]+=Number(d[i][3]); 
     }
  }
  return map;
}

// --- 3. 連動當月總工時 (修正版：從匯入區抓取總計 -> 填入「當月薪資計算」 D 欄) ---
function linkTotalHours() {
  const ss = getSpreadsheetForWeb_();
  const sourceSheet = ss.getSheetByName("打卡之星匯入區");
  const targetSheet = ss.getSheetByName("當月薪資計算"); // ★ 注意：已改為新頁面名稱

  if (!sourceSheet || !targetSheet) {
    // 找不到工作表時的回傳
    console.error("❌ 找不到工作表，請檢查名稱。");
    return;
  }

  // 1. 掃描匯入區，建立 {姓名: 工時} 的對照表
  const sourceData = sourceSheet.getDataRange().getValues();
  let hoursMap = {};

  sourceData.forEach(row => {
    let label = String(row[0]); // A欄名稱
    // 找出有寫 "當月總工時" 的那一列 (例如: "黃久玲當月總工時")
    if (label.includes("當月總工時")) {
      let name = label.replace("當月總工時", "").trim(); // 去掉後綴，只留名字
      let hours = row[6]; // G欄是工時
      hoursMap[name] = hours;
    }
  });

  // 2. 寫入參數設定區 D 欄
  const lastRow = targetSheet.getLastRow();
  if (lastRow < 3) return; 

  // 讀取 A 欄所有名字 (從第3列開始)
  const names = targetSheet.getRange(3, 1, lastRow - 2, 1).getValues(); 
  // 準備寫入 D 欄的範圍
  const targetRange = targetSheet.getRange(3, 4, lastRow - 2, 1); 
  let currentValues = targetRange.getValues(); // 先讀取舊資料，避免覆蓋掉格式

  let updateCount = 0;

  for (let i = 0; i < names.length; i++) {
    let configName = String(names[i][0]).trim();
    // 如果 A 欄有名字，且我們在匯入區有抓到這個人的總工時
    if (configName && hoursMap[configName] !== undefined) {
       currentValues[i][0] = hoursMap[configName]; // 更新 D 欄數值
       updateCount++;
    }
  }

  // 3. 一次性寫回
  targetRange.setValues(currentValues);
  
  console.log(`已更新 ${updateCount} 人的工時資料`);
}

// --- 組合功能按鈕：計算津貼 + 設定獎金表 + 連動工時 (網頁版進入點) ---
function calculateAllowanceAndHours() {
  try {
    // 1. 計算伙食津貼
    updateMealAllowanceCount();
    
    // 2. 設定獎金表
    setupBonusTable();
    
    // 3. 連動當月總工時 (先前已修復為無 alert 版)
    linkTotalHours();
    
    // ★ 成功後回傳字串給網頁顯示
    return "✅ 執行完成！\n1. 伙食津貼計算\n2. 獎金表設定\n3. 總工時連動";
  } catch (e) {
    return "❌ 錯誤: " + e.message;
  }
}

// --- 4. 備份當月薪資表 (整合版：產生分頁 + 存入 XLSX) ---
function backupAndExportUBB() {
  const ss = getSpreadsheetForWeb_();
  const sourceSheet = ss.getSheetByName('當月薪資計算');
  if (!sourceSheet) return "❌ 找不到 [當月薪資計算] 工作表";

  const folderId = "1ewxuVB25qzSSYzc21MzR5XtNjtdS_z41";
  const REMOVE_DRAWINGS = false; // 先關掉，避免卡在 drawings
  const PROGRESS_CELL = "K1";     // 你可改成不會被用到的位置

  const tick = (msg) => {
    console.log("[UBB] " + msg);
    // 寫到表上讓你肉眼看到進度（避免你沒去看 Executions）
    sourceSheet.getRange(PROGRESS_CELL).setValue("[UBB] " + msg);
    SpreadsheetApp.flush();
  };

  try {
    tick("start");

    const yearVal = String(sourceSheet.getRange("L1").getValue()).replace("年", "").trim();
    const monthVal = String(sourceSheet.getRange("M1").getValue()).replace("月", "").trim();
    if (!yearVal || !monthVal) return "❌ L1/M1 年月未設定";

    const baseName = `${yearVal}-${monthVal}月薪_UBB`;
    tick("baseName=" + baseName);

    // 0) 先切回來源 sheet，避免刪 active sheet 出狀況
    ss.setActiveSheet(sourceSheet);

    // 1) 刪舊 sheet
    const oldSheet = ss.getSheetByName(baseName);
    if (oldSheet) {
      tick("delete old sheet");
      ss.deleteSheet(oldSheet);
    }

    // 2) copyTo（常見卡點 #1）
    tick("copyTo begin");
    const ubbSheet = sourceSheet.copyTo(ss);
    tick("copyTo done");

    ubbSheet.setName(baseName);
    tick("rename done (gid=" + ubbSheet.getSheetId() + ")");

    // 3) 移除 drawings（常見卡點 #2）
    if (REMOVE_DRAWINGS) {
      tick("remove drawings begin");
      const drawings = ubbSheet.getDrawings();
      tick("drawings count=" + drawings.length);
      drawings.forEach(d => d.remove());
      tick("remove drawings done");
    } else {
      tick("skip remove drawings");
    }

    // 4) 位置調整
    ss.setActiveSheet(ubbSheet);
    ss.moveActiveSheet(ss.getSheets().length);
    ss.setActiveSheet(sourceSheet);
    tick("move sheet done");

    SpreadsheetApp.flush();
    Utilities.sleep(500);
    tick("flush+sleep done");

    // 5) 匯出（常見卡點 #3）
    const timestamp = Utilities.formatDate(new Date(), "GMT+8", "yyyyMMddHHmm");
    const fullFileName = `${baseName}_${timestamp}`;

    const url = `https://docs.google.com/spreadsheets/d/${ss.getId()}/export?format=xlsx&gid=${ubbSheet.getSheetId()}`;
    tick("export fetch begin");

    const response = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    tick("export fetch done (HTTP " + code + ")");

    if (code !== 200) {
      const body = response.getContentText();
      const snippet = body ? body.slice(0, 300) : "";
      return `⚠️ 分頁已產生，但 Excel 匯出失敗 (HTTP ${code})\n回應片段：${snippet}`;
    }

    // 6) 存入資料夾
    tick("save to folder begin");
    DriveApp.getFolderById(folderId).createFile(response.getBlob().setName(`${fullFileName}.xlsx`));
    tick("save to folder done");

    return `✅ 處理完成！\n1. 已產生分頁：${baseName}\n2. 已匯出 Excel：${fullFileName}.xlsx`;
  } catch (e) {
    console.log(e.stack);
    return "❌ 系統錯誤: " + e.message;
  }
}


// ==========================================
// 🔥 薪資總覽：從「當月薪資計算」或備份分頁 *月薪_UBB 解析列資料
// ==========================================

/** 由當月 L1/M1 往回推 delta 個月（delta 為負表示過去） */
function shiftCalendarMonth_(year, month /* 1–12 */, deltaMonths) {
  const d = new Date(year, month - 1 + deltaMonths, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** 備份分頁命名：{年}-{月}月薪_UBB（與 backupAndExportUBB 一致），支援 1 或 01 月 */
function findBackupSheetForMonth_(ss, year, month) {
  const candidates = [
    `${year}-${month}月薪_UBB`,
    `${year}-${String(month).padStart(2, '0')}月薪_UBB`,
    `${year}-${month}月薪UBB`,
    `${year}-${String(month).padStart(2, '0')}月薪UBB`
  ];
  for (let c = 0; c < candidates.length; c++) {
    const sh = ss.getSheetByName(candidates[c]);
    if (sh) return { sheet: sh, sheetName: candidates[c] };
  }
  const all = ss.getSheets();
  for (let i = 0; i < all.length; i++) {
    const n = all[i].getName();
    const m = n.match(/^(\d{4})-(\d{1,2})月薪_?UBB$/);
    if (m) {
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      if (y === year && mo === month) return { sheet: all[i], sheetName: n };
    }
  }
  return null;
}

function readYearMonthLabel_(sheet) {
  try {
    const y = String(sheet.getRange('L1').getDisplayValue() || '').replace(/年/g, '').trim();
    const mo = String(sheet.getRange('M1').getDisplayValue() || '').replace(/月/g, '').trim();
    if (y && mo) return `${y}年${mo}月`;
  } catch (e) { /* ignore */ }
  return '';
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {boolean} includeRowIndex 僅「當月薪資計算」為 true（網頁下拉寫回 G 欄）
 */
function parseSalaryDashboardFromSheet_(sheet, includeRowIndex) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return [];
  const endRow = lastRow - 2;
  if (endRow < 3) return [];

  const data = sheet.getRange(3, 1, endRow, 9).getDisplayValues();
  const result = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const name = row[0];
    if (!name || name === '' || String(name).includes('總計')) continue;

    const bonus1 = parseFloat(String(row[5]).replace(/[$,]/g, '')) || 0;
    let bonus2 = 0;
    let meal2 = 0;
    if (i + 1 < data.length) {
      const nextRow = data[i + 1];
      if (!String(nextRow[0] != null ? nextRow[0] : '').trim()) {
        bonus2 = parseFloat(String(nextRow[5]).replace(/[$,]/g, '')) || 0;
        meal2 = parseFloat(String(nextRow[4]).replace(/[$,]/g, '')) || 0;
      }
    }
    const meal1 = parseFloat(String(row[4]).replace(/[$,]/g, '')) || 0;

    result.push({
      rowIndex: includeRowIndex ? i + 3 : null,
      name: name,
      hours: row[3],
      meal: meal1 + meal2,
      bonus: bonus1 + bonus2,
      multiplier: row[6],
      jobBonus: row[7],
      salary: row[8]
    });
  }
  return result;
}

function getSalaryDashboardData() {
  const ss = getSpreadsheetForWeb_();
  const sheet = ss.getSheetByName('當月薪資計算');
  if (!sheet) return [];
  return parseSalaryDashboardFromSheet_(sheet, true);
}

/**
 * 當月 + 備份「上個月」「上上個月」（依 L1/M1 往回推 1、2 個月，例：當月 4 月 → 讀 3 月、2 月分頁）
 * @returns {{ current: Object[], history: Object[], currentMonthLabel: string, error: string|null }}
 */
function getSalaryDashboardWithHistory() {
  const ss = getSpreadsheetForWeb_();
  const currentSheet = ss.getSheetByName('當月薪資計算');
  if (!currentSheet) {
    return { current: [], history: [], currentMonthLabel: '', error: '找不到「當月薪資計算」工作表' };
  }

  const current = parseSalaryDashboardFromSheet_(currentSheet, true);
  const yStr = String(currentSheet.getRange('L1').getDisplayValue() || '').replace(/年/g, '').trim();
  const mStr = String(currentSheet.getRange('M1').getDisplayValue() || '').replace(/月/g, '').trim();
  const cy = parseInt(yStr, 10);
  const cm = parseInt(mStr, 10);

  const currentMonthLabel = readYearMonthLabel_(currentSheet) || (yStr && mStr ? `${yStr}年${mStr}月` : '當月');

  if (isNaN(cy) || isNaN(cm) || cm < 1 || cm > 12) {
    return {
      current: current,
      history: [],
      currentMonthLabel: currentMonthLabel,
      error: 'L1/M1 無法解析年月，無法對應備份分頁（請確認「當月薪資計算」L1、M1）'
    };
  }

  const blocks = [
    { title: '上個月薪資結算', monthOffset: -1 },
    { title: '上上個月薪資結算', monthOffset: -2 }
  ];
  const history = [];

  for (let k = 0; k < blocks.length; k++) {
    const tm = shiftCalendarMonth_(cy, cm, blocks[k].monthOffset);
    const ymLabel = `${tm.year}年${tm.month}月`;
    const found = findBackupSheetForMonth_(ss, tm.year, tm.month);
    const guessName = `${tm.year}-${tm.month}月薪_UBB`;

    if (found) {
      history.push({
        title: blocks[k].title,
        yearMonth: readYearMonthLabel_(found.sheet) || ymLabel,
        sheetName: found.sheetName,
        rows: parseSalaryDashboardFromSheet_(found.sheet, false),
        found: true
      });
    } else {
      history.push({
        title: blocks[k].title,
        yearMonth: ymLabel,
        sheetName: guessName,
        rows: [],
        found: false
      });
    }
  }

  return { current: current, history: history, currentMonthLabel: currentMonthLabel, error: null };
}

// --- 新增：更新 G 欄倍數 (網頁下拉觸發) ---
function updateSalaryMultiplier(rowIndex, value) {
  const ss = getSpreadsheetForWeb_();
  const sheet = ss.getSheetByName('當月薪資計算');
  
  // 寫入 G 欄 (第 7 欄)
  sheet.getRange(rowIndex, 7).setValue(value);
  
  // 強制刷新並回傳最新的「薪資總額 (I欄)」
  SpreadsheetApp.flush();
  const newSalary = sheet.getRange(rowIndex, 9).getDisplayValue(); // I欄
  return newSalary;
}

// --- 2. 取得「每日獎金」資料 (修正版：鎖定 P~U 欄，排除 U 欄後錯誤資料) ---
function getDailyBonusTable() {
  const ss = getSpreadsheetForWeb_();
  const sheet = ss.getSheetByName('當月薪資計算');
  if (!sheet) return { empNames: [], data: [], selectedMonth: null };

  const lastRow = sheet.getLastRow();
  
  // 1. 處理標題列 (Row 2)，只看 P(16) ~ U(21)
  // 我們鎖定最多讀取 6 位員工 (P, Q, R, S, T, U)
  const maxEmpCol = 21; // U欄
  const startEmpCol = 16; // P欄
  const empColCount = maxEmpCol - startEmpCol + 1; // 6欄

  // 讀取 P2:U2 的名字
  const headerRaw = sheet.getRange(2, startEmpCol, 1, empColCount).getDisplayValues()[0];
  
  // 找出「有效」的員工索引 (有名字才算)
  // validIndices 會存像是 [0, 1, 2, 3] 代表 P, Q, R, S 有人
  let validIndices = [];
  let empNames = [];
  
  headerRaw.forEach((name, index) => {
    if (name && name.trim() !== "") {
      validIndices.push(index);
      empNames.push(name);
    }
  });

  if (lastRow < 3) {
    const m1Val = sheet.getRange("M1").getDisplayValue() || sheet.getRange("M1").getValue();
    let selectedMonth = null;
    if (m1Val) {
      const mText = String(m1Val).replace("月", "").trim();
      const mNum = parseInt(mText, 10);
      if (!isNaN(mNum) && mNum >= 1 && mNum <= 12) selectedMonth = mNum;
    }
    return { empNames: empNames, data: [], selectedMonth: selectedMonth };
  }

  // 2. 讀取資料區 (L3 ~ U最後一列)
  // L欄(12) 到 U欄(21) 共 10 個欄位
  // 我們一次讀進來，再用上面的 validIndices 去篩選
  const dataRange = sheet.getRange(3, 12, lastRow - 2, 10); 
  const rawData = dataRange.getDisplayValues();

  // 整理資料
  const cleanData = rawData.map((row, index) => {
    // row[0]=L, row[1]=M, row[2]=N, row[3]=O
    // row[4]=P, row[5]=Q, ... row[9]=U
    
    // 只抓取「有名字」的那幾欄獎金
    let currentEmpBonuses = validIndices.map(i => row[4 + i]);

    return {
      rowIndex: index + 3,
      date: row[0],       // L欄
      week: row[1],       // M欄
      revenue: row[2],    // N欄
      totalBonus: row[3], // O欄
      empBonuses: currentEmpBonuses // 只包含有效的 P~U 資料
    };
  });

  const m1Val = sheet.getRange("M1").getDisplayValue() || sheet.getRange("M1").getValue();
  let selectedMonth = null;
  if (m1Val) {
    const mText = String(m1Val).replace("月", "").trim();
    const mNum = parseInt(mText, 10);
    if (!isNaN(mNum) && mNum >= 1 && mNum <= 12) selectedMonth = mNum;
  }

  return {
    empNames: empNames, // 回傳乾淨的員工名單
    data: cleanData,
    selectedMonth: selectedMonth
  };
}

// 依指定月份重建獎金表（變更 M1 並呼叫 setupBonusTable）
function changeBonusMonth(monthNumber) {
  const ss = getSpreadsheetForWeb_();
  const sheetConfig = ss.getSheetByName('當月薪資計算');
  if (!sheetConfig) return "❌ 找不到 [當月薪資計算] 工作表";

  const m = parseInt(monthNumber, 10);
  if (isNaN(m) || m < 1 || m > 12) return "❌ 非法月份";

  sheetConfig.getRange("M1").setValue(m + "月");
  setupBonusTable();
  return "OK";
}

// 3. 更新「每日業績」 (網頁下拉選單改變時觸發)
function updateDailyRevenue(rowIndex, value) {  // 強制檢查 rowIndex，如果是空的就直接停止，避免系統崩潰
  if (!rowIndex || rowIndex === "null") {
    console.error("錯誤：接收到空的列號 (rowIndex)");
    return "⚠️ 無效的列號"; 
  }
  
  const ss = getSpreadsheetForWeb_();
  const sheet = ss.getSheetByName('當月薪資計算');
  
  // 原有的寫入邏輯
  sheet.getRange(rowIndex, 14).setValue(value);
  SpreadsheetApp.flush();
  return sheet.getRange(rowIndex, 15).getDisplayValue();
}

// 4. 取得「員工打卡明細」 (依員工分組)
function getEmployeeDetailData() {
  const ss = getSpreadsheetForWeb_();
  const sheet = ss.getSheetByName('打卡之星匯入區');
  if (!sheet) return {};

  const data = sheet.getDataRange().getDisplayValues();
  let employees = {};

  // 從第 2 列開始讀 (略過標題)
  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    let name = row[0];
    
    // 略過總工時列或空名
    if (!name || name.includes("總工時")) continue;

    const dateType = row[2];
    const shiftName = row[3];
    const startVal = row[4];
    const endVal = row[5];
    const workHours = row[6];
    const meal = computeDailyMealAllowance(dateType, shiftName, startVal, endVal, workHours);

    if (!employees[name]) {
      employees[name] = [];
    }

    employees[name].push({
      date: row[1],      // 打卡日期
      type: row[2],      // 日期類別
      shift: row[3],     // 班別
      start: row[4],     // 上班卡
      end: row[5],       // 下班卡
      hours: row[6],     // 工時
      meal: meal         // 當日伙食津貼
    });
  }
  return employees; // 回傳結構: { "黃久玲": [...資料], "黃雨柔": [...資料] }
}

function authUrlFetchOnce() {
  UrlFetchApp.fetch("https://www.google.com");
}

