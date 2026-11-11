const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../shared.js');
require('../ai-helper.js');
const P = globalThis.PPS, A = globalThis.PPTAI;
const valid = () => ({ name: '読みやすく', site: { matchPatterns: ['https://example.com/*'] }, excludeMatches: [], css: 'body { color: red; }', cssEnabled: true, jsByRunAt: { document_start: '', document_end: '', document_idle: 'globalThis.shouldNotRun = true;' }, jsEnabled: true, world: 'USER_SCRIPT', allFrames: false });
test('AI import is a fresh disabled draft, preserves every timing and never evaluates code', () => {
  const input = { ...valid(), id: 'existing', enabled: true, createdAt: 'old' };
  const result = A.parseReply('```json\n' + JSON.stringify(input) + '\n```');
  assert.equal(result.enabled, false);
  assert.notEqual(result.id, input.id);
  assert.notEqual(result.createdAt, input.createdAt);
  assert.deepEqual(result.jsByRunAt, input.jsByRunAt);
  assert.equal(globalThis.shouldNotRun, undefined);
});
test('AI import rejects partial, malformed, unsupported and multi-rule responses', () => {
  for (const raw of [null, [], { styles: [valid()] }, { ...valid(), css: false }, { ...valid(), site: { matchPatterns: ['chrome://extensions/*'] } }, { ...valid(), world: 'UNKNOWN' }, { ...valid(), jsByRunAt: { document_idle: '' } }, { ...valid(), require: 'remote.js' }, { ...valid(), allFrames: 'false' }]) {
    assert.throws(() => A.parseReply(JSON.stringify(raw)));
  }
  assert.throws(() => A.parseReply('Some explanation\n' + JSON.stringify(valid())));
});
test('AI request includes edited code, scope and limitations without storage identity', () => {
  const style = P.normalizeStyle({ ...valid(), id: 'private-identity', enabled: true });
  const prompt = A.buildPrompt(style, '見出しを大きく');
  for (const value of ['見出しを大きく', style.css, 'document_start', 'GM_addStyle', 'https://example.com/*']) assert.ok(prompt.includes(value));
  assert.ok(!prompt.includes('private-identity'));
  assert.throws(() => A.buildPrompt(style, ' '));
});
