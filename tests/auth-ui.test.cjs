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
