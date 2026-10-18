(() => {
  "use strict";
  if (globalThis.__personalPageStylerLoaded) { globalThis.__personalPageStylerApply?.(); return; }
  globalThis.__personalPageStylerLoaded = true;
  let generation = 0, styleElement = null, lastUrl = location.href;
  const remove = () => { styleElement?.remove(); styleElement = null; };
  async function applyStyles() {
    const current = ++generation;
    try {
      const response = await chrome.runtime.sendMessage({ type: PPS.MESSAGE_CSS, url: location.href });
      if (generation !== current) return;
      if (!response?.ok || !response.css) { remove(); return; }
      if (!document.documentElement) {
        document.addEventListener("DOMContentLoaded", applyStyles, { once: true });
        return;
      }
      if (!styleElement?.isConnected) {
        // Clean up the element left behind by the v1 extension on reload.
        document.getElementById(PPS.CONTENT_STYLE_ID)?.remove();
        styleElement = document.createElement("style");
        styleElement.id = PPS.CONTENT_STYLE_ID;
        (document.head || document.documentElement).append(styleElement);
      }
      styleElement.textContent = response.css;
    } catch { remove(); }
  }
  globalThis.__personalPageStylerApply = applyStyles;
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type !== PPS.MESSAGE_REFRESH) return false;
    applyStyles().then(() => respond({ ok: true }));
    return true;
  });
  const navigationTimer = setInterval(() => {
    if (!chrome.runtime?.id) { clearInterval(navigationTimer); remove(); return; }
    if (location.href !== lastUrl) { lastUrl = location.href; applyStyles(); }
  }, 750);
  addEventListener("pageshow", applyStyles);
  applyStyles();
})();
