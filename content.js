(function () {
  "use strict";

  if (globalThis.__personalPageStylerLoaded) {
    if (typeof globalThis.__personalPageStylerApply === "function") {
      globalThis.__personalPageStylerApply();
    }
    return;
  }

  globalThis.__personalPageStylerLoaded = true;

  function sanitizeComment(value) {
    return String(value || "").replace(/\*\//g, "* /");
  }

  function getStyleElement() {
    let element = document.getElementById(PPS.CONTENT_STYLE_ID);
    if (!element) {
      element = document.createElement("style");
      element.id = PPS.CONTENT_STYLE_ID;
      element.setAttribute("data-owner", PPS.APP_ID);
      (document.head || document.documentElement).appendChild(element);
    }

    return element;
  }

  function removeStyleElement() {
    const element = document.getElementById(PPS.CONTENT_STYLE_ID);
    if (element) {
      element.remove();
    }
  }

  async function applyStyles() {
    if (!PPS.isHttpUrl(location.href)) {
      removeStyleElement();
      return;
    }

    const styles = await PPS.getStyles();
    const matchingCss = styles
      .filter((style) => PPS.styleMatchesUrl(style, location.href))
      .map((style) => `/* ${sanitizeComment(style.name)} */\n${style.css.trim()}`)
      .filter((css) => css.trim());

    if (matchingCss.length === 0) {
      removeStyleElement();
      return;
    }

    getStyleElement().textContent = matchingCss.join("\n\n");
  }

  globalThis.__personalPageStylerApply = applyStyles;

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[PPS.STORAGE_KEY]) {
      applyStyles();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== PPS.MESSAGE_REFRESH) {
      return false;
    }

    applyStyles()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  });

  applyStyles();
})();
