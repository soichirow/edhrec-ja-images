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
  assert.match(source, /@version\s+2026-06-03\.4/);
  assert.match(source, /@description:ja\s+EDHREC のカード画像/);
  assert.match(source, /@author\s+soichirow/);
  assert.match(source, /@license\s+MIT/);
  assert.match(source, /@homepageURL\s+https:\/\/github\.com\/soichirow\/edhrec-ja-images/);
  assert.match(source, /@supportURL\s+https:\/\/github\.com\/soichirow\/edhrec-ja-images\/issues/);
  assert.doesNotMatch(source.split(/\r?\n/).slice(0, 12).join("\n"), /SAFE/);
});

test("userscript logs its installed version for diagnostics", () => {
  assert.match(source, /const SCRIPT_VERSION = "2026-06-03\.4"/);
  assert.match(source, /console\.info\("\[EDHREC JA Images\] version " \+ SCRIPT_VERSION\)/);
});

test("userscript skips known EDHREC non-card titles", () => {
  assert.match(source, /the hobbit/);
  assert.match(source, /marvel super heroes/);
  assert.ok(source.includes('name.indexOf(" // ")'));
});

test("userscript coalesces duplicate lookups", () => {
  assert.match(source, /const pending = \{\}/);
  assert.match(source, /if \(pending\[key\]\)/);
});

test("userscript keeps persistent cache and rate limit safeguards", () => {
  assert.match(source, /localStorage\.setItem\(CACHE_KEY/);
  assert.match(source, /const REQUEST_GAP = 110/);
  assert.match(source, /const RETRY_AFTER_FALLBACK = 10000/);
  assert.match(source, /const MAX_API_RETRIES = 2/);
  assert.match(source, /function throttledApiJson/);
  assert.match(source, /function retryableApiError/);
  assert.match(source, /function apiRetryDelay/);
  assert.match(source, /res\.status === 429/);
  assert.match(source, /function retryAfterMs/);
  assert.match(source, /headers\.get\("Retry-After"\)/);
  assert.match(source, /queue = run\.catch\(function \(\) \{\}\)/);
  assert.match(source, /fetch\(url, \{ headers: API_HEADERS \}\)/);
});

test("userscript uses const and let instead of var", () => {
  assert.match(source, /const CACHE_KEY/);
  assert.match(source, /let queue = Promise\.resolve\(\)/);
  assert.doesNotMatch(source, /\bvar\b/);
});

test("userscript prefetches card links and renders Japanese Scryfall links", () => {
  assert.match(source, /function prefetchLinks/);
  assert.match(source, /MAX_PREFETCH_PER_SCAN/);
  assert.match(source, /showScryfallLink/);
  assert.match(source, /hit\.scryfall/);
});

test("userscript falls back to English Scryfall cards when Japanese prints are missing", () => {
  assert.match(source, /searchRegularPrint\(name, "ja"\)/);
  assert.match(source, /searchRegularPrint\(name, "en"\)/);
  assert.match(source, /function hitFromCard/);
  assert.match(source, /CACHE_KEY = "edhrec-ja-image-cache-v2"/);
});

test("userscript can resolve unlinked commander images from Scryfall image IDs", () => {
  assert.match(source, /function scryfallIdOfImage/);
  assert.match(source, /function getByScryfallId/);
  assert.match(source, /api\.scryfall\.com\/cards\//);
  assert.match(source, /name \? getJapanese\(name\) : getByScryfallId\(scryfallId\)/);
});

test("userscript preloads Japanese image URLs while leaving original images visible", () => {
  assert.match(source, /const MAX_IMAGE_PRELOAD_PER_SCAN = 40/);
  assert.match(source, /function preloadImage/);
  assert.match(source, /new Image\(\)/);
  assert.match(source, /preloadImage\(hit\.src\)/);
  assert.match(source, /img\.dataset\.edhrecJaState = "pending"/);
  assert.doesNotMatch(source, /読み込み中|Loading/);
});

test("userscript renders store search links without embedded affiliate parameters", () => {
  assert.match(source, /function shopLinks/);
  assert.match(source, /function renderShopLinks/);
  assert.match(source, /hareruyamtg\.com/);
  assert.match(source, /https:\/\/www\.bigweb\.co\.jp\/ja\/products\/mtg\/list/);
  assert.match(source, /"name", englishName/);
  assert.match(source, /singlestar\.jp/);
  assert.match(source, /https:\/\/tokyomtg\.com\/cardpage\.html/);
  assert.match(source, /"query", englishName/);
  assert.match(source, /searchParams\.set\("p", "q"\)/);
  assert.match(source, /jp\.mercari\.com\/search/);
  assert.match(source, /edhrec-ja-shop-link/);
  assert.doesNotMatch(source, /utm_|affiliate|ambassador|afid|a_id/i);
});

test("userscript renders controls below the card image for readability", () => {
  assert.match(source, /function prepareOverlayHost/);
  assert.match(source, /function insertControlBox/);
  assert.match(source, /function controlScope/);
  assert.match(source, /function edhrecCardContainer/);
  assert.match(source, /function hasEdhrecCardText/);
  assert.match(source, /function metadataSiblingAfter/);
  assert.match(source, /cardContainer\.appendChild\(box\)/);
  assert.match(source, /after\.parentNode\.insertBefore\(box, after\.nextSibling\)/);
  assert.doesNotMatch(source, /style\.overflow/);
  assert.doesNotMatch(source, /position:absolute/);
  assert.doesNotMatch(source, /function positionOverlayBox/);
});

test("userscript skips non-card-shaped thumbnails", () => {
  assert.match(source, /function isCardLikeImage/);
  assert.match(source, /getBoundingClientRect/);
  assert.match(source, /isCardLikeImage\(img\)/);
});

test("userscript skips unsupported landscape-oriented Scryfall layouts", () => {
  assert.match(source, /function isUnsupportedLayout/);
  assert.match(source, /battle\|planar\|scheme\|vanguard/);
  assert.match(source, /function canReplaceImage/);
  assert.match(source, /!isUnsupportedLayout\(hit && hit\.layout\)/);
  assert.match(source, /layout: card\.layout \|\| ""/);
  assert.match(source, /img\.dataset\.edhrecJaState = "skipped"/);
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
  assert.match(source, /stripReading\(card\.printed_name/);
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
