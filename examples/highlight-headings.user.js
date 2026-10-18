// ==UserScript==
// @name         見出しに印を付けるサンプル
// @match        https://example.com/*
// @grant        GM_addStyle
// @run-at       document-idle
// @noframes
// ==/UserScript==

GM_addStyle('h1 { border-left: 5px solid #2457d6; padding-left: 12px; }');
const heading = document.querySelector('h1');
if (heading) heading.textContent += ' ★';
