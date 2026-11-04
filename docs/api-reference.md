# เอกสารอ้างอิง API (Apps Script)

ฟังก์ชันทั้งหมดอยู่ใน `รหัส.gs` ฟังก์ชันที่ชื่อจบด้วย `_` เป็นภายในและเรียกผ่าน `google.script.run` ไม่ได้

## Login และสิทธิ์

ใช้ชื่อผู้ใช้หรืออีเมลพร้อมรหัสผ่านที่ admin สร้างให้ ไม่มีการสมัครสมาชิกหรือเลือก role เองในหน้า Login

| การทำงาน | admin | employee | user |
|---|---|---|---|
| ดู dashboard / รายงาน / ส่งออก | ✓ | ✓ | ✓ |
| เพิ่มและแก้ไขข้อมูล | ✓ | ✓ | — |
| นำเข้า Excel แบบต่อท้ายและคอลัมน์เดิม | ✓ | ✓ | — |
| ลบแถว / นำเข้าแบบล้างตาราง / เปลี่ยนคอลัมน์ | ✓ | — | — |
| สร้างชีต / ตั้งค่าโครงสร้างเมนู | ✓ | — | — |
| เพิ่มบัญชี / กำหนด role / ตั้งรหัสผ่านใหม่ / ระงับบัญชี | ✓ | — | — |

ทุก API ข้อมูลเดิมด้านล่าง **รับ `token` เป็นพารามิเตอร์สุดท้าย** และตรวจสิทธิ์บนเซิร์ฟเวอร์ก่อนเข้าถึงชีต ตัวอย่าง `getSheetData(sheetName, token)` และ `getMenuConfig(token)` ฝั่งหน้าเว็บใช้ `authServer()` เพื่อแนบ token และทิ้งผลลัพธ์จาก session เก่าหลังออกจากระบบ

| ฟังก์ชัน | พารามิเตอร์ / ผลลัพธ์ |
|---|---|
| `login(username, password)` | `username` รับได้ทั้งชื่อผู้ใช้และอีเมล คืน `{ token, user: { username, email, name, role, active }, expiresAt }` โดย session ใช้ชื่อผู้ใช้หลักเสมอ |
| `getCurrentUser(token)` | ตรวจ session และคืนข้อมูลบัญชีสาธารณะ |
| `logout(token)` | ยกเลิก session ที่ระบุ |
| `listUsers(token)` | admin เท่านั้น คืนข้อมูลบัญชีทั้งหมดโดยไม่มี hash/salt |
| `saveUser(input, token)` | admin เท่านั้น: `{ username, originalUsername, email, name, role, active, password, isNew }`; `email` ไม่บังคับ ส่ง `''` เพื่อลบอีเมล หากไม่ส่ง field จะคงค่าเดิม; `isNew: true` ใช้สร้างบัญชี; เมื่อแก้ไขให้ส่ง `isNew: false` พร้อม `originalUsername` เป็นชื่อเดิม และ `username` เป็นชื่อที่ต้องการ ใช้ชื่อหรืออีเมลซ้ำกับบัญชีอื่นไม่ได้ เว้น password ว่างเพื่อคงรหัสเดิม |

- ชื่อผู้ใช้ยาว 3–80 ตัว ใช้ `a-z`, `0-9`, `.`, `_`, `@`, `-` และแปลงเป็นตัวพิมพ์เล็ก
- อีเมลยาวไม่เกิน 254 ตัว ตัดช่องว่างหัวท้ายและแปลงเป็นตัวพิมพ์เล็ก ห้ามซ้ำกับอีเมลหรือชื่อผู้ใช้ของบัญชีอื่น รวมบัญชีที่ระงับแล้ว เพื่อไม่ให้ระบุตัวตนกำกวม
- ชื่อผู้ใช้และอีเมลของบัญชีเดียวกันใช้ตัวนับการลอง Login ร่วมกัน
- รหัสผ่านยาว 12–128 ตัว เก็บเป็น PBKDF2-HMAC-SHA256 600,000 รอบ พร้อม salt เฉพาะบัญชีใน Script Properties ไม่มีรหัสผ่านเริ่มต้นในโค้ด
- session มีอายุสูงสุด 6 ชั่วโมง เก็บ token ใน `sessionStorage` ของแท็บ; เซิร์ฟเวอร์เก็บ session ใน Script Cache ซึ่งอาจล้างก่อนครบเวลาได้ กรณีนี้ต้อง Login ใหม่
- หลังลอง Login ครบ 5 ครั้งใน 15 นาที จะต้องรอจนพ้นช่วงดังกล่าว; Login สำเร็จล้างตัวนับ บัญชีที่ไม่มีอยู่ใช้ตัวนับร่วมกัน
- การแก้ไขบัญชีจะยกเลิก session เดิมของบัญชีนั้นทั้งหมด การลดสิทธิ์/ระงับ admin คนสุดท้ายถูกปฏิเสธ
- บัญชีสูงสุด 250 บัญชีเพื่อจำกัดขนาด Script Properties
- `AUTH_REQUIRED:` หมายถึงต้อง Login ใหม่; `FORBIDDEN:` หมายถึงสิทธิ์ไม่เพียงพอ
- ไม่อนุญาตให้อ่าน/เขียนชีตระบบที่ชื่อขึ้นต้นด้วย `_` ผ่าน API ข้อมูล

ดูขั้นตอนสร้าง admin แรกใน [คู่มือติดตั้ง Login](auth-setup.md)

ฟังก์ชันตั้งค่า/กู้คืนที่แสดงในเมนู Run: `setupInitialAdmin()`, `unlockLogin()`, `resetAdminPassword()` ตรวจอีเมล Google ผู้เรียกผ่าน `Session.getActiveUser().getEmail()` ให้ตรงกับ `AUTH_MAINTENANCE_EMAIL` ก่อนทำงาน อีเมลว่างหรือไม่ตรงจะถูกปฏิเสธ แม้มี token ของ admin ในเว็บก็ใช้แทนอีเมลนี้ไม่ได้

`unlockLogin()` ล้างการล็อกบัญชีใน `AUTH_RECOVERY_USERNAME` (หรือ `AUTH_BOOTSTRAP_USERNAME`); `resetAdminPassword()` ใช้ `AUTH_RECOVERY_PASSWORD` เพื่อตั้งรหัส admin ใหม่และลบ property รหัสผ่านเมื่อสำเร็จ ดูขั้นตอนในคู่มือติดตั้ง

## ค่าคงที่

| ชื่อ | ค่า | ใช้ทำอะไร |
|---|---|---|
| `SPREADSHEET_ID` | string | ถ้าไม่ว่างจะเปิดสเปรดชีตตาม ID นี้ ถ้าว่างจะใช้สเปรดชีตที่ผูกกับสคริปต์ |
| `WEB_FAVICON_URL` | string | URL รูป PNG/ICO สาธารณะสำหรับไอคอนแท็บเว็บที่เผยแพร่ ถ้าว่างจะใช้ไอคอนเริ่มต้น |
| `MENU_SHEET_NAME` | `_MENU` | ชื่อชีตเก็บโครงสร้างเมนู |
| `MENU_HEADERS` | `id, parent_id, title, sheet_name, icon, sort, note` | หัวตารางของ `_MENU` |
| `DEFAULT_MENU_ROWS` | array | ข้อมูล seed ครั้งแรก |
| `DEFAULT_DATA_HEADERS` | object | หัวข้อคอลัมน์เริ่มต้นของชีต seed (key = ชื่อชีต) |

---

## ฟังก์ชันพื้นฐาน

### `doGet()`
คืนหน้าเว็บจาก `Index.html` ผ่าน `HtmlService` ตั้ง title และ viewport ให้
เมื่อกำหนด `WEB_FAVICON_URL` จะตั้งไอคอนแท็บผ่าน `setFaviconUrl()` ด้วย เพราะ Apps Script ไม่ใช้แท็ก favicon ใน HTML สำหรับแท็บเว็บหลัก

### `getSpreadsheet_()` (ภายใน)
คืน `Spreadsheet` ตาม `SPREADSHEET_ID` หรือสเปรดชีตที่ผูกอยู่ ถ้าหาไม่เจอจะ throw เป็นภาษาไทย

### `getTargetSheet_(sheetName)` (ภายใน)
คืนชีตข้อมูลตามชื่อ ถ้าไม่ได้ระบุชื่อจะใช้ชีตข้อมูลแรก ถ้าระบุชื่อแล้วไม่พบหรือเป็นชีตระบบจะ throw

---

## จัดการชีตและข้อมูล

### `getSheetList() → string[]`
คืนชื่อชีตทั้งหมด **ยกเว้น** ชีตที่ขึ้นต้นด้วย `_`

### `createNewSheet(sheetName, initialHeaders) → object`
สร้างชีตใหม่

| พารามิเตอร์ | ชนิด | คำอธิบาย |
|---|---|---|
| `sheetName` | string | ชื่อชีต (ห้ามว่าง ห้ามซ้ำ ห้ามขึ้นต้นด้วย `_`) |
| `initialHeaders` | string[] | หัวข้อคอลัมน์เริ่มต้น (ใส่ `[]` ได้) |

คืนค่า: `{ status: 'success', sheetName, sheets }` หรือ `{ status: 'error', message }`

### `getSheetData(sheetName) → object`
อ่านข้อมูลทั้งชีต

```js
{
  sheetName: '...',
  headers: ['ปีการศึกษา', '...'],
  rows: [['2568', '...']],
  // ถ้าชื่อชีตที่ระบุไม่มีอยู่จริง:
  missing: true
}
```

### `updateHeaders(sheetName, newHeadersArray) → object`
ล้างแถวหัวตารางเดิม (สูงสุดตามจำนวนคอลัมน์ที่มี) แล้วเขียนหัวข้อใหม่

- ตัดช่องว่างหัวข้อทิ้ง และละเว้นค่าว่าง
- ถ้าไม่มีหัวข้อเหลือ จะคืน `{ status: 'error' }`
- คืนค่า: `{ status: 'success', headers }`

### `addRecord(sheetName, rowArray) → object`
เพิ่ม 1 แถวต่อท้ายชีต คืน `{ status: 'success', addedRow }`

### `updateSingleCell(sheetName, rowIndex, colIndex, newValue) → object`
แก้ 1 เซลล์ (index เริ่มที่ 0 ของข้อมูล ไม่นับแถวหัวตาราง) คืน `{ status: 'success' }`

### `deleteRowByIndex(sheetName, rowIndex) → object`
ลบ 1 แถว (index เริ่มที่ 0 ของข้อมูล) คืน `{ status: 'success' }`

### `importExcelData(sheetName, excelHeaders, excelRows, mode) → object`
นำเข้าข้อมูลจากไฟล์ Excel (ฝั่งเว็บอ่านไฟล์ด้วย SheetJS ก่อนส่งมา)

| พารามิเตอร์ | คำอธิบาย |
|---|---|
| `excelHeaders` | หัวข้อคอลัมน์จากแถวแรกของไฟล์ |
| `excelRows` | ข้อมูลตั้งแต่แถวที่ 2 (array of array) |
| `mode` | `'append'` = ต่อท้าย จับคู่คอลัมน์ตามชื่อ / `'overwrite'` = ล้างชีตแล้วเขียนใหม่ |

พฤติกรรม `append`: คอลัมน์ใหม่ที่ยังไม่มีจะถูกเพิ่มให้, แถวจะถูกจัดเรียงตามหัวข้อคอลัมน์ปัจจุบัน

คืนค่า: `{ status: 'success', count, newCols }`

---

## โครงสร้างเมนู

### `getMenuSheet_() → Sheet` (ภายใน)
คืนชีต `_MENU` ถ้ายังไม่มีจะสร้าง, เขียนหัวตาราง, seed ข้อมูลเริ่มต้น แล้วซ่อนชีต

### `ensureDataSheet_(sheetName, initialHeaders) → Sheet` (ภายใน)
สร้างชีตข้อมูลถ้ายังไม่มี และใส่หัวข้อคอลัมน์เริ่มต้นถ้าระบุไว้

### `getMenuConfig() → object`
อ่านโครงสร้างเมนูสำหรับ frontend

```js
{
  rows: [{ id, parent_id, title, sheet_name, icon, sort, note }],
  sheets: ['ชื่อชีตที่ไม่ใช่ชีตระบบ', ...],
  // ถ้าเกิดข้อผิดพลาด (เช่น ไม่มีสิทธิ์/สร้างชีตไม่ได้):
  error: 'ข้อความ error'
}
```

### `normalizeMenuRows_(rows) → object[]` (ภายใน)
ตรวจสอบและทำความสะอาดข้อมูลเมนูก่อนบันทึก (throw `Error` เมื่อไม่ผ่าน)

ตรวจ:
- `id` และ `title` ต้องไม่ว่าง
- `id` ต้องไม่ซ้ำ
- `parent_id` ต้องมีอยู่จริง
- ไม่มีวงจร parent (guard 100 ระดับ)
- โหนดที่มีลูกต้องไม่มี `sheet_name`
- เติม `icon` เป็น `bi-folder2` และ `sort` เป็นลำดับแถวถ้าไม่ได้ระบุ

### `saveMenuConfig(rows) → object`
บันทึกโครงสร้างเมนูทั้งชุด (เขียนทับชีต `_MENU`)

- สร้างชีตข้อมูลให้ทุก `sheet_name` ที่ยังไม่มี
- คืน `{ status: 'success', rows, sheets }` หรือ `{ status: 'error', message }`

ตัวอย่างการเรียกจากหน้าเว็บ:

```js
authServer()
  .withSuccessHandler(res => { /* res.status, res.rows, res.sheets */ })
  .withFailureHandler(handleScriptError)
  .saveMenuConfig(rows);
```

---

## ข้อควรทราบ

- ฟังก์ชันที่คืน object ต้องเป็นค่าที่ serialize ได้ (string/number/boolean/array/object) — หลีกเลี่ยงการคืน `Date` หรือ object ของ Apps Script
- `getMenuConfig` และ `saveMenuConfig` จับ error ฝั่งเซิร์ฟเวอร์และคืนเป็น `{ status: 'error' }` / `{ error }` เพื่อให้หน้าเว็บแสดงข้อความได้อ่านง่าย
- ฟังก์ชันที่ไม่ได้จับ error (`getSheetData`, `addRecord`, ...) ถ้า throw จะไปเข้า `withFailureHandler` ของหน้าเว็บ
- การเรียก `google.script.run` มี overhead ต่อครั้ง — หน้าจอจึงพยายามอัปเดตเฉพาะส่วนที่เปลี่ยน (เช่น แก้เซลล์เดียว ไม่โหลดตารางใหม่ทั้งตาราง)
