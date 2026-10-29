const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
require('../shared.js');
const P = globalThis.PPS;
const fixture = P.normalizeStyle({ id: 'rule:with:colons', name: 'Timing test', enabled: true, css: '',
  site: { matchPattern: 'https://example.com/*' },
  jsByRunAt: { document_start: 'start();', document_end: 'end();', document_idle: 'idle();' } });

function background(styles, registered = [], rejectTiming) {
  let records = structuredClone(styles), listener;
  const scripts = new Map(registered.map(script => [script.id, structuredClone(script)]));
  const content = new Map(), operations = [];
  const event = () => ({ addListener() {} });
  const register = async definitions => {
    for (const definition of definitions) {
      if (definition.runAt === rejectTiming) throw new Error('Registration failed');
      scripts.set(definition.id, structuredClone(definition)); operations.push(definition.id);
    }
  };
  const context = vm.createContext({ console: { error() {} }, crypto: globalThis.crypto, URL, setTimeout, clearTimeout,
    chrome: {
      runtime: { id: 'test', getURL: file => `chrome-extension://test/${file}`, onInstalled: event(), onStartup: event(),
        onMessage: { addListener(fn) { listener = fn; } } },
      storage: { local: {
        get: async () => ({ [P.STORAGE_KEY]: structuredClone(records) }),
        set: async data => { if (P.STORAGE_KEY in data) records = structuredClone(data[P.STORAGE_KEY]); },
        setAccessLevel: async () => {}
      }, onChanged: event() },
      permissions: { contains: async () => true, onAdded: event(), onRemoved: event() },
      tabs: { query: async () => [] },
      scripting: {
        getRegisteredContentScripts: async () => [...content.values()],
        registerContentScripts: async definitions => definitions.forEach(d => content.set(d.id, structuredClone(d))),
        updateContentScripts: async definitions => definitions.forEach(d => content.set(d.id, structuredClone(d))),
        unregisterContentScripts: async ({ ids }) => ids.forEach(id => content.delete(id))
      },
      userScripts: { getScripts: async () => [...scripts.values()], register, update: register,
        unregister: async ({ ids }) => ids.forEach(id => { scripts.delete(id); operations.push(`remove:${id}`); }) }
    } });
  context.importScripts = file => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8'), context);
  const send = message => new Promise(resolve => listener(message, { id: 'test', url: 'chrome-extension://test/options.html' }, response => resolve(structuredClone(response))));
  return { scripts, operations, sync: () => send({ type: P.MESSAGE_SYNC }),
    save: style => send({ type: P.MESSAGE_MUTATE, operation: 'save', style, expectedUpdatedAt: records.find(s => s.id === style.id)?.updatedAt }),
    mutate: (operation, data) => send({ type: P.MESSAGE_MUTATE, operation, ...data }) };
}

test('sync replaces a legacy registration once and preserves unrelated scripts', async () => {
  const legacy = { ...fixture, js: 'legacy();', runAt: 'document_end' };
  delete legacy.jsByRunAt;
  const [old] = P.userScriptDefinitions(P.normalizeStyle(legacy));
  old.id = P.USER_SCRIPT_PREFIX + legacy.id;
  const app = background([legacy], [old, { id: 'another-extension-script' }]);
  assert.deepEqual((await app.sync()).errors, []);
  assert.deepEqual([...app.scripts.keys()].sort(), ['another-extension-script', `${old.id}:document_end`]);
  const count = app.operations.length;
  await app.sync();
  assert.equal(app.operations.length, count, 'An unchanged sync does not re-register scripts');
});

test('clearing one timing and toggling JavaScript preserve the other code', async () => {
  const app = background([fixture]);
  assert.deepEqual((await app.sync()).errors, []);
  assert.equal(app.scripts.size, 3);
  let response = await app.save({ ...fixture, jsByRunAt: { ...fixture.jsByRunAt, document_start: '' } });
  assert.equal(response.ok, true);
  assert.deepEqual([...app.scripts.values()].map(s => s.runAt), ['document_end', 'document_idle']);
  const cleared = response.styles[0];
  response = await app.save({ ...cleared, jsEnabled: false });
  assert.equal(app.scripts.size, 0);
  assert.deepEqual(response.styles[0].jsByRunAt, cleared.jsByRunAt);
  response = await app.save({ ...response.styles[0], jsEnabled: true });
  assert.equal(app.scripts.size, 2);
  await app.mutate('toggle', { id: fixture.id, enabled: false });
  assert.equal(app.scripts.size, 0);
  await app.mutate('toggle', { id: fixture.id, enabled: true });
  assert.equal(app.scripts.size, 2);
  await app.mutate('delete', { id: fixture.id });
  assert.equal(app.scripts.size, 0);
});

test('a failed timing removes old code, reports the parent setting, and permits the other timings', async () => {
  const [old] = P.userScriptDefinitions({ ...fixture, jsByRunAt: { ...fixture.jsByRunAt, document_start: 'oldCode();' } });
  const app = background([fixture], [old], 'document_start');
  const status = await app.sync();
  assert.equal(status.errors.length, 1);
  assert.equal(status.errors[0].id, fixture.id);
  assert.match(status.errors[0].message, /読み込み開始時: Registration failed/);
  assert.equal(app.scripts.has(old.id), false);
  assert.deepEqual([...app.scripts.values()].map(s => s.runAt), ['document_end', 'document_idle']);
});

test('switching to the page world replaces all timing registrations and removes their world IDs', async () => {
  const app = background([{ ...fixture, world: 'MAIN' }], P.userScriptDefinitions(fixture));
  assert.deepEqual((await app.sync()).errors, []);
  assert.equal(app.scripts.size, 3);
  for (const definition of app.scripts.values()) {
    assert.equal(definition.world, 'MAIN');
    assert.equal('worldId' in definition, false);
  }
});
