// No browser login secrets are kept in persistent storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const storage = () => {
  const values = new Map();
  return {getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
};
const localStorage = storage(), sessionStorage = storage();
const context = vm.createContext({localStorage, sessionStorage});
const source = fs.readFileSync(path.join(__dirname, '../src/js/app.js'), 'utf8').split('const App =')[0];
vm.runInContext(source + '\nthis.auth = Auth;', context);
const auth = context.auth;
localStorage.setItem('ph_auth_user', JSON.stringify({id:'forged'}));
assert.equal(auth.getCurrent(), null);
auth.set({id:'U1', username:'demo'}, true);
assert.equal(localStorage.getItem('ph_auth_user'), null);
assert.equal(auth.lastUsername(), 'demo');
assert.equal(auth.getCurrent().id, 'U1');
auth.clear();
assert.equal(auth.getCurrent(), null);
assert.equal(auth.lastUsername(), 'demo');
auth.set({id:'U1', username:'demo'}, false);
assert.equal(auth.lastUsername(), '');
assert.equal(auth.isRemembered(), false);
console.log('PASS: username-only remember, session cleanup, forged persistent cache ignored');
