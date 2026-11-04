const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'รหัส.gs'), 'utf8');
let now = Date.now();
let activeGoogleEmail = '';
class Clock extends Date { static now() { return now; } }
const properties = new Map();
const cache = new Map();
const store = {
  getProperty: k => properties.get(k) ?? null,
  setProperty(k, v) { properties.set(k, v); return this; },
  deleteProperty(k) { properties.delete(k); return this; },
  getProperties: () => Object.fromEntries(properties)
};
let writes = 0;
const sheet = {
  getName: () => 'Data', getLastRow: () => 2, getLastColumn: () => 2,
  getDataRange: () => ({ getDisplayValues: () => [['Name', 'Count'], ['Example', '1']] }),
  getRange: () => ({ getValues: () => [['Name', 'Count']], setValue() { writes++; }, setValues() { writes++; }, clearContent() { writes++; } }),
  appendRow() { writes++; }, deleteRow() { writes++; }, clearContents() { writes++; }
};
const spreadsheet = { getSheets: () => [sheet], getSheetByName: name => name === 'Data' ? sheet : null };
const context = {
  Date: Clock,
  console: { log() {} },
  Session: { getActiveUser: () => ({ getEmail: () => activeGoogleEmail }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, value) => [...crypto.createHash(alg).update(value).digest()],
    getUuid: () => crypto.randomUUID(), newBlob: value => ({ getBytes: () => [...Buffer.from(value, 'utf8')] })
  },
  PropertiesService: { getScriptProperties: () => store },
  CacheService: { getScriptCache: () => ({
    put: (k, value, ttl) => cache.set(k, { value, until: now + ttl * 1000 }),
    get: k => cache.get(k)?.until > now ? cache.get(k).value : null,
    remove: k => cache.delete(k)
  }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  SpreadsheetApp: { openById: () => spreadsheet }
};
vm.createContext(context);
vm.runInContext(code, context);

assert.throws(() => context.authPassword_('abc12'));
assert.doesNotThrow(() => context.authPassword_('abc123'));
assert.doesNotThrow(() => context.authPassword_('a'.repeat(128)));
assert.throws(() => context.authPassword_('a'.repeat(129)));

// Cross-check the Apps Script implementation against Node's native cryptography,
// including UTF-8, HMAC long keys, salt padding boundaries, and production work factor.
for (const [password, salt, iterations] of [
  ['password', 'salt', 1], ['password', 'salt', 2], ['password', 'salt', 4096],
  ['รหัสผ่าน🔒'.repeat(10), 's'.repeat(72), 3], ['a'.repeat(64), '', 2],
  ['production-password', 'random-salt', 600000]
]) {
  assert.equal(context.authPbkdf2_(password, salt, iterations),
    crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex'));
}
console.log('PASS: PBKDF2 matches native crypto, including 600,000 iterations');

function account(username, role, active = true) {
  const salt = crypto.randomUUID();
  const password = 'long-test-password';
  const user = { username, role, name: username, active, version: crypto.randomUUID(), credential: {
    salt, iterations: 600000, hash: crypto.pbkdf2Sync(password, salt, 600000, 32, 'sha256').toString('hex')
  }};
  store.setProperty(context.authUserKey_(username), JSON.stringify(user));
  return user;
}
function session(user) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  context.CacheService.getScriptCache().put('AUTH_SESSION_' + context.authDigest_(token), JSON.stringify({
    username: user.username, version: user.version, expiresAt: now + 21600000
  }), 21600);
  return token;
}
const admin = account('admin', 'admin');
const employee = account('employee', 'employee');
const user = account('reader', 'user');
const adminToken = session(admin), employeeToken = session(employee), userToken = session(user);

const calls = [
  ['getSheetList', []], ['getSheetData', ['Data']], ['getMenuConfig', []],
  ['createNewSheet', ['Other', ['Name']]], ['updateHeaders', ['Data', ['Name']]],
  ['addRecord', ['Data', ['Added', 2]]], ['updateSingleCell', ['Data', 0, 1, 2]],
  ['deleteRowByIndex', ['Data', 0]], ['importExcelData', ['Data', ['Name', 'Count'], [['Imported', 3]], 'append']],
  ['saveMenuConfig', [[]]], ['listUsers', []], ['saveUser', [{}]]
];
for (const [name, args] of calls) assert.throws(() => context[name](...args), /AUTH_REQUIRED/);
for (const [name, args] of calls.slice(3)) assert.throws(() => context[name](...args, userToken), /FORBIDDEN/);
for (const [name, args] of calls.filter(([name]) => ['createNewSheet', 'updateHeaders', 'deleteRowByIndex', 'saveMenuConfig', 'listUsers', 'saveUser'].includes(name))) {
  assert.throws(() => context[name](...args, employeeToken), /FORBIDDEN/);
}
assert.equal(writes, 0);
for (const token of [adminToken, employeeToken, userToken]) {
  assert.equal(context.getSheetData('Data', token).rows.length, 1);
  assert.throws(() => context.getSheetData('_USERS', token), /FORBIDDEN/);
  assert.throws(() => context.getSheetData(' _MENU ', token), /FORBIDDEN/);
}
context.addRecord('Data', ['Added', 2], employeeToken);
context.updateSingleCell('Data', 0, 1, 2, employeeToken);
context.importExcelData('Data', ['Name', 'Count'], [['Imported', 3]], 'append', employeeToken);
assert.equal(writes, 3);
assert.throws(() => context.importExcelData('Data', ['Name'], [], 'overwrite', employeeToken), /FORBIDDEN/);
assert.throws(() => context.importExcelData('Data', ['New column'], [], 'append', employeeToken), /FORBIDDEN/);
assert.throws(() => context.updateSingleCell('Data', -1, 0, 'Bad', employeeToken));
assert.throws(() => context.addRecord('_MENU', ['Bad'], employeeToken), /FORBIDDEN/);
assert.throws(() => context.addRecord('Data', ['Too', 'many', 'columns'], employeeToken));
assert.equal(writes, 3);
assert.throws(() => context.saveUser({ username: 'admin', name: 'Admin', role: 'user', active: true }, adminToken));
assert.throws(() => context.saveUser({ username: 'admin', name: 'Admin', role: 'admin', active: false }, adminToken));
assert(context.listUsers(adminToken).every(u => !u.credential && !u.version));
console.log('PASS: all RPC guards, role permissions, system sheet protection, last-admin protection');

const renameTarget = account('rename-target', 'employee');
const beforeRename = session(renameTarget);
const renamed = context.saveUser({ originalUsername: 'rename-target', username: 'renamed-user', name: 'Renamed user', role: 'employee', active: true, isNew: false }, adminToken);
assert.equal(renamed.username, 'renamed-user');
assert.equal(context.authReadUser_('rename-target'), null);
assert.equal(context.authReadUser_('renamed-user').credential.hash, renameTarget.credential.hash);
assert.throws(() => context.getCurrentUser(beforeRename), /AUTH_REQUIRED/);
assert.throws(() => context.saveUser({ originalUsername: 'renamed-user', username: 'reader', name: 'Conflict', role: 'employee', active: true }, adminToken));
assert.equal(context.authReadUser_('renamed-user').name, 'Renamed user');
assert.equal(context.authReadUser_('reader').role, 'user');
assert.equal(context.login('renamed-user', 'long-test-password').user.username, 'renamed-user');
console.log('PASS: username rename preserves password, invalidates sessions, and rejects collisions');

context.saveUser({ username: 'renamed-user', name: 'Email user', email: ' Person+Test@Example.COM ', role: 'employee', active: true }, adminToken);
assert.equal(context.authReadUser_('renamed-user').email, 'person+test@example.com');
const emailLogin = context.login(' PERSON+TEST@EXAMPLE.COM ', 'long-test-password');
assert.equal(emailLogin.user.username, 'renamed-user');
assert.equal(emailLogin.user.email, 'person+test@example.com');
assert.equal(context.getCurrentUser(emailLogin.token).username, 'renamed-user');
assert.equal(context.login('renamed-user', 'long-test-password').user.username, 'renamed-user');
assert.throws(() => context.saveUser({ username: 'reader', name: 'Duplicate', email: 'Person+Test@Example.COM', role: 'user', active: true }, adminToken));
assert.throws(() => context.saveUser({ originalUsername: 'reader', username: 'person+test@example.com', name: 'Collision', role: 'user', active: true }, adminToken));
account('someone@example.com', 'user');
assert.throws(() => context.saveUser({ username: 'reader', name: 'Collision', email: 'someone@example.com', role: 'user', active: true }, adminToken));
assert.throws(() => context.saveUser({ username: 'reader', name: 'Bad email', email: 'not-an-email', role: 'user', active: true }, adminToken));
context.saveUser({ username: 'renamed-user', name: 'Legacy save', role: 'employee', active: true }, adminToken);
assert.equal(context.authReadUser_('renamed-user').email, 'person+test@example.com', 'Old clients preserve existing email');
const sharedRateKey = 'AUTH_RATE_' + context.authDigest_('renamed-user');
store.setProperty(sharedRateKey, JSON.stringify({ count: 5, until: now + 900000 }));
assert.throws(() => context.login('person+test@example.com', 'long-test-password'), /15/);
assert.throws(() => context.login('renamed-user', 'long-test-password'), /15/);
store.deleteProperty(sharedRateKey);
context.saveUser({ username: 'renamed-user', name: 'Email changed', email: 'updated@example.com', role: 'employee', active: true }, adminToken);
assert.equal(context.authFindLoginUser_('person+test@example.com'), null);
assert.equal(context.authFindLoginUser_('updated@example.com').username, 'renamed-user');
context.saveUser({ username: 'renamed-user', name: 'Email removed', email: '', role: 'employee', active: true }, adminToken);
assert.equal(context.authFindLoginUser_('updated@example.com'), null);
assert.equal(context.authReadUser_('renamed-user').email, '');
console.log('PASS: email/username login, normalization, collisions, shared throttle, email changes, legacy accounts');

const loggedIn = context.login(' EMPLOYEE ', 'long-test-password');
assert.equal(loggedIn.user.role, 'employee');
assert(!loggedIn.user.credential);
assert.equal(context.getCurrentUser(loggedIn.token).username, 'employee');
context.logout(loggedIn.token);
assert.throws(() => context.getCurrentUser(loggedIn.token), /AUTH_REQUIRED/);
const changed = context.saveUser({ username: 'employee', name: 'Renamed', role: 'user', active: true }, adminToken);
assert.equal(changed.role, 'user');
assert.throws(() => context.getCurrentUser(employeeToken), /AUTH_REQUIRED/);
const disabled = account('disabled', 'user', false);
assert.throws(() => context.getCurrentUser(session(disabled)), /AUTH_REQUIRED/);
const stale = session(user);
now += 21600001;
assert.throws(() => context.getCurrentUser(stale), /AUTH_REQUIRED/);
console.log('PASS: login, logout, account changes, disabled users, session expiry');

// Preload four failed attempts: the fifth computes a hash, the sixth is blocked.
const rateKey = 'AUTH_RATE_' + context.authDigest_('reader');
store.setProperty(rateKey, JSON.stringify({ count: 4, until: now + 900000 }));
assert.throws(() => context.login('reader', 'incorrect-password'));
assert.equal(JSON.parse(store.getProperty(rateKey)).count, 5);
assert.throws(() => context.login('reader', 'long-test-password'), /15/);
const originalUnlockTime = JSON.parse(store.getProperty(rateKey)).until;
now += 120000;
assert.throws(() => context.login('reader', 'long-test-password'), /13/);
assert.equal(JSON.parse(store.getProperty(rateKey)).until, originalUnlockTime, 'Blocked attempts must not extend the lock');
now += 780001;
assert.equal(context.login('reader', 'long-test-password').user.role, 'user');
assert.equal(store.getProperty(rateKey), null);
console.log('PASS: failed-login throttling and recovery');

// Only intended entry points are callable via google.script.run.
const publicFunctions = [...code.matchAll(/^function (\w+)\(/gm)].map(m => m[1]).filter(n => !n.endsWith('_')).sort();
assert.deepEqual(publicFunctions, [...calls.map(([name]) => name), 'doGet', 'login', 'logout', 'getCurrentUser', 'setupInitialAdmin', 'unlockLogin', 'resetAdminPassword'].sort());
console.log('PASS: private helpers cannot be exposed as RPC endpoints');

const adminRenameToken = session(context.authReadUser_('admin'));
assert.throws(() => context.saveUser({ originalUsername: 'admin', username: 'renamed-admin', name: 'Admin', role: 'user', active: true }, adminRenameToken));
context.saveUser({ originalUsername: 'admin', username: 'renamed-admin', name: 'Admin', role: 'admin', active: true }, adminRenameToken);
assert.equal(context.authReadUser_('admin'), null);
assert.equal(context.authReadUser_('renamed-admin').role, 'admin');
assert.throws(() => context.getCurrentUser(adminRenameToken), /AUTH_REQUIRED/);
console.log('PASS: last admin can rename without losing last-admin protection');

properties.clear(); cache.clear();
for (const name of ['setupInitialAdmin', 'unlockLogin', 'resetAdminPassword']) assert.throws(() => context[name](), /FORBIDDEN/);
store.setProperty('AUTH_MAINTENANCE_EMAIL', 'maintainer@example.com');
for (const email of ['', 'outsider@example.com']) {
  activeGoogleEmail = email;
  for (const name of ['setupInitialAdmin', 'unlockLogin', 'resetAdminPassword']) assert.throws(() => context[name](), /FORBIDDEN/);
}
activeGoogleEmail = 'Maintainer@Example.com';
store.setProperty('AUTH_BOOTSTRAP_USERNAME', 'First.Admin');
store.setProperty('AUTH_BOOTSTRAP_PASSWORD', 'bootstrap-unique-password');
store.setProperty('AUTH_BOOTSTRAP_NAME', 'First administrator');
const first = context.setupInitialAdmin();
assert.equal(first.role, 'admin');
assert.equal(first.username, 'first.admin');
assert.equal(store.getProperty('AUTH_BOOTSTRAP_PASSWORD'), null);
const stored = context.authReadUser_('first.admin');
assert.equal(stored.credential.iterations, 600000);
assert.equal(stored.credential.hash, crypto.pbkdf2Sync('bootstrap-unique-password', stored.credential.salt, 600000, 32, 'sha256').toString('hex'));
const firstToken = session(stored);
assert.throws(() => context.saveUser({ username: 'new-user', name: 'New', role: 'user', active: true, password: 'short', isNew: true }, firstToken));
context.saveUser({ username: 'new-user', name: 'New', role: 'employee', active: true, password: 'unique-account-password', isNew: true }, firstToken);
const created = context.authReadUser_('new-user');
assert.notEqual(created.credential.salt, stored.credential.salt);
assert.equal(created.credential.hash, crypto.pbkdf2Sync('unique-account-password', created.credential.salt, 600000, 32, 'sha256').toString('hex'));
assert(!JSON.stringify(store.getProperties()).includes('unique-account-password'));
assert.throws(() => context.saveUser({ username: 'new-user', name: 'Duplicate', role: 'user', active: true, isNew: true }, firstToken));
const beforeReset = session(created);
context.saveUser({ username: 'new-user', name: 'New', role: 'employee', active: true, password: 'updated-account-password' }, firstToken);
assert.throws(() => context.getCurrentUser(beforeReset), /AUTH_REQUIRED/);
assert.notEqual(context.authReadUser_('new-user').credential.hash, created.credential.hash);
store.setProperty('AUTH_BOOTSTRAP_PASSWORD', 'another-bootstrap-password');
assert.throws(() => context.setupInitialAdmin_());
console.log('PASS: bootstrap, salt uniqueness, account creation, password reset, duplicate prevention');

const recoveryUser = context.authReadUser_('first.admin');
const recoveryRateKey = 'AUTH_RATE_' + context.authDigest_(recoveryUser.username);
store.setProperty(recoveryRateKey, JSON.stringify({ count: 5, until: now + 900000 }));
store.setProperty('AUTH_RATE_UNKNOWN', JSON.stringify({ count: 5, until: now + 900000 }));
const previousHash = recoveryUser.credential.hash;
assert.equal(context.unlockLogin().username, 'first.admin');
assert.equal(store.getProperty(recoveryRateKey), null);
assert.equal(store.getProperty('AUTH_RATE_UNKNOWN'), null);
assert.equal(context.authReadUser_('first.admin').credential.hash, previousHash);
store.setProperty('AUTH_RECOVERY_USERNAME', 'missing-user');
assert.throws(() => context.unlockLogin_());
store.setProperty('AUTH_RECOVERY_USERNAME', 'new-user');
store.setProperty('AUTH_RECOVERY_PASSWORD', 'recovered-admin-password');
assert.throws(() => context.resetAdminPassword_());
store.setProperty('AUTH_RECOVERY_USERNAME', 'first.admin');
recoveryUser.active = false;
store.setProperty(context.authUserKey_('first.admin'), JSON.stringify(recoveryUser));
const beforeRecovery = session(recoveryUser);
store.setProperty(recoveryRateKey, JSON.stringify({ count: 5, until: now + 900000 }));
context.resetAdminPassword();
assert.equal(store.getProperty('AUTH_RECOVERY_PASSWORD'), null);
assert.equal(store.getProperty(recoveryRateKey), null);
const recovered = context.authReadUser_('first.admin');
assert.equal(recovered.active, true);
assert.equal(recovered.role, 'admin');
assert.equal(recovered.credential.hash, crypto.pbkdf2Sync('recovered-admin-password', recovered.credential.salt, 600000, 32, 'sha256').toString('hex'));
assert.throws(() => context.getCurrentUser(beforeRecovery), /AUTH_REQUIRED/);
properties.clear();
assert.throws(() => context.login('admin', 'long-test-password'));
assert.equal(properties.size, 0, 'An unconfigured app should not lock an account that does not exist yet');
console.log('PASS: editor-only unlock, admin recovery, recovery secret cleanup, missing-account diagnosis');
console.log('PASS: visible maintenance functions reject missing/untrusted Google identity and allow the configured account');
