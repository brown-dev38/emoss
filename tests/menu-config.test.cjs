const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let cells = [['id', 'parent_id', 'title', 'sheet_name', 'icon', 'sort', 'note', 'dashboard', 'chart_type', 'chart_columns', 'chart_colors'],
  ['1', '', 'Legacy', '', 'bi-folder2', 1, '', 1, 'bar', '', '']];
const formats = new Map();
let simulateNumericFormatting = false;
let flushCount = 0;
const menuSheet = {
  getName: () => '_MENU', getLastRow: () => cells.length,
  getLastColumn: () => Math.max(...cells.map(row => row.length)),
  getRange(row, col, height, width) {
    return {
      getDisplayValues: () => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => {
        const value = cells[row - 1 + r]?.[col - 1 + c] ?? '';
        if (simulateNumericFormatting && formats.get(`${row + r}:${col + c}`) !== '@' && /^\d+(\.\d+)?$/.test(String(value))) {
          return Number(value).toFixed(2);
        }
        return String(value);
      })),
      setNumberFormat(format) {
        for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) formats.set(`${row + r}:${col + c}`, format);
        return this;
      },
      setValues(values) {
        assert.equal(values.length, height);
        values.forEach((valuesRow, r) => {
          assert.equal(valuesRow.length, width, 'Sheet writes must match the configured schema width');
          cells[row - 1 + r] ||= [];
          valuesRow.forEach((value, c) => { cells[row - 1 + r][col - 1 + c] = value; });
        });
      },
      clearContent() { for (let r = 0; r < height; r++) cells[row - 1 + r] = Array(width).fill(''); }
    };
  }
};
const context = { SpreadsheetApp: { openById: () => ({ getSheetByName: () => menuSheet, getSheets: () => [menuSheet] }), flush: () => { flushCount++; } } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'รหัส.gs'), 'utf8'), context);
// Authentication is covered separately; isolate configuration persistence here.
context.requireRole_ = () => ({ role: 'admin' });
const legacy = context.getMenuConfig('token');
assert.equal(legacy.rows[0].chart_value_mode, 'number');
assert.equal(cells[0].length, 18, 'Existing menu sheets gain chart label fields');
const percent = { ...legacy.rows[0], chart_value_mode: 'percent', chart_numerator: ' Actual ', chart_denominator: ' Target ' };
const saved = context.saveMenuConfig([percent], 'token');
assert.equal(saved.status, 'success');
const restored = context.getMenuConfig('token').rows[0];
assert.equal(restored.chart_numerator, 'Actual');
assert.equal(restored.chart_denominator, 'Target');
assert.equal(restored.chart_value_mode, 'percent');
assert.throws(() => context.normalizeMenuRows_([{ ...percent, chart_denominator: '' }]), /ตัวตั้งและตัวหาร/);
assert.throws(() => context.normalizeMenuRows_([{ ...percent, chart_type: 'pie' }]), /กราฟแท่งหรือกราฟเส้น/);
assert.equal(context.normalizeMenuRows_([{ ...percent, chart_type: 'line' }])[0].chart_type, 'line');
assert.equal(context.saveMenuConfig([{ ...percent, chart_type: 'horizontal_bar' }], 'token').status, 'success');
assert.equal(context.getMenuConfig('token').rows[0].chart_type, 'horizontal_bar');
const multiple = { ...percent, chart_type: 'horizontal_bar', chart_formulas: [
  { label: 'First', numerator: 'Actual', denominator: 'Target', color: '#123456' },
  { label: 'Second', numerator: 'Other', denominator: 'Other target', color: '#654321' }
] };
assert.equal(context.saveMenuConfig([multiple], 'token').status, 'success');
assert.deepEqual(JSON.parse(JSON.stringify(context.getMenuConfig('token').rows[0].chart_formulas)), multiple.chart_formulas);
assert.throws(() => context.normalizeMenuRows_([{ ...multiple, chart_formulas: [{ numerator: 'Actual', denominator: '' }] }]), /ทุกสูตร/);
assert.throws(() => context.normalizeMenuRows_([{ ...multiple, chart_formulas: 'invalid' }]), /รูปแบบสูตร/);
const labeled = { ...multiple, chart_label_template: '{Year} - {Course}', chart_custom_labels: 'Custom\n\nAnother', chart_axis_title: 'Academic year / Course' };
assert.equal(context.saveMenuConfig([labeled], 'token').status, 'success');
const labelsRestored = context.getMenuConfig('token').rows[0];
for (const field of ['chart_label_template', 'chart_custom_labels', 'chart_axis_title']) assert.equal(labelsRestored[field], labeled[field]);
const average = { ...labeled, chart_value_mode: 'average' };
assert.equal(context.saveMenuConfig([average], 'token').status, 'success');
const averageRestored = context.getMenuConfig('token').rows[0];
assert.equal(averageRestored.chart_value_mode, 'average');
assert.deepEqual(JSON.parse(JSON.stringify(averageRestored.chart_formulas)), multiple.chart_formulas);
assert.throws(() => context.normalizeMenuRows_([{ ...average, chart_formulas: [{ numerator: 'Actual', denominator: '' }] }]), /ทุกสูตร/);
for (const chart_type of ['pie', 'doughnut']) {
  assert.throws(() => context.normalizeMenuRows_([{ ...average, chart_type }]), /ค่าเฉลี่ยรองรับเฉพาะกราฟแท่งหรือกราฟเส้น/);
}
const legacyAverage = { ...percent, chart_value_mode: 'average' };
assert.equal(context.saveMenuConfig([legacyAverage], 'token').status, 'success');
assert.equal(context.getMenuConfig('token').rows[0].chart_formulas[0].denominator, 'Target');
// Existing numeric cell formats must not alter configuration after refresh.
formats.clear();
simulateNumericFormatting = true;
const numericNames = [
  { id: '1', title: 'Parent' },
  { id: '1.10', parent_id: '1', title: 'Child', dashboard: 1, chart_columns: '2568', chart_label_template: '001', chart_axis_title: '2569' },
  { id: '001', title: 'Leading zero', chart_value_mode: 'average', chart_numerator: '2568', chart_denominator: '2569' }
];
const numericSaved = context.saveMenuConfig(numericNames, 'token');
assert.equal(numericSaved.status, 'success');
const numericReloaded = context.getMenuConfig('token');
assert.deepEqual(JSON.parse(JSON.stringify(numericSaved.rows)), JSON.parse(JSON.stringify(numericReloaded.rows)));
assert.equal(numericReloaded.rows[1].id, '1.10');
assert.equal(numericReloaded.rows[1].parent_id, '1');
assert.equal(numericReloaded.rows[1].chart_columns, '2568');
assert.equal(numericReloaded.rows[1].dashboard, 1);
assert.equal(numericReloaded.rows[1].chart_label_template, '001');
assert.equal(numericReloaded.rows[1].chart_axis_title, '2569');
assert.equal(numericReloaded.rows[2].id, '001');
assert.equal(numericReloaded.rows[2].chart_numerator, '2568');
assert.equal(numericReloaded.rows[2].chart_denominator, '2569');
assert(flushCount > 0, 'Flush sheet changes before reading the saved configuration');
simulateNumericFormatting = false;
context.seedMenu_(menuSheet);
assert(cells.slice(1).every(row => row.length === 18), 'Default menu rows match the expanded schema');
console.log('PASS: legacy menu migration, formula save/reload, validation, and new menu seeding');
