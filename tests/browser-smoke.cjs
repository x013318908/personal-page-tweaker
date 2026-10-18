// Run against a separate Chromium profile; never touches the user's browser.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-browser-test-'));
const cache = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const browserPath = process.env.PPS_CHROMIUM || (fs.existsSync(cache) ? fs.readdirSync(cache) : []).filter(x => /^chromium-\d+$/.test(x)).sort((a,b) => Number(b.split('-')[1]) - Number(a.split('-')[1])).map(x => path.join(cache, x, 'chrome-win64', 'chrome.exe')).find(fs.existsSync);
if (!browserPath) throw new Error('Set PPS_CHROMIUM to a Chromium / Chrome for Testing binary.');

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', event => {
      const data = JSON.parse(event.data), job = this.pending.get(data.id);
      if (process.env.PPS_CDP_DEBUG) console.log('CDP receive', JSON.stringify(data).slice(0, 350));
      if (job) { this.pending.delete(data.id); clearTimeout(job.timer); data.error ? job.reject(new Error(JSON.stringify(data.error))) : job.resolve(data.result); }
    });
    ws.addEventListener('close', event => console.log('CDP closed', event.code, event.reason));
  }
  call(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method + ' ' + (params.expression || '').slice(0, 180))); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async page(url = 'about:blank') {
    const { targetId } = await this.call('Target.createTarget', { url });
    const { sessionId } = await this.call('Target.attachToTarget', { targetId, flatten: true });
    await this.call('Page.enable', {}, sessionId);
    return sessionId;
  }
  async eval(sessionId, expression) {
    const result = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async wait(sessionId, expression) {
    for (let i = 0; i < 100; i++) { if (await this.eval(sessionId, expression)) return; await delay(100); }
    throw new Error('Timed out: ' + expression);
  }
}

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'");
    if (req.url === '/page.js') { res.setHeader('Content-Type', 'application/javascript'); res.end('window.pageValue = 42;'); return; }
    res.end('<!doctype html><html><head><script src="/page.js"></script></head><body><h1>Test page</h1>' + (req.url === '/frame' ? '' : '<iframe src="/frame"></iframe>') + '</body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const child = spawn(browserPath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--load-extension=' + root, '--disable-extensions-except=' + root, '--enable-unsafe-extension-debugging'], { windowsHide: true, stdio: 'ignore' });
  let cdp;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await delay(100);
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    console.log('Connected browser:', version.Browser, 'port:', port);
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    cdp = new CDP(ws);
    await cdp.call('Browser.getVersion');
    let extensionId;
    for (let i = 0; i < 100 && !extensionId; i++) {
      const { targetInfos } = await cdp.call('Target.getTargets');
      extensionId = targetInfos.find(t => t.type === 'service_worker' && t.url.endsWith('/background.js'))?.url.split('/')[2];
      if (!extensionId) await delay(100);
    }
    assert.ok(extensionId, 'Extension service worker loads');
    console.log('Browser:', version.Browser, 'Extension:', extensionId);
    let options = await cdp.page(`chrome-extension://${extensionId}/options.html`);
    await cdp.wait(options, 'document.documentElement?.dataset.ready === "true"');
    const before = await cdp.eval(options, 'PPS.sync()');
    console.log('Initial status:', before);
    const settings = await cdp.page('chrome://extensions/?id=' + extensionId);
    await cdp.wait(settings, 'typeof chrome.developerPrivate !== "undefined"');
    await cdp.eval(settings, `chrome.developerPrivate.addHostPermission(${JSON.stringify(extensionId)},'http://127.0.0.1/*')`);
    console.log('Request local test permission:', await cdp.eval(options, `PPS.permissionRequest('http://127.0.0.1/*')`));
    const legacy = { id: 'legacy-css', name: '既存CSS', enabled: true, css: 'h1 { color: rgb(1, 2, 3); }', site: { host: '127.0.0.1', matchPattern: 'http://127.0.0.1/*' }, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    await cdp.eval(options, `chrome.storage.local.set({[PPS.STORAGE_KEY]:[${JSON.stringify(legacy)}]})`);
    const cssStatus = await cdp.eval(options, 'PPS.sync()');
    assert.deepEqual(cssStatus.errors, []);
    assert.deepEqual(cssStatus.missingPermissions, []);
    assert.equal(cssStatus.userScriptsAvailable, false);
    const target = await cdp.page(url + '/allowed');
    try { await cdp.wait(target, `document.querySelector('h1') && getComputedStyle(document.querySelector('h1')).color === 'rgb(1, 2, 3)'`); }
    catch(error) { console.log('Page:',await cdp.eval(target,'document.documentElement.outerHTML')); console.log('Bridge:',await cdp.eval(options,`(async()=>{const tabs=await chrome.tabs.query({url:'http://127.0.0.1/*'}); return Promise.all(tabs.map(tab=>chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({loaded:globalThis.__personalPageStylerLoaded,pps:typeof PPS,extensionId:chrome.runtime.id})})));})()`));throw error; }
    console.log('PASS: existing CSS works while userScripts is disabled');
    await cdp.eval(settings, `chrome.developerPrivate.updateExtensionConfiguration({extensionId:${JSON.stringify(extensionId)},userScriptsAccess:true})`);
    await cdp.eval(options, 'location.reload()');
    await cdp.wait(options, 'document.documentElement?.dataset.ready === "true"');
    assert.equal((await cdp.eval(options, 'PPS.sync()')).userScriptsAvailable, true);

    // Exercise the real form, including its Save gesture and URL permissions.
    await cdp.eval(options, `(() => {
      document.getElementById('newButton').click();
      const values = {nameInput:'見出しと動作をカスタマイズ',hostInput:'127.0.0.1',patternInput:'http://127.0.0.1/*',excludeInput:'http://127.0.0.1/excluded*',cssInput:'h1 { background: rgb(10, 20, 30); }',jsInput:'document.body.dataset.ppsRuns = String(Number(document.body.dataset.ppsRuns || 0) + 1); document.body.dataset.isolation = typeof window.pageValue;'};
      for(const [id,value] of Object.entries(values)){const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}
      document.getElementById('editorForm').requestSubmit();
    })()`);
    await cdp.wait(options, `document.getElementById('saveStatus').textContent.includes('保存しました')`);
    const response = await cdp.eval(options, 'PPS.sync()');
    assert.deepEqual(response.errors, []);
    await cdp.wait(target, `getComputedStyle(document.querySelector('h1')).backgroundColor === 'rgb(10, 20, 30)'`);
    assert.equal(await cdp.eval(target, 'document.body.dataset.ppsRuns'), undefined, 'Save does not run JavaScript on the existing document');
    await cdp.call('Page.reload', {}, target);
    await cdp.wait(target, `document.body?.dataset.ppsRuns === '1'`);
    assert.equal(await cdp.eval(target, 'document.body.dataset.isolation'), 'undefined');
    assert.equal(await cdp.eval(target, `document.querySelector('iframe').contentDocument.body.dataset.ppsRuns`), undefined);
    console.log('PASS: real form saves; CSS refreshes live; isolated JS runs once on navigation, top frame only');

    const rule = await cdp.eval(options, `(async()=> (await PPS.getStyles()).find(s=>s.id!=='legacy-css'))()`);
    await cdp.eval(options, `document.getElementById('jsTab').click()`);
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1160, deviceScaleFactor: 1, mobile: false }, options);
    const shot = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, options);
    fs.writeFileSync(path.join(root, '..', 'options-preview.png'), Buffer.from(shot.data, 'base64'));

    // Saving CSS alone must not execute the script again.
    await cdp.eval(options, `(() => { const e=document.getElementById('cssInput');e.value='h1 { background: rgb(20, 30, 40); }';e.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('editorForm').requestSubmit();})()`);
    await cdp.wait(target, `getComputedStyle(document.querySelector('h1')).backgroundColor === 'rgb(20, 30, 40)'`);
    assert.equal(await cdp.eval(target, 'document.body.dataset.ppsRuns'), '1');

    const excluded = await cdp.page(url + '/excluded');
    await cdp.wait(excluded, 'document.readyState === "complete"');
    assert.equal(await cdp.eval(excluded, 'document.body.dataset.ppsRuns'), undefined);
    assert.equal(await cdp.eval(excluded, `getComputedStyle(document.querySelector('h1')).backgroundColor`), 'rgba(0, 0, 0, 0)');

    await cdp.eval(options, `PPS.mutate('toggle',{id:${JSON.stringify(rule.id)},enabled:false})`);
    await cdp.wait(target, `getComputedStyle(document.querySelector('h1')).backgroundColor === 'rgba(0, 0, 0, 0)'`);
    assert.equal(await cdp.eval(target, 'document.body.dataset.ppsRuns'), '1', 'Disabling does not pretend to undo JavaScript');
    await cdp.call('Page.reload', {}, target);
    await cdp.wait(target, 'document.readyState === "complete"');
    assert.equal(await cdp.eval(target, 'document.body.dataset.ppsRuns'), undefined);
    console.log('PASS: CSS-only save does not rerun JS; excluded URLs and disabled rules do not run');

    // MAIN world + document_start + subframes, then an independent-world switch.
    await cdp.eval(options, `(async()=>{const s=(await PPS.getStyles()).find(s=>s.id===${JSON.stringify(rule.id)});return PPS.mutate('save',{expectedUpdatedAt:s.updatedAt,style:{...s,enabled:true,world:'MAIN',runAt:'document_start',allFrames:true,js:'const ready = document.readyState; document.addEventListener("DOMContentLoaded", () => { document.body.dataset.readyAtStart = ready; document.body.dataset.pageValue = String(window.pageValue); });'}});})()`);
    await cdp.call('Page.reload', {}, target);
    await cdp.wait(target, `document.body?.dataset.pageValue === '42'`);
    assert.equal(await cdp.eval(target, 'document.body.dataset.readyAtStart'), 'loading');
    await cdp.wait(target, `document.querySelector('iframe').contentDocument.body?.dataset.pageValue === '42'`);
    console.log('PASS: page-world access, document_start and frames');

    // Extension reload clears native user scripts. onInstalled must restore them
    // from local storage without opening any welcome/update tabs.
    const pagesBeforeReload = (await cdp.call('Target.getTargets')).targetInfos.filter(t=>t.type==='page').length;
    await cdp.eval(settings, `chrome.developerPrivate.reload(${JSON.stringify(extensionId)})`);
    console.log('Reload requested');
    // Observe through an extension page with its app script blocked so opening
    // the observer cannot trigger PPS.sync() and mask a restore failure.
    const observer = await cdp.page();
    await cdp.call('Network.enable', {}, observer);
    await cdp.call('Network.setBlockedURLs', {urls:['*options.js']}, observer);
    await cdp.call('Page.navigate',{url:`chrome-extension://${extensionId}/options.html`},observer);
    await cdp.wait(observer, `typeof chrome.userScripts !== 'undefined'`);
    await cdp.wait(observer, `(async()=> (await chrome.userScripts.getScripts()).length === 1)()`);
    await cdp.call('Page.reload', {}, target);
    await cdp.wait(target, `document.body?.dataset.pageValue === '42'`);
    assert.ok((await cdp.call('Target.getTargets')).targetInfos.filter(t=>t.type==='page').length <= pagesBeforeReload + 1);
    console.log('PASS: extension reload retains settings, restores scripts, and opens no tabs');
    options = await cdp.page(`chrome-extension://${extensionId}/options.html`);
    await cdp.wait(options, 'document.documentElement?.dataset.ready === "true"');

    const unpermitted = await cdp.eval(options, `(async()=>{const s=PPS.makeStyleFromUrl('https://example.invalid/');s.js='document.body.dataset.mustNotRun="1"';return PPS.mutate('save',{style:s});})()`);
    assert.ok(unpermitted.missingPermissions.length);
    assert.equal((await cdp.eval(options, 'chrome.userScripts.getScripts()')).length, 1);

    await cdp.eval(settings, `chrome.developerPrivate.removeHostPermission(${JSON.stringify(extensionId)},'http://127.0.0.1/*')`);
    await cdp.eval(options, 'PPS.sync()');
    assert.equal((await cdp.eval(options, 'chrome.userScripts.getScripts()')).length, 0);
    await cdp.wait(target, `getComputedStyle(document.querySelector('h1')).color !== 'rgb(1, 2, 3)'`);
    await cdp.call('Page.reload', {}, target);
    await cdp.wait(target, 'document.readyState === "complete"');
    assert.equal(await cdp.eval(target, 'document.body.dataset.pageValue'), undefined);
    console.log('PASS: missing/revoked site permissions stop both JS and CSS');
    console.log('BROWSER_SMOKE_OK');
  } finally {
    if (cdp) { await cdp.call('Browser.close').catch(() => {}); cdp.ws.close(); }
    child.kill(); server.closeAllConnections(); server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
