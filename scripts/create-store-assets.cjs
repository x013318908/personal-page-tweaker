// Render the project's vector icon and capture real extension UI in a temporary
// browser profile. No external packages or personal browser data are used.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { CDP } = require('./lib/cdp.cjs');
const root = path.resolve(__dirname, '..');
const browserPath = process.env.PPS_CHROMIUM;
if (!browserPath) throw new Error('Set PPS_CHROMIUM to Chrome / Chrome for Testing.');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const imageData = data => 'data:image/png;base64,' + data;
const vector = fs.readFileSync(path.join(root, 'icons/icon.svg'), 'utf8');
const vectorData = 'data:image/svg+xml;base64,' + Buffer.from(vector).toString('base64');
const output = (name, data) => {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(data, 'base64'));
  console.log('Created', name);
};

async function launch(withExtension) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pps-store-assets-'));
  const args = ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--enable-unsafe-extension-debugging'];
  if (withExtension) args.push('--load-extension=' + root, '--disable-extensions-except=' + root);
  const child = spawn(browserPath, args, { stdio: 'ignore', windowsHide: true });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await delay(100);
  if (!fs.existsSync(portFile)) { child.kill(); throw new Error('Browser failed to start'); }
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  const cdp = new CDP(ws);
  return { cdp, close: async () => {
    await cdp.call('Browser.close').catch(() => {}); ws.close();
    if (child.exitCode === null) await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(2000)]);
    child.kill();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } };
}

async function makeIcons() {
  const browser = await launch(false);
  try {
    const page = await browser.cdp.page();
    for (const size of [16, 32, 48, 128]) {
      const png = await browser.cdp.eval(page, `(async()=>{
        const image=new Image(); image.src=${JSON.stringify(vectorData)}; await image.decode();
        const canvas=document.createElement('canvas'); canvas.width=canvas.height=${size};
        canvas.getContext('2d').drawImage(image,0,0,${size},${size});
        return canvas.toDataURL('image/png').split(',')[1];
      })()`);
      output(`icons/icon-${size}.png`, png);
      if (size === 48 || size === 128) output(`docs/assets/icons/icon-${size}.png`, png);
    }
  } finally { await browser.close(); }
}

const artboardStyle = `
  *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
  body{background:#f1f5fc;color:#172740;font-family:system-ui,-apple-system,'Noto Sans CJK JP',sans-serif}
  .board{width:1280px;height:800px;padding:40px 48px;background:radial-gradient(ellipse at top right,#e2ebff,transparent 60%),#f4f7fc}
  .brand{display:flex;align-items:center;gap:8px;color:#2457d6;font-size:15px;font-weight:750;margin-bottom:16px}
  .brand img{width:34px;height:34px}h1{font-size:38px;line-height:1.25;letter-spacing:-.04em;margin:0 0 12px;font-weight:800}
  .subtitle{color:#65738a;font-size:17px;margin:0 0 26px;line-height:1.6}
  .frames{display:grid;grid-template-columns:1fr 1fr;gap:24px;height:532px}
  .frame{min-width:0;border:1px solid #d5deec;border-radius:14px;background:#fff;overflow:hidden;box-shadow:0 18px 40px #19355c10}
  .bar{height:36px;padding:0 14px;display:flex;align-items:center;gap:5px;background:#f9fbff;border-bottom:1px solid #e1e7f0;font-size:11px;color:#7a879c}
  .bar i{width:7px;height:7px;background:#d0d9e8;border-radius:50%}.bar span{margin-left:8px}
  .frame>img{width:100%;height:auto;display:block}
  .js-layout{display:grid;grid-template-columns:265px 1fr;gap:24px;height:536px}
  .aside{padding:26px 20px;background:#e8efff;border:1px solid #d6e2fc;border-radius:14px}
  .aside h2{font-size:23px;line-height:1.5;margin:0 0 25px;letter-spacing:-.025em}
  .step{font-size:14px;line-height:1.6;margin:0 0 20px;color:#4c6082}.step strong{display:block;color:#2457d6;font-size:16px;margin-bottom:5px}
  .controls{grid-template-columns:360px 1fr}.foot{font-size:11px;color:#8290a5;margin-top:18px}
`;
const frame = (label, data) => `<div class="frame"><div class="bar"><i></i><i></i><i></i><span>${label}</span></div><img src="${imageData(data)}" alt=""></div>`;
function board(title, subtitle, body, extra = '') {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${artboardStyle}${extra}</style></head><body><main class="board"><div class="brand"><img src="${vectorData}" alt="">Personal Page Tweaker</div><h1>${title}</h1><p class="subtitle">${subtitle}</p>${body}<div class="foot">Chrome 138+ · ローカルのサンプルページと実際の拡張画面</div></main></body></html>`;
}
function promotion(width, height) {
  const small = width === 440;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}
    body{background:radial-gradient(ellipse at top right,#457dff,transparent 65%),linear-gradient(135deg,#2457d6,#183c95);font-family:system-ui,sans-serif;color:white;display:flex;align-items:center;justify-content:center}
    .content{display:flex;align-items:center;gap:80px}.name{font-size:78px;line-height:1.12;font-weight:750;letter-spacing:-.04em}.caption{font-size:21px;opacity:.8;margin-top:22px;letter-spacing:.06em}
    .mark{width:310px;height:310px;display:grid;place-items:center;border:1px solid #ffffff30;border-radius:64px;background:#ffffff0c;box-shadow:0 25px 75px #06246730}.mark img{width:290px;height:290px}
    ${small ? '.content{flex-direction:column;gap:0}.mark{width:136px;height:136px;border:0;background:none;box-shadow:none}.mark img{width:136px;height:136px}.name{font-size:24px;text-align:center;letter-spacing:-.02em}.name br{display:none}.caption{font-size:13px;text-align:center;margin-top:9px;letter-spacing:.04em}' : ''}
  </style></head><body><div class="content">${small ? '' : '<div>'}<div class="mark"><img src="${vectorData}" alt=""></div>${small ? '' : '</div><div>'}<div class="name">Personal Page<br>${small ? ' ' : ''}Tweaker</div><div class="caption">CSS + JavaScript</div>${small ? '' : '</div>'}</div></body></html>`;
}

async function makeStoreImages() {
  const artboards = new Map();
  const demo = fs.readFileSync(path.join(__dirname, 'fixtures/demo.html'));
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(artboards.get(req.url) || demo);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await launch(true);
    const cdp = browser.cdp;
    let extensionId;
    for (let i = 0; i < 100 && !extensionId; i++) {
      const { targetInfos } = await cdp.call('Target.getTargets');
      for (const target of targetInfos.filter(t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://') && t.url.endsWith('/background.js'))) {
        const { sessionId } = await cdp.call('Target.attachToTarget', { targetId: target.targetId, flatten: true });
        try {
          if (await cdp.eval(sessionId, 'globalThis.chrome?.runtime?.getManifest?.().name') === 'Personal Page Tweaker') extensionId = target.url.split('/')[2];
        } finally { await cdp.call('Target.detachFromTarget', { sessionId }); }
      }
      if (!extensionId) await delay(100);
    }
    if (!extensionId) throw new Error('Extension service worker did not load');
    const settings = await cdp.page('chrome://extensions/?id=' + extensionId);
    await cdp.wait(settings, 'typeof chrome.developerPrivate !== "undefined"');
    await cdp.eval(settings, 'chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true})');
    await cdp.eval(settings, `chrome.developerPrivate.addHostPermission(${JSON.stringify(extensionId)},'http://127.0.0.1/*')`);
    await cdp.eval(settings, `chrome.developerPrivate.updateExtensionConfiguration({extensionId:${JSON.stringify(extensionId)},userScriptsAccess:true})`);
    const options = await cdp.page(`chrome-extension://${extensionId}/options.html`);
    await cdp.wait(options, 'document.documentElement?.dataset.ready === "true"');
    if (!await cdp.eval(options, `PPS.permissionRequest('http://127.0.0.1/*')`)) throw new Error('Local demo permission was not granted');
    const css = 'body { background: #edf3ff; }\n\n.article {\n  font-size: 17px;\n  line-height: 1.9;\n  border-color: #c8d8fa;\n}\n\n.article h1 { color: #2457d6; }\n.promo { display: none; }';
    const js = 'const label = document.querySelector(".reading-badge");\nif (label) {\n  label.textContent = "自分仕様のページ";\n}';
    const status = await cdp.eval(options, `(async()=>{
      const style=PPS.normalizeStyle({id:'store-demo',name:'読書サイトを見やすく',enabled:true,site:{matchPattern:'http://127.0.0.1/*'},excludeMatches:['http://127.0.0.1/asset/*'],css:${JSON.stringify(css)},jsByRunAt:{document_idle:${JSON.stringify(js)}}});
      await PPS.mutate('save',{style});
      const stopped=PPS.normalizeStyle({...style,id:'store-paused',name:'小さな装飾',enabled:false,css:'a { text-underline-offset: 4px; }',jsByRunAt:{}});
      return PPS.mutate('save',{style:stopped});
    })()`);
    if (!status.userScriptsAvailable || status.errors.length || status.missingPermissions.length) throw new Error('Demo scripts unavailable: ' + JSON.stringify(status));
    await cdp.call('Page.navigate', { url: `chrome-extension://${extensionId}/options.html?id=store-demo` }, options);
    await cdp.wait(options, 'document.documentElement?.dataset.ready === "true"');
    const target = await cdp.page(origin + '/reading');
    await cdp.wait(target, `document.querySelector('.reading-badge')?.textContent === '自分仕様のページ'`);

    const metrics = (session, width, height) => cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, session);
    const capture = async (session, from, to = from) => {
      const clip = await cdp.eval(session, `(()=>{const a=document.querySelector(${JSON.stringify(from)}).getBoundingClientRect(),b=document.querySelector(${JSON.stringify(to)}).getBoundingClientRect();return {x:a.left+scrollX,y:a.top+scrollY,width:a.width,height:b.bottom-a.top,scale:1};})()`);
      return (await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip }, session)).data;
    };
    await metrics(target, 980, 720);
    const siteImage = (await cdp.call('Page.captureScreenshot', { format: 'png' }, target)).data;
    await metrics(options, 1024, 900);
    await cdp.eval(options, `document.getElementById('cssTab').click();document.activeElement.blur()`);
    const cssImage = await capture(options, '.code-tabs', '#cssPanel');
    await metrics(options, 1280, 740);
    await cdp.eval(options, `document.getElementById('jsTab').click();document.getElementById('jsIdleTab').click();document.activeElement.blur()`);
    const jsImage = await capture(options, '.js-timing-tabs', '#jsIdlePanel');
    await cdp.call('Page.bringToFront', {}, target);
    const popup = await cdp.page(`chrome-extension://${extensionId}/popup.html`, true);
    await metrics(popup, 360, 650);
    await cdp.wait(popup, `document.getElementById('currentHost').textContent === '127.0.0.1' && document.querySelectorAll('.style-row').length === 2`);
    const popupImage = await capture(popup, '.popup-shell', '#reloadButton');

    artboards.set('/asset/css', board('文字も余白も、自分の読みやすさに。', 'CSSを保存すると、開いているページにもすぐ反映。', `<div class="frames">${frame('CSSを書く', cssImage)}${frame('その場で確認', siteImage)}</div>`));
    artboards.set('/asset/js', board('JavaScriptは、タイミングごとに。', '切り替え式の広い編集欄。コードのあるタブには、小さな印。', `<div class="js-layout"><aside class="aside"><h2>3つのタイミングを<br>ひとつの設定に。</h2><p class="step"><strong>読み込み開始時</strong>DOMの構築前に実行</p><p class="step"><strong>DOM構築後</strong>ページの要素を操作</p><p class="step"><strong>読み込み後</strong>通常のコードはこちらへ</p></aside>${frame('JavaScript エディター', jsImage)}</div>`));
    artboards.set('/asset/controls', board('使うサイトだけに、必要な設定を。', 'サイトごとのアクセス許可。有効・停止も、ポップアップから。', `<div class="frames controls">${frame('このサイトの設定', popupImage)}${frame('カスタマイズしたサンプルページ', siteImage)}</div>`));
    artboards.set('/asset/small', promotion(440, 280));
    artboards.set('/asset/large', promotion(1400, 560));
    for (const [url, width, height, filename] of [
      ['/asset/css', 1280, 800, 'docs/assets/screenshots/01-css.png'],
      ['/asset/js', 1280, 800, 'docs/assets/screenshots/02-javascript.png'],
      ['/asset/controls', 1280, 800, 'docs/assets/screenshots/03-site-controls.png'],
      ['/asset/small', 440, 280, 'docs/assets/promotion_image/promotion_small.png'],
      ['/asset/large', 1400, 560, 'docs/assets/promotion_image/promotion_large.png'],
    ]) {
      const page = await cdp.page(origin + url);
      await metrics(page, width, height);
      await cdp.wait(page, 'document.readyState === "complete" && Array.from(document.images).every(image=>image.complete && image.naturalWidth>0)');
      await cdp.eval(page, 'document.fonts.ready.then(()=>true)');
      output(filename, (await cdp.call('Page.captureScreenshot', { format: 'png' }, page)).data);
    }
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections(); server.close();
  }
}

(async () => { await makeIcons(); await makeStoreImages(); })().catch(error => { console.error(error); process.exitCode = 1; });
