// หากเปิด Apps Script ผ่านเมนู Extensions > Apps Script ใน Google Sheets สามารถเว้นว่าง '' ไว้ได้เลย
// แต่ถ้าสร้างไฟล์ Apps Script แยกต่างหาก ให้นำ SPREADSHEET_ID มาใส่ในเครื่องหมายคำพูดด้านล่างนี้ครับ
const SPREADSHEET_ID = '1S4KG7PEqPTbxycoHXoililrWMr75xtJFtAuahW2m7qk'; 

function getSpreadsheet_() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== '') {
    return SpreadsheetApp.openById(SPREADSHEET_ID.trim());
  }
  const activeSs = SpreadsheetApp.getActiveSpreadsheet();
  if (!activeSs) {
    throw new Error('ไม่พบไฟล์ Google Sheets (กรุณาเปิดผ่านเมนู Extensions > Apps Script จากใน Google Sheets หรือระบุ SPREADSHEET_ID ในหน้า Code.gs)');
  }
  return activeSs;
}

function getTargetSheet_(sheetName) {
  const ss = getSpreadsheet_();
  const name = String(sheetName || '').trim();
  if (name.startsWith('_')) throw new Error('FORBIDDEN: ไม่อนุญาตให้เข้าถึงชีตระบบ');
  const sheet = name ? ss.getSheetByName(name) : ss.getSheets().find(s => !s.getName().startsWith('_'));
  if (!sheet) throw new Error('ไม่พบชีตข้อมูล');
  return sheet;
}

// Public PNG/ICO URL for the browser tab icon of the deployed web app.
const WEB_FAVICON_URL = '';

function doGet() {
  const output = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('ระบบรายงานผลการจัดการศึกษาและการสนับสนุนนิสิต')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  if (WEB_FAVICON_URL) output.setFaviconUrl(WEB_FAVICON_URL);
  return output;
}

function getSheetList(token) {
  requireRole_(token, ['admin', 'employee', 'user']);
  return getSheetList_();
}

function getSheetList_() {
  const ss = getSpreadsheet_();
  // ชีตที่ขึ้นต้นด้วย _ เป็นชีตระบบ (เช่น _MENU) ไม่ต้องแสดงในรายการข้อมูล
  return ss.getSheets().map(s => s.getName()).filter(name => name.charAt(0) !== '_');
}

function createNewSheet(sheetName, initialHeaders, token) {
  requireRole_(token, ["admin"]);
  const ss = getSpreadsheet_();
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
  return { status: 'success', sheetName: cleanName, sheets: getSheetList_() };
}

function getSheetData(sheetName, token) {
  requireRole_(token, ["admin","employee","user"]);
  if (String(sheetName || '').trim().startsWith('_')) throw new Error('FORBIDDEN: ไม่อนุญาตให้เข้าถึงชีตระบบ');
  const ss = getSpreadsheet_();
  const namedSheet = sheetName ? ss.getSheetByName(sheetName) : null;
  if (sheetName && !namedSheet) {
    return { sheetName: sheetName, headers: [], rows: [], missing: true };
  }
  const sheet = namedSheet || getTargetSheet_(sheetName);
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

function updateHeaders(sheetName, newHeadersArray, token) {
  requireRole_(token, ["admin"]);
  const sheet = getTargetSheet_(sheetName);
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
function addRecord(sheetName, rowArray, token) {
  requireRole_(token, ["admin","employee"]);
  const sheet = getTargetSheet_(sheetName);
  if (!Array.isArray(rowArray) || !rowArray.length || rowArray.length > sheet.getLastColumn()) throw new Error('ข้อมูลไม่ตรงกับคอลัมน์ของชีต');
  sheet.appendRow(rowArray);
  return { status: 'success', addedRow: rowArray };
}

function updateSingleCell(sheetName, rowIndex, colIndex, newValue, token) {
  requireRole_(token, ["admin","employee"]);
  const sheet = getTargetSheet_(sheetName);
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= sheet.getLastRow() - 1 ||
      !Number.isInteger(colIndex) || colIndex < 0 || colIndex >= sheet.getLastColumn()) {
    throw new Error('ตำแหน่งเซลล์ไม่ถูกต้อง');
  }
  const sheetRow = Number(rowIndex) + 2;
  const sheetCol = Number(colIndex) + 1;
  
  sheet.getRange(sheetRow, sheetCol).setValue(newValue);
  return { status: 'success' };
}

function deleteRowByIndex(sheetName, rowIndex, token) {
  requireRole_(token, ["admin"]);
  const sheet = getTargetSheet_(sheetName);
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= sheet.getLastRow() - 1) throw new Error('ตำแหน่งแถวไม่ถูกต้อง');
  const sheetRow = Number(rowIndex) + 2;
  sheet.deleteRow(sheetRow);
  return { status: 'success' };
}

function importExcelData(sheetName, excelHeaders, excelRows, mode, token) {
  const actor = requireRole_(token, ["admin","employee"]);
  const sheet = getTargetSheet_(sheetName);
  if (actor.role !== 'admin' && (mode !== 'append' || sheet.getLastColumn() === 0)) {
    throw new Error('FORBIDDEN: เฉพาะ admin ที่ล้างตารางหรือกำหนดคอลัมน์ได้');
  }

  if (mode === 'overwrite' || sheet.getLastColumn() === 0) {
    sheet.clearContents();
    const allData = [excelHeaders, ...excelRows];
    sheet.getRange(1, 1, allData.length, excelHeaders.length).setValues(allData);
    return { status: 'success', count: excelRows.length };
  }

  let currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const cleanExcelHeaders = excelHeaders.map(h => String(h).trim());

  const newCols = cleanExcelHeaders.filter(h => h !== '' && !currentHeaders.includes(h));
  if (actor.role !== 'admin' && newCols.length) throw new Error('FORBIDDEN: ไฟล์มีคอลัมน์ใหม่ กรุณาให้ admin กำหนดคอลัมน์ก่อน');
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
// dashboard = 1 เมื่อต้องการแสดงชีตนี้บนแดชบอร์ด, chart_type = bar | line | pie | doughnut
// chart_columns = ชื่อคอลัมน์ที่ต้องการวาดกราฟ คั่นด้วย , (ว่าง = ใช้คอลัมน์ตัวเลขทั้งหมด)
// chart_colors = สีของแต่ละคอลัมน์ รูปแบบ "ชื่อคอลัมน์=#rrggbb" คั่นด้วย ,
const MENU_HEADERS = ['id', 'parent_id', 'title', 'sheet_name', 'icon', 'sort', 'note', 'dashboard', 'chart_type', 'chart_columns', 'chart_colors'];
const CHART_TYPES = ['bar', 'line', 'pie', 'doughnut'];

const DEFAULT_MENU_ROWS = [
  ['1', '', 'การรับเข้าและผลลัพธ์การศึกษา', '', 'bi-mortarboard-fill', 1, 'ภาพรวมการรับเข้าและผลลัพธ์การศึกษาของนิสิต', 0, 'bar', '', ''],
  ['1.1', '1', 'จำนวนลงทะเบียนใหม่', '', 'bi-person-plus-fill', 1, '', 0, 'bar', '', ''],
  ['1.1.1', '1.1', 'ผลการรับเข้าแยกตามรายงาน', '1.1.1 ผลการรับเข้าแยกตามรายงาน', 'bi-file-earmark-bar-graph-fill', 1, '', 0, 'bar', '', ''],
  ['2', '', 'ผลการเรียนและการคงอยู่ของนิสิต', '', 'bi-activity', 2, '', 0, 'bar', '', ''],
  ['2.1', '2', 'การออกกลางคันชั้นปีที่ 1 จำแนกตามรุ่นเข้า', '2.1 การออกกลางคันชั้นปีที่ 1', 'bi-person-dash-fill', 1, '', 0, 'bar', '', ''],
  ['3', '', 'การสำเร็จการศึกษา', '', 'bi-award-fill', 3, '', 0, 'bar', '', ''],
  ['3.1', '3', 'อัตราสำเร็จตามหลักสูตร (ร้อยละ)', '3.1 อัตราสำเร็จตามหลักสูตร', 'bi-patch-check-fill', 1, 'เก็บจำนวนแรกเข้าและจำนวนผู้สำเร็จ แล้วคำนวณร้อยละ', 0, 'bar', '', '']
];

const DEFAULT_DATA_HEADERS = {
  '1.1.1 ผลการรับเข้าแยกตามรายงาน': ['ปีการศึกษา', 'ประเภทรายงาน', 'หลักสูตร', 'จำนวนรับเข้า (คน)', 'หมายเหตุ'],
  '2.1 การออกกลางคันชั้นปีที่ 1': ['รุ่นเข้า', 'หลักสูตร', 'จำนวนนิสิตในรุ่น (คน)', 'ออกกลางคัน (คน)', 'หมายเหตุ'],
  '3.1 อัตราสำเร็จตามหลักสูตร': ['รุ่นเข้า', 'หลักสูตร', 'จำนวนแรกเข้า (คน)', 'จำนวนผู้สำเร็จ (คน)', 'หมายเหตุ']
};

function ensureDataSheet_(sheetName, initialHeaders) {
  const name = String(sheetName || '').trim();
  if (!name) return null;
  if (name.startsWith('_')) throw new Error('ไม่อนุญาตให้ผูกเมนูกับชีตระบบ');
  const ss = getSpreadsheet_();
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

function seedMenu_(menuSheet) {
  menuSheet.getRange(2, 1, DEFAULT_MENU_ROWS.length, MENU_HEADERS.length).setValues(DEFAULT_MENU_ROWS);
  DEFAULT_MENU_ROWS.forEach(row => {
    if (row[3]) ensureDataSheet_(row[3], DEFAULT_DATA_HEADERS[row[3]] || []);
  });
}

function getMenuSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(MENU_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MENU_SHEET_NAME);
    sheet.getRange(1, 1, 1, MENU_HEADERS.length).setValues([MENU_HEADERS]);
    sheet.setFrozenRows(1);
    seedMenu_(sheet);
    sheet.hideSheet();
  } else if (sheet.getLastColumn() < MENU_HEADERS.length) {
    // อัปเกรดชีตเดิม: เติมหัวคอลัมน์ใหม่ (dashboard, chart_type)
    sheet.getRange(1, 1, 1, MENU_HEADERS.length).setValues([MENU_HEADERS]);
  }
  return sheet;
}

function getMenuConfig(token) {
  requireRole_(token, ["admin","employee","user"]);
  try {
    const menuSheet = getMenuSheet_();
    const lastRow = menuSheet.getLastRow();
    const rows = [];
    if (lastRow > 1) {
      const values = menuSheet.getRange(2, 1, lastRow - 1, MENU_HEADERS.length).getDisplayValues();
      values.forEach(r => {
        const id = String(r[0]).trim();
        if (!id) return;
        const chartType = String(r[8] || '').trim().toLowerCase();
        rows.push({
          id: id,
          parent_id: String(r[1]).trim(),
          title: String(r[2]).trim(),
          sheet_name: String(r[3]).trim(),
          icon: String(r[4]).trim(),
          sort: Number(r[5]) || 0,
          note: String(r[6]).trim(),
          dashboard: String(r[7]).trim() === '1' ? 1 : 0,
          chart_type: CHART_TYPES.indexOf(chartType) >= 0 ? chartType : 'bar',
          chart_columns: String(r[9] || '').trim(),
          chart_colors: String(r[10] || '').trim()
        });
      });
    }
    return { rows: rows, sheets: getSheetList_() };
  } catch (err) {
    return { rows: [], sheets: [], error: err.message || String(err) };
  }
}

function normalizeMenuRows_(rows) {
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
    const rawDash = (r && r.dashboard);
    const chartType = String((r && r.chart_type) || 'bar').trim().toLowerCase();
    const chartColumns = String((r && r.chart_columns) || '')
      .split(',')
      .map(s => String(s).trim())
      .filter((s, i2, arr) => s !== '' && arr.indexOf(s) === i2)
      .join(',');

    const chartColors = String((r && r.chart_colors) || '')
      .split(',')
      .map(function (p) { return String(p).trim(); })
      .filter(function (p) {
        const eq = p.indexOf('=');
        if (eq <= 0) return false;
        return /^#[0-9a-fA-F]{6}$/.test(p.slice(eq + 1).trim()) && p.slice(0, eq).trim() !== '';
      })
      .map(function (p) {
        const eq = p.indexOf('=');
        return p.slice(0, eq).trim() + '=' + p.slice(eq + 1).trim();
      })
      .filter(function (p, i2, arr) { return arr.indexOf(p) === i2; })
      .join(',');
    clean.push({
      id: id,
      parent_id: String((r && r.parent_id) || '').trim(),
      title: title,
      sheet_name: String((r && r.sheet_name) || '').trim(),
      icon: String((r && r.icon) || '').trim() || 'bi-folder2',
      sort: Number(r && r.sort) || (index + 1),
      note: String((r && r.note) || '').trim(),
      dashboard: (rawDash === 1 || rawDash === true || String(rawDash) === '1') ? 1 : 0,
      chart_type: CHART_TYPES.indexOf(chartType) >= 0 ? chartType : 'bar',
      chart_columns: chartColumns,
      chart_colors: chartColors
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

function saveMenuConfig(rows, token) {
  requireRole_(token, ["admin"]);
  try {
    const clean = normalizeMenuRows_(rows);
    const menuSheet = getMenuSheet_();
    clean.forEach(n => {
      if (n.sheet_name) ensureDataSheet_(n.sheet_name);
    });

    const lastRow = menuSheet.getLastRow();
    if (lastRow > 1) {
      menuSheet.getRange(2, 1, lastRow - 1, MENU_HEADERS.length).clearContent();
    }
    if (clean.length > 0) {
      const values = clean.map(n => [n.id, n.parent_id, n.title, n.sheet_name, n.icon, n.sort, n.note, n.dashboard, n.chart_type, n.chart_columns, n.chart_colors]);
      menuSheet.getRange(2, 1, values.length, MENU_HEADERS.length).setValues(values);
    }

    return { status: 'success', rows: clean, sheets: getSheetList_() };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

// Authentication: credentials stay in Script Properties, never in a data sheet.
const AUTH_ROLES = ['admin', 'employee', 'user'];
const AUTH_ITERATIONS = 600000;
const AUTH_SESSION_SECONDS = 21600;

function authProperties_() { return PropertiesService.getScriptProperties(); }
function authDigest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function authUserKey_(username) { return 'AUTH_USER_' + authDigest_(username); }
function authUsername_(value) {
  const username = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._@-]{2,79}$/.test(username)) throw new Error('ชื่อผู้ใช้ต้องยาว 3–80 ตัว ใช้อักษรอังกฤษ ตัวเลข . _ @ -');
  return username;
}
function authEmail_(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email && (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  return email;
}
function authFindLoginUser_(identifier) {
  const matches = authAllUsers_().filter(user => user.username === identifier ||
    (user.email && String(user.email).trim().toLowerCase() === identifier));
  return matches.length === 1 ? matches[0] : null;
}
function authPassword_(password) {
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    throw new Error('รหัสผ่านต้องยาว 12–128 ตัวอักษร');
  }
}
function authReadUser_(username) {
  const raw = authProperties_().getProperty(authUserKey_(username));
  return raw ? JSON.parse(raw) : null;
}
function authPublicUser_(user) {
  return { username: user.username, email: user.email || '', name: user.name, role: user.role, active: user.active };
}
function authAllUsers_() {
  const properties = authProperties_().getProperties();
  return Object.keys(properties).filter(k => k.startsWith('AUTH_USER_')).map(k => JSON.parse(properties[k]));
}
function authLocked_(action) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return action(); } finally { lock.releaseLock(); }
}
function authNewCredential_(password) {
  authPassword_(password);
  const salt = Utilities.getUuid() + Utilities.getUuid();
  return { salt: salt, iterations: AUTH_ITERATIONS, hash: authPbkdf2_(password, salt, AUTH_ITERATIONS) };
}
function authEqual_(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// Visible editor entry points. Explicit Google-account verification also protects
// these functions if called through google.script.run. Never trust the web-app username here.
function requireMaintenanceAccount_() {
  const allowed = String(authProperties_().getProperty('AUTH_MAINTENANCE_EMAIL') || '').trim().toLowerCase();
  const actual = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!allowed || !actual || actual !== allowed) {
    throw new Error('FORBIDDEN: ตั้ง AUTH_MAINTENANCE_EMAIL เป็นอีเมล Google ของผู้ดูแล แล้วรันจาก Apps Script Editor ด้วยบัญชีนั้น');
  }
}

function setupInitialAdmin() {
  requireMaintenanceAccount_();
  const result = setupInitialAdmin_();
  console.log('สร้างบัญชี admin สำเร็จ: ' + result.username);
  return result;
}

function unlockLogin() {
  requireMaintenanceAccount_();
  const result = unlockLogin_();
  console.log('ปลดล็อกบัญชีสำเร็จ: ' + result.username);
  return result;
}

function resetAdminPassword() {
  requireMaintenanceAccount_();
  const result = resetAdminPassword_();
  console.log('ตั้งรหัสผ่าน admin ใหม่สำเร็จ: ' + result.username);
  return result;
}

// Private implementations used by the verified maintenance entry points above.
// Set AUTH_BOOTSTRAP_USERNAME, AUTH_BOOTSTRAP_PASSWORD and optional AUTH_BOOTSTRAP_NAME
// in Project Settings > Script properties first. The password is deleted after setup.
function setupInitialAdmin_() {
  const properties = authProperties_();
  const username = authUsername_(properties.getProperty('AUTH_BOOTSTRAP_USERNAME'));
  const credential = authNewCredential_(properties.getProperty('AUTH_BOOTSTRAP_PASSWORD'));
  return authLocked_(() => {
    if (authAllUsers_().length) throw new Error('มีบัญชีผู้ใช้แล้ว กรุณาใช้หน้าจัดการผู้ใช้ของ admin');
    const user = { username: username, name: String(properties.getProperty('AUTH_BOOTSTRAP_NAME') || username).slice(0, 100),
      email: '', role: 'admin', active: true, version: Utilities.getUuid(), credential: credential };
    properties.setProperty(authUserKey_(username), JSON.stringify(user));
    properties.deleteProperty('AUTH_BOOTSTRAP_PASSWORD');
    return authPublicUser_(user);
  });
}

// Editor-only recovery. Target AUTH_RECOVERY_USERNAME, falling back to the bootstrap username.
function authRecoveryUser_() {
  const properties = authProperties_();
  const username = authUsername_(properties.getProperty('AUTH_RECOVERY_USERNAME') || properties.getProperty('AUTH_BOOTSTRAP_USERNAME'));
  const user = authReadUser_(username);
  if (!user) throw new Error('ไม่พบบัญชีนี้ ตรวจชื่อใน AUTH_RECOVERY_USERNAME หรือรัน setupInitialAdmin หากยังไม่เคยสร้างบัญชี');
  return user;
}

function unlockLogin_() {
  return authLocked_(() => {
    const user = authRecoveryUser_();
    authProperties_().deleteProperty('AUTH_RATE_' + authDigest_(user.username));
    authProperties_().deleteProperty('AUTH_RATE_UNKNOWN');
    return { username: user.username, active: user.active, unlocked: true };
  });
}

// Set AUTH_RECOVERY_PASSWORD in Script Properties, then run from the editor.
function resetAdminPassword_() {
  const user = authRecoveryUser_();
  if (user.role !== 'admin') throw new Error('ฟังก์ชันนี้ใช้กู้คืนบัญชี admin เท่านั้น');
  const credential = authNewCredential_(authProperties_().getProperty('AUTH_RECOVERY_PASSWORD'));
  return authLocked_(() => {
    const latest = authReadUser_(user.username);
    if (!latest || latest.role !== 'admin') throw new Error('บัญชี admin มีการเปลี่ยนแปลง กรุณาตรวจสอบอีกครั้ง');
    latest.credential = credential;
    latest.active = true;
    latest.version = Utilities.getUuid();
    const properties = authProperties_();
    properties.setProperty(authUserKey_(latest.username), JSON.stringify(latest));
    properties.deleteProperty('AUTH_RECOVERY_PASSWORD');
    properties.deleteProperty('AUTH_RATE_' + authDigest_(latest.username));
    properties.deleteProperty('AUTH_RATE_UNKNOWN');
    return { username: latest.username, unlocked: true, passwordReset: true };
  });
}

function login(username, password) {
  const denied = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกระงับ';
  username = String(username || '').trim().toLowerCase();
  if (typeof password !== 'string' || password.length > 128 || username.length > 254 ||
      (!/^[a-z0-9][a-z0-9._@-]{2,79}$/.test(username) && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(username))) throw new Error(denied);
  const user = authFindLoginUser_(username);
  if (!user && !authAllUsers_().length) throw new Error('ระบบยังไม่ได้ตั้งค่าบัญชีผู้ดูแล กรุณาติดต่อผู้ดูแลระบบ');
  // Both identifiers share the same rate limit and canonical session identity.
  if (user) username = user.username;
  const rateKey = 'AUTH_RATE_' + (user ? authDigest_(username) : 'UNKNOWN');
  authLocked_(() => {
    const properties = authProperties_();
    const raw = properties.getProperty(rateKey);
    let rate = raw ? JSON.parse(raw) : { count: 0, until: 0 };
    if (Date.now() >= rate.until) rate = { count: 0, until: Date.now() + 15 * 60 * 1000 };
    if (rate.count >= 5) {
      const seconds = Math.max(1, Math.ceil((rate.until - Date.now()) / 1000));
      throw new Error('ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารออีก ' + Math.floor(seconds / 60) + ' นาที ' + (seconds % 60) + ' วินาที');
    }
    rate.count++;
    properties.setProperty(rateKey, JSON.stringify(rate));
  });
  const credential = user && user.credential;
  const candidate = authPbkdf2_(password, credential ? credential.salt : 'unknown-account', AUTH_ITERATIONS);
  if (!user || !user.active || !credential || !authEqual_(candidate, credential.hash)) throw new Error(denied);
  return authLocked_(() => {
    const latest = authReadUser_(username);
    if (!latest || !latest.active || latest.version !== user.version) throw new Error(denied);
    authProperties_().deleteProperty(rateKey);
    const token = Utilities.getUuid() + Utilities.getUuid();
    const expiresAt = Date.now() + AUTH_SESSION_SECONDS * 1000;
    CacheService.getScriptCache().put('AUTH_SESSION_' + authDigest_(token),
      JSON.stringify({ username: username, version: user.version, expiresAt: expiresAt }), AUTH_SESSION_SECONDS);
    return { token: token, user: authPublicUser_(user), expiresAt: expiresAt };
  });
}

function requireRole_(token, roles) {
  if (typeof token !== 'string' || !/^[a-f0-9-]{72}$/.test(token)) throw new Error('AUTH_REQUIRED: กรุณาเข้าสู่ระบบ');
  const key = 'AUTH_SESSION_' + authDigest_(token);
  const raw = CacheService.getScriptCache().get(key);
  const session = raw ? JSON.parse(raw) : null;
  if (!session || session.expiresAt <= Date.now()) throw new Error('AUTH_REQUIRED: หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่');
  const user = authReadUser_(session.username);
  if (!user || !user.active || user.version !== session.version) {
    CacheService.getScriptCache().remove(key);
    throw new Error('AUTH_REQUIRED: บัญชีหรือสิทธิ์มีการเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่');
  }
  if (!roles.includes(user.role)) throw new Error('FORBIDDEN: คุณไม่มีสิทธิ์ทำรายการนี้');
  return user;
}
function getCurrentUser(token) { return authPublicUser_(requireRole_(token, AUTH_ROLES)); }
function logout(token) {
  if (typeof token === 'string' && /^[a-f0-9-]{72}$/.test(token)) CacheService.getScriptCache().remove('AUTH_SESSION_' + authDigest_(token));
  return { status: 'success' };
}
function listUsers(token) {
  requireRole_(token, ['admin']);
  return authAllUsers_().map(authPublicUser_).sort((a, b) => a.username.localeCompare(b.username));
}
function saveUser(input, token) {
  requireRole_(token, ['admin']);
  if (!input || typeof input !== 'object') throw new Error('ข้อมูลบัญชีไม่ถูกต้อง');
  const username = authUsername_(input.username);
  const originalUsername = input.isNew === true ? username : authUsername_(input.originalUsername || username);
  const requestedEmail = input.email === undefined ? undefined : authEmail_(input.email);
  const name = String(input.name || '').trim();
  const role = String(input.role || '');
  if (!name || name.length > 100 || !AUTH_ROLES.includes(role) || typeof input.active !== 'boolean') throw new Error('ชื่อ สิทธิ์ หรือสถานะบัญชีไม่ถูกต้อง');
  const credential = input.password ? authNewCredential_(input.password) : null;
  return authLocked_(() => {
    requireRole_(token, ['admin']);
    const existing = authReadUser_(originalUsername);
    if (input.isNew === true && existing) throw new Error('ชื่อผู้ใช้นี้มีอยู่แล้ว');
    if (input.isNew !== true && !existing) throw new Error('ไม่พบบัญชีผู้ใช้');
    if (username !== originalUsername && authReadUser_(username)) throw new Error('ชื่อผู้ใช้นี้มีอยู่แล้ว');
    const email = requestedEmail === undefined ? (existing && existing.email || '') : requestedEmail;
    const otherUsers = authAllUsers_().filter(user => user.username !== originalUsername);
    if (otherUsers.some(user => (email && (user.email === email || user.username === email)) || user.email === username)) {
      throw new Error('ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว');
    }
    if (!existing && !credential) throw new Error('กรุณากำหนดรหัสผ่านสำหรับบัญชีใหม่');
    if (existing && existing.active && existing.role === 'admin' && (!input.active || role !== 'admin')) {
      const otherAdmins = authAllUsers_().filter(u => u.username !== originalUsername && u.active && u.role === 'admin');
      if (!otherAdmins.length) throw new Error('ต้องมี admin ที่ใช้งานได้อย่างน้อย 1 คน');
    }
    if (!existing && authAllUsers_().length >= 250) throw new Error('บัญชีผู้ใช้เต็ม (250 บัญชี)');
    const user = { username: username, email: email, name: name, role: role, active: input.active,
      version: Utilities.getUuid(), credential: credential || existing.credential };
    authProperties_().setProperty(authUserKey_(username), JSON.stringify(user));
    if (username !== originalUsername) {
      authProperties_().deleteProperty(authUserKey_(originalUsername));
      authProperties_().deleteProperty('AUTH_RATE_' + authDigest_(originalUsername));
    }
    authProperties_().deleteProperty('AUTH_RATE_' + authDigest_(username));
    return authPublicUser_(user);
  });
}

// SHA-256 and PBKDF2-HMAC-SHA256 for the Apps Script V8 runtime.
// Passwords are UTF-8; derived key length is 32 bytes. No plaintext passwords persist.
const AUTH_SHA256_K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function authShaState_() { return [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]; }
function authShaBlock_(state, words) {
  const w = words.slice();
  for (let i = 16; i < 64; i++) {
    const x = w[i-15], y = w[i-2];
    const s0 = ((x>>>7)|(x<<25)) ^ ((x>>>18)|(x<<14)) ^ (x>>>3);
    const s1 = ((y>>>17)|(y<<15)) ^ ((y>>>19)|(y<<13)) ^ (y>>>10);
    w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
  }
  let [a,b,c,d,e,f,g,h] = state;
  for (let i = 0; i < 64; i++) {
    const s1 = ((e>>>6)|(e<<26)) ^ ((e>>>11)|(e<<21)) ^ ((e>>>25)|(e<<7));
    const t1 = (h + s1 + ((e&f)^((~e)&g)) + AUTH_SHA256_K[i] + w[i]) | 0;
    const s0 = ((a>>>2)|(a<<30)) ^ ((a>>>13)|(a<<19)) ^ ((a>>>22)|(a<<10));
    const t2 = (s0 + ((a&b)^(a&c)^(b&c))) | 0;
    h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
  }
  const result = [a,b,c,d,e,f,g,h];
  return state.map((x,i) => (x + result[i]) | 0);
}
function authUtf8_(text) {
  return Utilities.newBlob(text).getBytes().map(b => (b + 256) % 256);
}
function authShaBytes_(bytes, initial, prefixBytes) {
  let state = initial ? initial.slice() : authShaState_();
  const data = bytes.slice();
  const bitLength = ((prefixBytes || 0) + bytes.length) * 8;
  data.push(128);
  while (data.length % 64 !== 56) data.push(0);
  for (let i=0;i<4;i++) data.push(0);
  for (let i=3;i>=0;i--) data.push((bitLength >>> (i*8)) & 255);
  for (let offset=0;offset<data.length;offset+=64) {
    const words=[];
    for (let j=0;j<64;j+=4) words.push((data[offset+j]<<24)|(data[offset+j+1]<<16)|(data[offset+j+2]<<8)|data[offset+j+3]);
    state=authShaBlock_(state,words);
  }
  return state;
}
function authPbkdf2_(password, salt, iterations) {
  let key = authUtf8_(password);
  if (key.length > 64) {
    key = authShaBytes_(key).flatMap(w => [(w>>>24)&255,(w>>>16)&255,(w>>>8)&255,w&255]);
  }
  while (key.length < 64) key.push(0);
  function padState(mask) {
    const bytes=key.map(b=>b^mask), words=[];
    for(let i=0;i<64;i+=4) words.push((bytes[i]<<24)|(bytes[i+1]<<16)|(bytes[i+2]<<8)|bytes[i+3]);
    return authShaBlock_(authShaState_(),words);
  }
  const inner=padState(0x36), outer=padState(0x5c);
  function digestWords(state, words) {
    return authShaBlock_(state, words.concat([0x80000000,0,0,0,0,0,0,768]));
  }
  let u=digestWords(outer,authShaBytes_(authUtf8_(salt).concat([0,0,0,1]),inner,64));
  const output=u.slice();
  for(let i=1;i<iterations;i++) {
    u=digestWords(outer,digestWords(inner,u));
    for(let j=0;j<8;j++) output[j]^=u[j];
  }
  return output.map(w => ('00000000'+(w>>>0).toString(16)).slice(-8)).join('');
}
