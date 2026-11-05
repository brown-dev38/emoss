const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let cells = [['id', 'parent_id', 'title', 'sheet_name', 'icon', 'sort', 'note', 'dashboard', 'chart_type', 'chart_columns', 'chart_colors'],
  ['1', '', 'Legacy', '', 'bi-folder2', 1, '', 1, 'bar', '', '']];
const menuSheet = {
  getName: () => '_MENU', getLastRow: () => cells.length,
  getLastColumn: () => Math.max(...cells.map(row => row.length)),
  getRange(row, col, height, width) {
    return {
      getDisplayValues: () => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => String(cells[row - 1 + r]?.[col - 1 + c] ?? ''))),
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
const context = { SpreadsheetApp: { openById: () => ({ getSheetByName: () => menuSheet, getSheets: () => [menuSheet] }) } };
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
context.seedMenu_(menuSheet);
assert(cells.slice(1).every(row => row.length === 18), 'Default menu rows match the expanded schema');
console.log('PASS: legacy menu migration, formula save/reload, validation, and new menu seeding');
