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
  // ชีตที่ขึ้นต้นด้วย _ เป็นชีตระบบ (เช่น _MENU) ไม่ต้องแสดงในรายการข้อมูล
  return ss.getSheets().map(s => s.getName()).filter(name => name.charAt(0) !== '_');
}

function createNewSheet(sheetName, initialHeaders) {
  const ss = getSpreadsheet();
  const cleanName = String(sheetName || '').trim();
  if (!cleanName) {
    return { status: 'error', message: 'กรุณาระบุชื่อชีตข้อมูล' };
  }
  if (cleanName.charAt(0) === '_') {
    return { status: 'error', message: 'ชื่อชีตที่ขึ้นต้นด้วย _ สงวนไว้สำหรับชีตระบบ' };
  }
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
  const ss = getSpreadsheet();
  const namedSheet = sheetName ? ss.getSheetByName(sheetName) : null;
  if (sheetName && !namedSheet) {
    return { sheetName: sheetName, headers: [], rows: [], missing: true };
  }
  const sheet = namedSheet || getTargetSheet(sheetName);
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

// ============================================================
// โครงสร้างเมนู (Config): หัวข้อหลัก -> หัวข้อย่อย -> ชีตข้อมูล
// เก็บไว้ในชีตระบบ _MENU
// ============================================================
const MENU_SHEET_NAME = '_MENU';
const MENU_HEADERS = ['id', 'parent_id', 'title', 'sheet_name', 'icon', 'sort', 'note'];

const DEFAULT_MENU_ROWS = [
  ['1', '', 'การรับเข้าและผลลัพธ์การศึกษา', '', 'bi-mortarboard-fill', 1, 'ภาพรวมการรับเข้าและผลลัพธ์การศึกษาของนิสิต'],
  ['1.1', '1', 'จำนวนลงทะเบียนใหม่', '', 'bi-person-plus-fill', 1, ''],
  ['1.1.1', '1.1', 'ผลการรับเข้าแยกตามรายงาน', '1.1.1 ผลการรับเข้าแยกตามรายงาน', 'bi-file-earmark-bar-graph-fill', 1, ''],
  ['2', '', 'ผลการเรียนและการคงอยู่ของนิสิต', '', 'bi-activity', 2, ''],
  ['2.1', '2', 'การออกกลางคันชั้นปีที่ 1 จำแนกตามรุ่นเข้า', '2.1 การออกกลางคันชั้นปีที่ 1', 'bi-person-dash-fill', 1, ''],
  ['3', '', 'การสำเร็จการศึกษา', '', 'bi-award-fill', 3, ''],
  ['3.1', '3', 'อัตราสำเร็จตามหลักสูตร (ร้อยละ)', '3.1 อัตราสำเร็จตามหลักสูตร', 'bi-patch-check-fill', 1, 'เก็บจำนวนแรกเข้าและจำนวนผู้สำเร็จ แล้วคำนวณร้อยละ']
];

const DEFAULT_DATA_HEADERS = {
  '1.1.1 ผลการรับเข้าแยกตามรายงาน': ['ปีการศึกษา', 'ประเภทรายงาน', 'หลักสูตร', 'จำนวนรับเข้า (คน)', 'หมายเหตุ'],
  '2.1 การออกกลางคันชั้นปีที่ 1': ['รุ่นเข้า', 'หลักสูตร', 'จำนวนนิสิตในรุ่น (คน)', 'ออกกลางคัน (คน)', 'หมายเหตุ'],
  '3.1 อัตราสำเร็จตามหลักสูตร': ['รุ่นเข้า', 'หลักสูตร', 'จำนวนแรกเข้า (คน)', 'จำนวนผู้สำเร็จ (คน)', 'หมายเหตุ']
};

function ensureDataSheet(sheetName, initialHeaders) {
  const name = String(sheetName || '').trim();
  if (!name) return null;
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const headers = (initialHeaders && initialHeaders.length)
      ? initialHeaders
      : (DEFAULT_DATA_HEADERS[name] || []);
    if (headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }
  return sheet;
}

function seedMenu(menuSheet) {
  menuSheet.getRange(2, 1, DEFAULT_MENU_ROWS.length, MENU_HEADERS.length).setValues(DEFAULT_MENU_ROWS);
  DEFAULT_MENU_ROWS.forEach(row => {
    if (row[3]) ensureDataSheet(row[3], DEFAULT_DATA_HEADERS[row[3]] || []);
  });
}

function getMenuSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(MENU_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MENU_SHEET_NAME);
    sheet.getRange(1, 1, 1, MENU_HEADERS.length).setValues([MENU_HEADERS]);
    sheet.setFrozenRows(1);
    seedMenu(sheet);
    sheet.hideSheet();
  }
  return sheet;
}

function getMenuConfig() {
  try {
    const menuSheet = getMenuSheet();
    const lastRow = menuSheet.getLastRow();
    const rows = [];
    if (lastRow > 1) {
      const values = menuSheet.getRange(2, 1, lastRow - 1, MENU_HEADERS.length).getDisplayValues();
      values.forEach(r => {
        const id = String(r[0]).trim();
        if (!id) return;
        rows.push({
          id: id,
          parent_id: String(r[1]).trim(),
          title: String(r[2]).trim(),
          sheet_name: String(r[3]).trim(),
          icon: String(r[4]).trim(),
          sort: Number(r[5]) || 0,
          note: String(r[6]).trim()
        });
      });
    }
    return { rows: rows, sheets: getSheetList() };
  } catch (err) {
    return { rows: [], sheets: [], error: err.message || String(err) };
  }
}

function normalizeMenuRows(rows) {
  if (!rows || rows.length === 0) {
    throw new Error('ต้องมีหัวข้ออย่างน้อย 1 รายการ');
  }

  const clean = [];
  const seen = {};
  rows.forEach((r, index) => {
    const id = String((r && r.id) || '').trim();
    const title = String((r && r.title) || '').trim();
    if (!id) throw new Error('แถวที่ ' + (index + 1) + ' ยังไม่มีรหัสหัวข้อ');
    if (!title) throw new Error('แถวที่ ' + (index + 1) + ' (รหัส ' + id + ') ยังไม่มีชื่อหัวข้อ');
    if (seen[id]) throw new Error('รหัสหัวข้อซ้ำกัน: ' + id);
    seen[id] = true;
    clean.push({
      id: id,
      parent_id: String((r && r.parent_id) || '').trim(),
      title: title,
      sheet_name: String((r && r.sheet_name) || '').trim(),
      icon: String((r && r.icon) || '').trim() || 'bi-folder2',
      sort: Number(r && r.sort) || (index + 1),
      note: String((r && r.note) || '').trim()
    });
  });

  const byId = {};
  clean.forEach(n => { byId[n.id] = n; });

  clean.forEach(n => {
    let parentId = n.parent_id;
    let guard = 0;
    while (parentId) {
      const parent = byId[parentId];
      if (!parent) throw new Error('ไม่พบหัวข้อแม่รหัส "' + parentId + '" ของ "' + n.title + '"');
      parentId = parent.parent_id;
      if (++guard > 100) throw new Error('โครงสร้างเมนูมีวงจร (หัวข้อแม่วนซ้ำ)');
    }
  });

  clean.forEach(n => {
    const hasChild = clean.some(c => c.parent_id === n.id);
    if (hasChild && n.sheet_name) {
      throw new Error('"' + n.title + '" มีหัวข้อย่อยอยู่ จึงเก็บข้อมูลที่หัวข้อนี้ไม่ได้ กรุณาย้ายชีตไปที่หัวข้อย่อย');
    }
  });

  return clean;
}

function saveMenuConfig(rows) {
  try {
    const clean = normalizeMenuRows(rows);
    const menuSheet = getMenuSheet();
    clean.forEach(n => {
      if (n.sheet_name) ensureDataSheet(n.sheet_name);
    });

    const lastRow = menuSheet.getLastRow();
    if (lastRow > 1) {
      menuSheet.getRange(2, 1, lastRow - 1, MENU_HEADERS.length).clearContent();
    }
    if (clean.length > 0) {
      const values = clean.map(n => [n.id, n.parent_id, n.title, n.sheet_name, n.icon, n.sort, n.note]);
      menuSheet.getRange(2, 1, values.length, MENU_HEADERS.length).setValues(values);
    }

    return { status: 'success', rows: clean, sheets: getSheetList() };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}