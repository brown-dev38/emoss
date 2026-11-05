const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.trim());
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique');
function classes() {
  const set = new Set();
  return { add: x => set.add(x), remove: x => set.delete(x), contains: x => set.has(x),
    toggle(x, force = !set.has(x)) { force ? set.add(x) : set.delete(x); return force; } };
}
function element() {
  return { classList: classes(), style: {}, dataset: {}, attributes: {}, value: '', innerHTML: '', textContent: '',
    setAttribute(k, v) { this.attributes[k] = v; }, contains: () => false,
    focus() {}, reset() {}, addEventListener() {}, getAttribute(k) { return this.attributes[k] || null; },
    getBoundingClientRect: () => ({ top: 100, right: 88 }), offsetHeight: 200,
    closest() { return { classList: classes() }; } };
}
const elements = new Map(ids.map(id => [id, element()]));
elements.get('dashboardView').style.display = 'block';
const body = element();
const initialBodyClasses = html.match(/<body\b[^>]*class="([^"]+)"/)[1].split(/\s+/);
initialBodyClasses.forEach(name => body.classList.add(name));
assert(body.classList.contains('auth-checking'), 'First paint must wait for session restoration');
const storage = new Map();
const calls = [];
function runner(success, failure) {
  return new Proxy({}, { get(_, name) {
    if (name === 'withSuccessHandler') return cb => runner(cb, failure);
    if (name === 'withFailureHandler') return cb => runner(success, cb);
    return (...args) => { calls.push({ name, args, success, failure }); };
  }});
}
const context = {
  document: {
    body, getElementById(id) { assert(elements.has(id), `Missing HTML element ${id}`); return elements.get(id); },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
    createElement: () => ({ textContent: '', get innerHTML() {
      return String(this.textContent).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    } })
  },
  window: { innerHeight: 800, innerWidth: 1280, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
  google: { script: { run: runner() } },
  sessionStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
  setTimeout: () => 1, clearTimeout() {}, console
};
vm.createContext(context);
for (const script of scripts) vm.runInContext(script, context);
context.window.onload();
assert(body.classList.contains('auth-locked'));
assert.equal(body.classList.contains('auth-checking'), false, 'No stored session should show the login form');
assert.equal(calls.length, 0, 'Logged-out startup must not request data');
assert(elements.get('loginLogo').src.startsWith('data:image/png'));
assert.equal(elements.get('appFavicon').href, elements.get('loginLogo').src);

function login(role, token = 'test-token') {
  context.acceptSession(token, { username: role, name: role, role }, Date.now() + 60000);
}
login('user');
assert.equal(body.dataset.role, 'user');
assert.equal(body.classList.contains('auth-locked'), false);
assert.equal(calls.at(-1).name, 'getMenuConfig');
assert.equal(calls.at(-1).args[0], 'test-token');
assert.equal(elements.get('modeOverwrite').disabled, true);
context.switchPage('configView');
context.switchPage('usersView');
context.switchPage('dataView');
assert.equal(elements.get('configView').style.display, 'none');
assert.equal(elements.get('usersView').style.display, 'none');
assert.equal(elements.get('dataView').style.display, 'none');

let staleReplyRendered = false;
context.authServer().withSuccessHandler(() => { staleReplyRendered = true; }).withFailureHandler(() => {}).getSheetData('Data');
const oldRequest = calls.at(-1);
context.signOut();
assert(body.classList.contains('auth-locked'));
assert.equal(storage.has('emossSession'), false);
assert.equal(calls.at(-1).name, 'logout');
login('employee', 'employee-token');
oldRequest.success({ rows: [['private data']] });
assert.equal(staleReplyRendered, false, 'Replies from a previous account must be discarded');
context.switchPage('dataView');
assert.equal(elements.get('dataView').style.display, 'block');
context.switchPage('usersView');
assert.equal(elements.get('usersView').style.display, 'none');
assert.equal(elements.get('modeOverwrite').disabled, true);
context.authServer().withFailureHandler(() => assert.fail('Expired sessions must go to Login')).getSheetData('Data');
calls.at(-1).failure(new Error('AUTH_REQUIRED: expired'));
assert(body.classList.contains('auth-locked'));

login('admin', 'admin-token');
assert.equal(elements.get('modeOverwrite').disabled, false);
context.openUsersPage();
assert.equal(elements.get('usersView').style.display, 'block');
assert.equal(calls.at(-1).name, 'listUsers');
assert.equal(calls.at(-1).args[0], 'admin-token');
calls.at(-1).success([
  { username: 'employee', email: 'employee@example.com', name: 'Employee', role: 'employee', active: false },
  { username: 'admin', name: 'Admin', role: 'admin', active: true }
]);
context.editAccount(0);
assert.equal(elements.get('accountUsername').readOnly, false);
assert.equal(elements.get('accountUsername').value, 'employee');
assert.equal(elements.get('accountEmail').value, 'employee@example.com');
assert.equal(elements.get('accountPassword').required, false);
elements.get('accountPassword').value = 'changed-password';
context.resetAccountForm();
for (const id of ['accountUsername', 'accountName', 'accountEmail', 'accountPassword']) assert.equal(elements.get(id).value, '');
assert.equal(elements.get('accountRole').value, 'user');
assert.equal(elements.get('accountActive').checked, true);
assert.equal(elements.get('accountPassword').required, true);
elements.get('accountUsername').value = 'new-account';
elements.get('accountName').value = 'New';
elements.get('accountEmail').value = 'new@example.com';
elements.get('accountPassword').value = 'abc123';
context.submitUserAccount({ preventDefault() {} });
assert.equal(calls.at(-1).name, 'saveUser');
assert.equal(calls.at(-1).args[0].isNew, true);
assert.equal(calls.at(-1).args[0].originalUsername, '');
assert.equal(calls.at(-1).args[0].email, 'new@example.com');
assert.equal(elements.get('accountFields').disabled, true);
calls.at(-1).failure(new Error('Test server failure'));
assert.equal(elements.get('accountFields').disabled, false);
context.editAccount(0);
elements.get('accountUsername').value = 'renamed-employee';
context.submitUserAccount({ preventDefault() {} });
assert.equal(calls.at(-1).args[0].originalUsername, 'employee');
assert.equal(calls.at(-1).args[0].username, 'renamed-employee');
assert.equal(calls.at(-1).args[0].isNew, false);
calls.at(-1).failure(new Error('Test server failure'));
context.editAccount(1);
elements.get('accountUsername').value = 'renamed-admin';
context.submitUserAccount({ preventDefault() {} });
calls.at(-1).success({ username: 'renamed-admin', role: 'admin', active: true });
assert(body.classList.contains('auth-locked'), 'Renaming the signed-in account must require login again');
assert.equal(calls.at(-1).name, 'logout');
console.log('PASS: editable username, new-account form reset, correct save modes, self-rename logout');
context.showLogin();
assert.equal(elements.get('accountsTable').innerHTML, '');
assert.equal(elements.get('docSheet').innerHTML, '');
assert.equal(elements.get('dashboardCharts').innerHTML, '');
assert.equal(elements.get('accountSubmit').disabled, false);
console.log('PASS: login startup, role navigation, RPC tokens, stale callbacks, logout cleanup, expired sessions, admin UI');

storage.set('emossSession', JSON.stringify({ token: 'restored-token', expiresAt: Date.now() + 60000 }));
context.restoreLogin();
assert(body.classList.contains('auth-checking'), 'Hide the login form while checking a stored session');
assert(body.classList.contains('auth-locked'), 'Do not reveal protected content before verification');
const restoration = calls.at(-1);
assert.equal(restoration.name, 'getCurrentUser');
assert.equal(restoration.args[0], 'restored-token');
restoration.success({ username: 'reader', name: 'Reader', role: 'user' });
assert.equal(body.classList.contains('auth-checking'), false);
assert.equal(body.classList.contains('auth-locked'), false, 'Valid restored session opens the app directly');
context.restoreLogin();
calls.at(-1).failure(new Error('expired'));
assert.equal(body.classList.contains('auth-checking'), false);
assert(body.classList.contains('auth-locked'), 'Invalid session returns to the login form');
assert.equal(storage.has('emossSession'), false);
console.log('PASS: refresh loading state, successful restoration, and expired-session login fallback');

const menu = [{ id: 'root', title: 'Root', parent_id: '', sheet_name: '', children: [
  { id: 'folder', title: 'Folder', parent_id: 'root', sheet_name: '', children: [
    { id: 'leaf', title: 'Leaf', parent_id: 'folder', sheet_name: 'Data', children: [] }
  ] }
]}];
vm.runInContext(`menuTree = ${JSON.stringify(menu)}; menuRows = [menuTree[0], menuTree[0].children[0], menuTree[0].children[0].children[0]];`, context);
login('user');
context.toggleSidebar(false);
const rootButton = element();
rootButton.setAttribute('data-id', 'root');
rootButton.classList.add('expanded');
rootButton.closest = () => null;
context.onCompactMenuHover({ pointerType: 'mouse' }, rootButton);
const flyout = elements.get('compactMenu');
assert.equal(flyout.style.display, 'block');
assert(flyout.innerHTML.includes('data-id="folder"'));
assert(flyout.innerHTML.includes('data-id="leaf"'));
assert.equal(flyout.style.left, '92px');
assert.equal(rootButton.attributes['aria-expanded'], 'true');
assert(html.includes('body.sidebar-compact .sidebar .menu-children'), 'Nested icons must be hidden in the compact sidebar');
context.onMenuClick(rootButton);
assert.equal(flyout.style.display, 'block', 'Tapping a compact parent opens its flyout');
context.toggleSidebar(true);
assert.equal(flyout.style.display, 'none', 'Expanding the sidebar closes the flyout');
context.onCompactMenuHover({ pointerType: 'mouse' }, rootButton);
assert.equal(flyout.style.display, 'none', 'Expanded sidebar uses inline submenus');
context.toggleSidebar(false);
context.onCompactMenuHover({ pointerType: 'mouse' }, rootButton);
const nestedGroup = element();
nestedGroup.setAttribute('data-parent', 'folder');
nestedGroup.classList.add('open');
flyout.querySelectorAll = () => [nestedGroup];
const folderButton = element();
folderButton.setAttribute('data-id', 'folder');
folderButton.classList.add('expanded');
folderButton.closest = () => flyout;
context.onMenuClick(folderButton);
assert.equal(nestedGroup.classList.contains('open'), false);
context.onMenuClick(folderButton);
assert.equal(nestedGroup.classList.contains('open'), true);
const leafButton = element();
leafButton.setAttribute('data-id', 'leaf');
leafButton.closest = () => flyout;
context.onMenuClick(leafButton);
assert.equal(calls.at(-1).name, 'getSheetData');
assert.equal(calls.at(-1).args[0], 'Data');
assert.equal(flyout.style.display, 'none', 'Selecting a submenu closes the flyout and opens its document');
context.onCompactMenuHover({ pointerType: 'mouse' }, rootButton);
context.showLogin();
assert.equal(flyout.style.display, 'none');
assert.equal(flyout.innerHTML, '');
console.log('PASS: compact root hover/tap flyout, nested menu labels, and expansion/logout cleanup');

login('admin');
vm.runInContext(`
  currentHeaders = ['Name', 'Value'];
  currentRows = Array.from({ length: 61 }, (_, i) => ['Record ' + (i + 1), i]);
  tablePage = 1;
  tablePageSize = 25;
  renderTable(currentHeaders, currentRows);
`, context);
const tableBody = elements.get('tableBody');
assert.equal((tableBody.innerHTML.match(/data-col="0"/g) || []).length, 25);
assert.equal(elements.get('tablePrevPage').disabled, true);
context.changeTablePage(1);
assert(tableBody.innerHTML.includes('data-row="25"'));
assert(tableBody.innerHTML.includes('handleDeleteRow(25)'));
assert(!tableBody.innerHTML.includes('data-row="0"'));
context.changeTablePage(1);
assert.equal((tableBody.innerHTML.match(/data-col="0"/g) || []).length, 11);
assert.equal(elements.get('tableNextPage').disabled, true);
elements.get('searchInput').value = 'Record 60';
context.filterTable();
assert(tableBody.innerHTML.includes('data-row="59"'));
assert(tableBody.innerHTML.includes('handleDeleteRow(59)'));
assert.equal((tableBody.innerHTML.match(/data-col="0"/g) || []).length, 1);
assert.equal(elements.get('tablePageNumber').textContent, 'หน้า 1 / 1');
elements.get('searchInput').value = 'missing';
context.filterTable();
assert(tableBody.innerHTML.includes('ไม่พบข้อมูลที่ค้นหา'));
elements.get('searchInput').value = '';
context.filterTable();
context.changeTablePageSize('50');
assert.equal((tableBody.innerHTML.match(/data-col="0"/g) || []).length, 50);
context.changeTablePage(1);
vm.runInContext('currentRows.splice(50); renderTable(currentHeaders, currentRows);', context);
assert.equal(elements.get('tablePageNumber').textContent, 'หน้า 1 / 1', 'Deleting the last page must clamp to an existing page');
vm.runInContext("currentRows.push(['New record', 50]); highlightLastRow = true; renderTable(currentHeaders, currentRows);", context);
assert.equal(elements.get('tablePageNumber').textContent, 'หน้า 2 / 2');
assert(tableBody.innerHTML.includes('highlight-new'));
context.showLogin();
assert.equal(elements.get('tablePageInfo').textContent, 'ไม่มีข้อมูล');
console.log('PASS: pagination, cross-page search, original row actions, page size, deletion, new row, logout cleanup');

const plotted = [];
context.Chart = function (_, config) { plotted.push(config); this.destroy = () => {}; };
elements.set('percentChart', { getContext: () => ({}) });
elements.set('percentChart_badge', element());
elements.set('percentChart_info', element());
const percentNode = { chart_type: 'bar', chart_value_mode: 'percent', chart_numerator: 'Actual', chart_denominator: 'Target' };
const chartData = { headers: ['Year', 'Actual', 'Target'], rows: [
  ['2025', '80', '100'], ['2026', '0', '100'], ['2027', '10', '0'],
  ['2028', '', '100'], ['2029', 'invalid', '100'], ['2030', '150', '100'], ['รวม', '240', '500']
] };
context.drawDashboardChart('percentChart', percentNode, chartData);
let plot = plotted.at(-1);
assert.deepEqual(Array.from(plot.data.datasets[0].data), [80, 0, null, null, null, 150]);
assert.equal(plot.options.plugins.datalabels.formatter(80), '80%');
assert.equal(plot.options.plugins.datalabels.formatter(null), '');
assert.equal(plot.options.scales.y.ticks.callback(50), '50%');
assert(plot.options.plugins.tooltip.callbacks.label({ dataset: plot.data.datasets[0], raw: 80 }).endsWith('80%'));
assert.equal(context.dashboardPercentage('1,000', '2,000'), 50);
assert(Math.abs(context.dashboardPercentage('1', '3') - 100 / 3) < 1e-12);
assert.equal(context.dashboardPercentage('Infinity', '1'), null);
assert.equal(context.dashboardPercentage('1', ''), null);
context.drawDashboardChart('percentChart', { ...percentNode, chart_type: 'line' }, chartData);
assert.equal(plotted.at(-1).type, 'line');
const plotCount = plotted.length;
context.drawDashboardChart('percentChart', { ...percentNode, chart_denominator: 'Missing' }, chartData);
assert.equal(plotted.length, plotCount);
assert(elements.get('percentChart_info').textContent.includes('ไม่พบคอลัมน์'));
context.drawDashboardChart('percentChart', { chart_type: 'bar', chart_columns: 'Actual' }, chartData);
assert.equal(plotted.at(-1).data.datasets[0].data[0], 80, 'Legacy charts keep raw values');
context.renderPercentageColumnOptions(chartData.headers, percentNode);
const formulaEditor = elements.get('editorPercentageFormulas');
assert(formulaEditor.innerHTML.includes('value="Actual" selected'));
assert(formulaEditor.innerHTML.includes('value="Target" selected'));
assert(!formulaEditor.innerHTML.includes('value="Year"'));
console.log('PASS: percentage chart values, labels, missing/zero/invalid values, column selectors, and legacy charts');

context.drawDashboardChart('percentChart', { ...percentNode, chart_type: 'horizontal_bar' }, chartData);
plot = plotted.at(-1);
assert.equal(plot.type, 'bar');
assert.equal(plot.options.indexAxis, 'y');
assert.equal(plot.options.scales.x.beginAtZero, true);
assert.equal(plot.options.scales.x.ticks.callback(80), '80%');
assert.equal(plot.options.scales.y.ticks.maxRotation, 0);
assert.deepEqual(Array.from(plot.data.datasets[0].data), [80, 0, null, null, null, 150]);
assert.equal(elements.get('percentChart_info').textContent, '', 'Successful charts show no formula details below them');
context.drawDashboardChart('percentChart', { chart_type: 'horizontal_bar', chart_columns: 'Actual,Target' }, chartData);
plot = plotted.at(-1);
assert.equal(plot.options.indexAxis, 'y');
assert.equal(plot.data.datasets.length, 2);
assert.equal(plot.data.datasets[1].data[0], 100);
assert.equal(plot.options.scales.x.ticks, undefined, 'Raw values should not receive percentage ticks');
context.drawDashboardChart('percentChart', percentNode, chartData);
assert.equal(plotted.at(-1).options.indexAxis, 'x', 'Vertical bars keep their original orientation');
assert(html.includes('value="horizontal_bar"'), 'The menu editor must offer horizontal bars');
console.log('PASS: horizontal bar configuration, numeric/percentage axes, multiple series, and vertical compatibility');

const multiNode = { ...percentNode, chart_type: 'horizontal_bar', chart_formulas: [
  { label: 'Actual rate', numerator: 'Actual', denominator: 'Target', color: '#123456' },
  { label: 'Other rate', numerator: 'Other', denominator: 'Other target', color: '#654321' }
] };
const multiData = { headers: ['Year', 'Actual', 'Target', 'Other', 'Other target'], rows: [
  ['2025', '80', '100', '20', '40'], ['2026', '50', '100', '10', '0']
] };
context.drawDashboardChart('percentChart', multiNode, multiData);
plot = plotted.at(-1);
assert.equal(plot.data.datasets.length, 2);
assert.deepEqual(Array.from(plot.data.datasets[0].data), [80, 50]);
assert.deepEqual(Array.from(plot.data.datasets[1].data), [50, null]);
assert.equal(plot.data.datasets[1].label, 'Other rate');
assert.equal(plot.data.datasets[1].backgroundColor, '#654321');
assert.equal(plot.options.plugins.legend.display, true);
context.drawDashboardChart('percentChart', { ...multiNode, chart_type: 'bar' }, multiData);
assert.equal(plotted.at(-1).options.indexAxis, 'x');
assert.equal(plotted.at(-1).data.datasets.length, 2);
context.drawDashboardChart('percentChart', { ...multiNode, chart_type: 'line' }, multiData);
assert.equal(plotted.at(-1).data.datasets.length, 2);
vm.runInContext(`configRows = [{ sheet_name: 'Rates', chart_numerator: 'Actual', chart_denominator: 'Target' }]; configSelectedIdx = 0; sheetHeaderCache.Rates = ['Year', 'Actual', 'Target', 'Other'];`, context);
context.addPercentageFormula();
context.updatePercentageFormula(1, 'numerator', 'Other');
context.updatePercentageFormula(1, 'denominator', 'Target');
context.updatePercentageFormula(1, 'label', '<Other>');
context.renderPercentageColumnOptions(multiData.headers, vm.runInContext('configRows[0]', context));
assert(formulaEditor.innerHTML.includes('&lt;Other&gt;'));
assert(formulaEditor.innerHTML.includes('formulaNumerator1'));
context.removePercentageFormula(0);
assert.equal(vm.runInContext('configRows[0].chart_numerator', context), 'Other');
context.removePercentageFormula(0);
assert.equal(vm.runInContext('configRows[0].chart_formulas.length', context), 1);
console.log('PASS: independent formulas, per-series labels/colors, zero denominators, add/edit/remove, and legacy formula upgrade');

const categoryData = { headers: ['Year', 'Course', 'Actual', 'Target'], rows: [
  ['2025', 'MD', '80', '100'], ['2026', 'PMD', '50', '100'], ['รวม', '', '130', '200']
] };
const categoryNode = { chart_type: 'horizontal_bar', chart_columns: 'Actual', chart_label_template: '{Year} - {Course}', chart_axis_title: 'Year / Course' };
context.drawDashboardChart('percentChart', categoryNode, categoryData);
plot = plotted.at(-1);
assert.deepEqual(Array.from(plot.data.labels), ['2025 - MD', '2026 - PMD']);
assert.equal(plot.options.scales.y.title.text, 'Year / Course');
assert.equal(plot.options.scales.y.title.display, true);
assert.equal(elements.get('percentChart_info').textContent, '');
context.drawDashboardChart('percentChart', { ...categoryNode, chart_type: 'bar', chart_custom_labels: 'Custom\r\n' }, categoryData);
plot = plotted.at(-1);
assert.deepEqual(Array.from(plot.data.labels), ['Custom', '2026 - PMD']);
assert.equal(plot.options.scales.x.title.text, 'Year / Course');
assert.deepEqual(Array.from(context.dashboardCategoryLabels({}, categoryData.headers, categoryData.rows.slice(0, 2))), ['2025', '2026']);
assert.deepEqual(Array.from(context.dashboardCategoryLabels({ chart_label_template: 'New registration {Year}' }, categoryData.headers, categoryData.rows.slice(0, 2))), ['New registration 2025', 'New registration 2026']);
context.renderChartLabelColumns(categoryData.headers);
assert(elements.get('editorLabelColumn').innerHTML.includes('value="Year"'));
elements.get('editorLabelTemplate').value = '{Year}';
elements.get('editorLabelColumn').value = 'Course';
context.appendChartLabelColumn();
assert.equal(vm.runInContext('configRows[0].chart_label_template', context), '{Year} - {Course}');
context.drawDashboardChart('percentChart', { ...percentNode, chart_denominator: 'Missing' }, chartData);
assert(elements.get('percentChart_info').textContent.includes('ไม่พบคอลัมน์'));
context.drawDashboardChart('percentChart', percentNode, chartData);
assert.equal(elements.get('percentChart_info').textContent, '', 'Successful redraw clears earlier errors and never adds formula details');
console.log('PASS: category label templates, joined columns, custom row names, axis titles, legacy labels, and clean chart footers');
