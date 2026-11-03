# เอกสารอ้างอิง API (Apps Script)

ฟังก์ชันทั้งหมดอยู่ใน `รหัส.gs` เรียกจากหน้าเว็บด้วย `google.script.run.<ชื่อฟังก์ชัน>(...)`

## ค่าคงที่

| ชื่อ | ค่า | ใช้ทำอะไร |
|---|---|---|
| `SPREADSHEET_ID` | string | ถ้าไม่ว่างจะเปิดสเปรดชีตตาม ID นี้ ถ้าว่างจะใช้สเปรดชีตที่ผูกกับสคริปต์ |
| `MENU_SHEET_NAME` | `_MENU` | ชื่อชีตเก็บโครงสร้างเมนู |
| `MENU_HEADERS` | `id, parent_id, title, sheet_name, icon, sort, note` | หัวตารางของ `_MENU` |
| `DEFAULT_MENU_ROWS` | array | ข้อมูล seed ครั้งแรก |
| `DEFAULT_DATA_HEADERS` | object | หัวข้อคอลัมน์เริ่มต้นของชีต seed (key = ชื่อชีต) |

---

## ฟังก์ชันพื้นฐาน

### `doGet()`
คืนหน้าเว็บจาก `Index.html` ผ่าน `HtmlService` ตั้ง title และ viewport ให้

### `getSpreadsheet()`
คืน `Spreadsheet` ตาม `SPREADSHEET_ID` หรือสเปรดชีตที่ผูกอยู่ ถ้าหาไม่เจอจะ throw เป็นภาษาไทย

### `getTargetSheet(sheetName)`
คืนชีตตามชื่อ ถ้าไม่พบจะคืนชีตแรกของสเปรดชีต (fallback)

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

### `getMenuSheet() → Sheet` (ภายใน)
คืนชีต `_MENU` ถ้ายังไม่มีจะสร้าง, เขียนหัวตาราง, seed ข้อมูลเริ่มต้น แล้วซ่อนชีต

### `ensureDataSheet(sheetName, initialHeaders) → Sheet` (ภายใน)
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

### `normalizeMenuRows(rows) → object[]` (ภายใน)
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
google.script.run
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
