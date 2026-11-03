// หากเปิด Apps Script ผ่านเมนู Extensions > Apps Script ใน Google Sheets สามารถเว้นว่าง '' ไว้ได้เลย
// แต่ถ้าสร้างไฟล์ Apps Script แยกต่างหาก ให้นำ SPREADSHEET_ID มาใส่ในเครื่องหมายคำพูดด้านล่างนี้ครับ
const SPREADSHEET_ID = '1S4KG7PEqPTbxycoHXoililrWMr75xtJFtAuahW2m7qk'; 

function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== '') {
    return SpreadsheetApp.openById(SPREADSHEET_ID.trim());
  }
  const activeSs = SpreadsheetApp.getActiveSpreadsheet();
  if (!activeSs) {
    throw new Error('ไม่พบไฟล์ Google Sheets (กรุณาเปิดผ่านเมนู Extensions > Apps Script จากใน Google Sheets หรือระบุ SPREADSHEET_ID ในหน้า Code.gs)');
  }
  return activeSs;
}

function getTargetSheet(sheetName) {
  const ss = getSpreadsheet();
  let sheet = sheetName ? ss.getSheetByName(sheetName) : null;
  if (!sheet) {
    sheet = ss.getSheets()[0]; // ถ้าไม่เจอชื่อแท็บ ให้ใช้แท็บแรกสุดอัตโนมัติ
  }
  return sheet;
}

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('ระบบฐานข้อมูล Dynamic Header & Inline Edit')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getSheetList() {
  const ss = getSpreadsheet();
  return ss.getSheets().map(s => s.getName());
}

function createNewSheet(sheetName, initialHeaders) {
  const ss = getSpreadsheet();
  const cleanName = sheetName.trim();
  if (ss.getSheetByName(cleanName)) {
    return { status: 'error', message: 'มีชื่อหัวข้องานนี้อยู่แล้ว' };
  }
  const newSheet = ss.insertSheet(cleanName);
  if (initialHeaders && initialHeaders.length > 0) {
    newSheet.getRange(1, 1, 1, initialHeaders.length).setValues([initialHeaders]);
  }
  return { status: 'success', sheetName: cleanName, sheets: getSheetList() };
}

function getSheetData(sheetName) {
  const sheet = getTargetSheet(sheetName);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  
  if (lastRow === 0 || lastCol === 0) {
    return { sheetName: sheet.getName(), headers: [], rows: [] };
  }
  
  const data = sheet.getDataRange().getDisplayValues();
  return {
    sheetName: sheet.getName(),
    headers: data[0],
    rows: data.slice(1)
  };
}

function updateHeaders(sheetName, newHeadersArray) {
  const sheet = getTargetSheet(sheetName);
  const cleanHeaders = newHeadersArray.map(h => h.trim()).filter(h => h !== '');
  
  if (cleanHeaders.length === 0) {
    return { status: 'error', message: 'ต้องระบุหัวข้อคอลัมน์อย่างน้อย 1 คอลัมน์' };
  }

  const maxCols = Math.max(sheet.getLastColumn(), cleanHeaders.length);
  if (maxCols > 0) {
    sheet.getRange(1, 1, 1, maxCols).clearContent();
  }
  sheet.getRange(1, 1, 1, cleanHeaders.length).setValues([cleanHeaders]);
  
  return { status: 'success', headers: cleanHeaders };
}

// ปรับให้ส่งข้อมูลแถวที่เพิ่มกลับมาทันที หน้าเว็บจะได้ไม่ต้องโหลดใหม่ทั้งตาราง
function addRecord(sheetName, rowArray) {
  const sheet = getTargetSheet(sheetName);
  sheet.appendRow(rowArray);
  return { status: 'success', addedRow: rowArray };
}

function updateSingleCell(sheetName, rowIndex, colIndex, newValue) {
  const sheet = getTargetSheet(sheetName);
  const sheetRow = Number(rowIndex) + 2;
  const sheetCol = Number(colIndex) + 1;
  
  sheet.getRange(sheetRow, sheetCol).setValue(newValue);
  return { status: 'success' };
}

function deleteRowByIndex(sheetName, rowIndex) {
  const sheet = getTargetSheet(sheetName);
  const sheetRow = Number(rowIndex) + 2;
  sheet.deleteRow(sheetRow);
  return { status: 'success' };
}

function importExcelData(sheetName, excelHeaders, excelRows, mode) {
  const sheet = getTargetSheet(sheetName);

  if (mode === 'overwrite' || sheet.getLastColumn() === 0) {
    sheet.clearContents();
    const allData = [excelHeaders, ...excelRows];
    sheet.getRange(1, 1, allData.length, excelHeaders.length).setValues(allData);
    return { status: 'success', count: excelRows.length };
  }

  let currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const cleanExcelHeaders = excelHeaders.map(h => String(h).trim());

  const newCols = cleanExcelHeaders.filter(h => h !== '' && !currentHeaders.includes(h));
  if (newCols.length > 0) {
    sheet.getRange(1, currentHeaders.length + 1, 1, newCols.length).setValues([newCols]);
    currentHeaders = currentHeaders.concat(newCols);
  }

  const mappedRows = excelRows.map(row => {
    const rowObj = {};
    cleanExcelHeaders.forEach((h, idx) => {
      rowObj[h] = row[idx] !== undefined && row[idx] !== null ? row[idx] : '';
    });
    return currentHeaders.map(colName => rowObj[colName] !== undefined ? rowObj[colName] : '');
  });

  if (mappedRows.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, mappedRows.length, currentHeaders.length).setValues(mappedRows);
  }

  return { status: 'success', count: mappedRows.length, newCols: newCols };
}