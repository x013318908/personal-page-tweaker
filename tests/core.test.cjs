const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
require('../shared.js');
const P = globalThis.PPS;
const legacy = { id: 'old-css', name: 'Existing CSS', enabled: true, site: { host: 'example.com', matchPattern: 'https://example.com/*' }, css: 'body { color: red; }', createdAt: '2026-01-01', updatedAt: '2026-01-01' };

test('v1 backup preserves CSS, identity and enabled state without adding executable JS', () => {
  const result = P.validateExportPayload({ app: P.APP_ID, schemaVersion: 1, styles: [legacy] });
  assert.equal(result.ok, true);
  const migrated = result.styles[0];
  for (const key of ['id', 'name', 'css', 'enabled', 'createdAt', 'updatedAt']) assert.equal(migrated[key], legacy[key]);
  assert.deepEqual(migrated.jsByRunAt, { document_start: '', document_end: '', document_idle: '' });
  assert.equal(P.hasJavaScript(migrated), false);
  assert.deepEqual(P.validateExportPayload(P.buildExportPayload(result.styles)).styles, result.styles);
});
test('v2 scripts migrate only to their existing timing, retaining all settings', () => {
  for (const runAt of P.RUN_ATS) {
    const old = { ...legacy, js: 'globalThis.legacy = true;', runAt, jsEnabled: false, world: 'MAIN', allFrames: true };
    const result = P.validateExportPayload({ app: P.APP_ID, schemaVersion: 2, styles: [old] });
    assert.equal(result.ok, true);
    const migrated = result.styles[0];
    for (const key of ['id', 'name', 'css', 'enabled', 'jsEnabled', 'world', 'allFrames', 'createdAt', 'updatedAt']) assert.equal(migrated[key], old[key]);
    assert.deepEqual(migrated.jsByRunAt, Object.fromEntries(P.RUN_ATS.map(timing => [timing, timing === runAt ? old.js : ''])));
    assert.equal('js' in migrated, false);
    assert.equal('runAt' in migrated, false);
    assert.deepEqual(P.normalizeStyle(migrated), migrated, 'Repeated normalization does not duplicate or move code');
  }
  assert.equal(P.normalizeStyle({ ...legacy, js: 'legacy();' }).jsByRunAt.document_idle, 'legacy();');
});
test('v3 backup round trips all timings, and a timing map takes precedence over legacy code', () => {
  const jsByRunAt = { document_start: 'start();', document_end: 'end();', document_idle: 'idle();' };
  const style = P.normalizeStyle({ ...legacy, jsByRunAt });
  const payload = P.buildExportPayload([style]);
  assert.equal(payload.schemaVersion, 3);
  assert.deepEqual(P.validateExportPayload(JSON.parse(JSON.stringify(payload))).styles, [style]);
  const cleared = P.normalizeStyle({ ...legacy, js: 'mustNotReappear();', runAt: 'document_start', jsByRunAt: {} });
  assert.equal(P.hasJavaScript(cleared), false);
  assert.deepEqual(P.userScriptDefinitions(cleared), []);
});
test('URL boundary, wildcard, query, fragment and exclusions match Chrome semantics', () => {
  assert.equal(P.matchPatternForUrl('*://*.example.com/articles/*', 'https://a.example.com/articles/1?q=2#fragment'), true);
  assert.equal(P.matchPatternForUrl('*://*.example.com/*', 'https://evil-example.com/'), false);
  assert.equal(P.matchPatternForUrl('https://example.com/exact', 'https://example.com/exact#anchor'), true);
  assert.equal(P.matchPatternForUrl('https://example.com/exact', 'https://example.com/exact?q=1'), false);
  assert.equal(P.matchPatternForUrl('https://example.com/*', 'chrome://extensions/'), false);
  assert.equal(P.isValidMatchPattern('https://foo*bar.com/*'), false);
  assert.equal(P.isValidMatchPattern('https://example.com:123/*'), false);
  assert.equal(P.isValidMatchPattern('https://example.com/*#anchor'), false);
  const rule = P.normalizeStyle({ ...legacy, excludeMatches: ['https://example.com/account/*'] });
  assert.equal(P.matchesStyle(rule, 'https://example.com/account/private'), false);
  assert.equal(P.matchesStyle(rule, 'https://example.com/public'), true);
});
test('malformed imports are rejected, not coerced into active scripts', () => {
  for (const value of [null, {}, { ...legacy, enabled: 'false' }, { ...legacy, js: {} }, { ...legacy, allFrames: 'false' }, { ...legacy, runAt: 'later' }, { ...legacy, site: { matchPatterns: 'https://example.com/*' } },
    ...[null, [], 'code', { document_start: false }, { document_end: {} }, { document_idle: 1 }, { later: 'code' }].map(jsByRunAt => ({ ...legacy, jsByRunAt }))]) {
    for (const schemaVersion of [1, 2, 3]) assert.equal(P.validateExportPayload({ app: P.APP_ID, schemaVersion, styles: [value] }).ok, false);
  }
});
test('userscript metadata imports multiple matches and remains disabled for review', () => {
  const source = '// ==UserScript==\n// @name Test\n// @match https://example.com/*\n// @match http://localhost/*\n// @exclude-match https://example.com/private/*\n// @grant none\n// @run-at document-start\n// @noframes\n// ==/UserScript==\ndocument.title = "Test";';
  const result = P.parseUserScript(source);
  assert.equal(result.ok, true);
  assert.equal(result.style.enabled, false);
  assert.equal(result.style.world, 'MAIN');
  assert.equal(result.style.allFrames, false);
  assert.equal(result.style.site.matchPatterns.length, 2);
  assert.deepEqual(result.style.jsByRunAt, { document_start: source, document_end: '', document_idle: '' });
  for (const runAt of P.RUN_ATS) {
    const timedSource = source.replace('document-start', runAt.replaceAll('_', '-'));
    const imported = P.parseUserScript(timedSource);
    assert.equal(imported.ok, true);
    assert.equal(imported.style.jsByRunAt[runAt], timedSource);
    assert.equal(P.userScriptDefinitions(imported.style).length, 1);
  }
  assert.equal(P.parseUserScript(source.replace('// @run-at document-start\n', '')).style.jsByRunAt.document_idle.includes('document.title'), true);
  assert.equal(P.parseUserScript(source.replace('document-start', 'unsupported')).ok, false);
  assert.equal(P.parseUserScript(source.replace('@grant none', '@grant GM_xmlhttpRequest')).ok, false);
  assert.equal(P.parseUserScript(source.replace('@grant none', '@require https://example.com/lib.js')).ok, false);
});
test('user code is wrapped and each independent world has a distinct ID', () => {
  const [definition] = P.userScriptDefinitions(P.normalizeStyle({ ...legacy, js: 'globalThis.runs = (globalThis.runs || 0) + 1;' }));
  const context = vm.createContext({ console });
  vm.runInContext(definition.js[0].code, context);
  assert.equal(context.runs, 1);
  assert.equal(definition.worldId, 'pps-old-css');
  const [main] = P.userScriptDefinitions(P.normalizeStyle({ ...legacy, world: 'MAIN', js: 'void 0;' }));
  assert.equal('worldId' in main, false);
});
test('all nonempty timings register independently and share only their own settings world', () => {
  const style = P.normalizeStyle({ ...legacy, excludeMatches: ['https://example.com/private/*'], allFrames: true,
    jsByRunAt: Object.fromEntries(P.RUN_ATS.map(runAt => [runAt, `const local = ${JSON.stringify(runAt)}; (globalThis.order ||= []).push(local);`])) });
  const definitions = P.userScriptDefinitions(style);
  assert.deepEqual(definitions.map(d => d.runAt), P.RUN_ATS);
  assert.equal(new Set(definitions.map(d => d.id)).size, 3);
  const context = vm.createContext({ console });
  for (const definition of definitions) {
    assert.equal(definition.worldId, 'pps-old-css');
    assert.equal(definition.allFrames, true);
    assert.deepEqual(definition.excludeMatches, style.excludeMatches);
    assert.deepEqual(definition.matches, ['https://example.com/*']);
    assert.ok(definition.js[0].code.includes(`${definition.runAt}.user.js`));
    vm.runInContext(definition.js[0].code, context);
  }
  assert.deepEqual(Array.from(context.order), P.RUN_ATS);
  assert.equal(P.hasJavaScript(style), true);
  assert.equal(P.codeLabel(style), 'CSS + JS');
  const other = P.userScriptDefinitions({ ...style, id: 'other' });
  assert.notEqual(other[0].worldId, definitions[0].worldId);
  assert.deepEqual(P.userScriptDefinitions({ ...style, jsByRunAt: { document_start: '', document_end: '\n  ', document_idle: 'idle();' } }).map(d => d.runAt), ['document_idle']);
});
