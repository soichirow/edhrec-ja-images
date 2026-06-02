const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "userscript", "edhrec-ja-images.user.js");
const source = fs.readFileSync(scriptPath, "utf8");

test("userscript parses as JavaScript", () => {
  assert.doesNotThrow(() => new vm.Script(source));
});

test("userscript uses direct replacement without hover or GM APIs", () => {
  assert.match(source, /img\.src = hit\.src/);
  assert.doesNotMatch(source, /mouseenter|mouseover|GM_xmlhttpRequest/);
});

test("userscript has public distribution metadata", () => {
  assert.match(source, /@name:ja\s+EDHREC 日本語カード画像差し替え/);
  assert.match(source, /@namespace\s+https:\/\/github\.com\/soichirow\/edhrec-ja-images/);
  assert.match(source, /@description:ja\s+EDHREC のカード画像/);
  assert.match(source, /@author\s+soichirow/);
  assert.match(source, /@license\s+MIT/);
  assert.match(source, /@homepageURL\s+https:\/\/github\.com\/soichirow\/edhrec-ja-images/);
  assert.match(source, /@supportURL\s+https:\/\/github\.com\/soichirow\/edhrec-ja-images\/issues/);
  assert.doesNotMatch(source.split(/\r?\n/).slice(0, 12).join("\n"), /SAFE/);
});

test("userscript skips known EDHREC non-card titles", () => {
  assert.match(source, /the hobbit/);
  assert.match(source, /marvel super heroes/);
  assert.ok(source.includes('name.indexOf(" // ")'));
});

test("userscript coalesces duplicate lookups", () => {
  assert.match(source, /var pending = \{\}/);
  assert.match(source, /if \(pending\[key\]\)/);
});

test("userscript keeps persistent cache and rate limit safeguards", () => {
  assert.match(source, /localStorage\.setItem\(CACHE_KEY/);
  assert.match(source, /var REQUEST_GAP = 110/);
  assert.match(source, /var RETRY_AFTER_FALLBACK = 10000/);
  assert.match(source, /res\.status === 429/);
  assert.match(source, /function retryAfterMs/);
  assert.match(source, /headers\.get\("Retry-After"\)/);
  assert.match(source, /queue = run\.catch\(function \(\) \{\}\)/);
  assert.match(source, /fetch\(url, \{ headers: API_HEADERS \}\)/);
});

test("userscript prefetches card links and renders Japanese Scryfall links", () => {
  assert.match(source, /function prefetchLinks/);
  assert.match(source, /MAX_PREFETCH_PER_SCAN/);
  assert.match(source, /showScryfallLink/);
  assert.match(source, /hit\.scryfall/);
});

test("userscript renders controls as overlay without changing card flow", () => {
  assert.match(source, /function prepareOverlayHost/);
  assert.match(source, /position:absolute/);
  assert.match(source, /host\.appendChild\(box\)/);
  assert.doesNotMatch(source, /insertBefore\(box, host\.nextSibling\)/);
});

test("userscript uses modern button and panel styling", () => {
  assert.match(source, /function injectStyles/);
  assert.match(source, /edhrec-ja-name-button/);
  assert.match(source, /edhrec-ja-chip-button/);
  assert.match(source, /edhrec-ja-star-button/);
  assert.match(source, /border-radius:999px/);
  assert.match(source, /backdrop-filter:blur/);
  assert.match(source, /transition:transform/);
});

test("userscript avoids special art and offers Japanese-name copy", () => {
  assert.match(source, /function isRegularArt/);
  assert.match(source, /borderless/);
  assert.match(source, /showcase\|extendedart/);
  assert.match(source, /copyText\(box\.dataset\.jaLabel\)/);
  assert.match(source, /function fallbackCopyText/);
  assert.match(source, /\.catch\(function \(\) \{\s+return fallbackCopyText\(value\);/);
  assert.match(source, /コピー/);
});

test("userscript strips Japanese reading annotations before display and copy", () => {
  assert.match(source, /function stripReading/);
  assert.match(source, /stripReading\(found\.printed_name/);
  assert.match(source, /\[一-龯々\]/);
});

test("userscript stores favorites and renders a favorites panel", () => {
  assert.match(source, /FAVORITES_KEY/);
  assert.match(source, /function toggleFavorite/);
  assert.match(source, /function renderFavorites/);
  assert.match(source, /function updateInlineFavoriteButtons/);
  assert.match(source, /全部コピー/);
  assert.match(source, /★ お気に入り/);
});
