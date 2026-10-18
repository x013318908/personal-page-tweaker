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
  assert.equal(migrated.js, '');
  assert.deepEqual(P.validateExportPayload(P.buildExportPayload(result.styles)).styles, result.styles);
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
  for (const value of [null, {}, { ...legacy, enabled: 'false' }, { ...legacy, js: {} }, { ...legacy, allFrames: 'false' }, { ...legacy, site: { matchPatterns: 'https://example.com/*' } }]) {
    assert.equal(P.validateExportPayload({ app: P.APP_ID, schemaVersion: 2, styles: [value] }).ok, false);
  }
});
test('userscript metadata imports multiple matches and remains disabled for review', () => {
  const source = '// ==UserScript==\n// @name Test\n// @match https://example.com/*\n// @match http://localhost/*\n// @exclude-match https://example.com/private/*\n// @grant none\n// @run-at document-start\n// @noframes\n// ==/UserScript==\ndocument.title = "Test";';
  const result = P.parseUserScript(source);
  assert.equal(result.ok, true);
  assert.equal(result.style.enabled, false);
  assert.equal(result.style.world, 'MAIN');
  assert.equal(result.style.runAt, 'document_start');
  assert.equal(result.style.allFrames, false);
  assert.equal(result.style.site.matchPatterns.length, 2);
  assert.equal(result.style.js, source);
  assert.equal(P.parseUserScript(source.replace('@grant none', '@grant GM_xmlhttpRequest')).ok, false);
  assert.equal(P.parseUserScript(source.replace('@grant none', '@require https://example.com/lib.js')).ok, false);
});
test('user code is wrapped and each independent world has a distinct ID', () => {
  const definition = P.userScriptDefinition(P.normalizeStyle({ ...legacy, js: 'globalThis.runs = (globalThis.runs || 0) + 1;' }));
  const context = vm.createContext({ console });
  vm.runInContext(definition.js[0].code, context);
  assert.equal(context.runs, 1);
  assert.equal(definition.worldId, 'pps-old-css');
  const main = P.userScriptDefinition(P.normalizeStyle({ ...legacy, world: 'MAIN', js: 'void 0;' }));
  assert.equal('worldId' in main, false);
});
