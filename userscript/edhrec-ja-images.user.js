// ==UserScript==
// @name         EDHREC Japanese card image replacer
// @namespace    http://tampermonkey.net/
// @version      2026-06-01.4
// @description  EDHRECのカード画像を日本語画像へ自動で差し替え
// @author       You
// @match        https://edhrec.com/*
// @match        https://www.edhrec.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=edhrec.com
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function () {
  "use strict";
  var cache = Object.create(null);
  var queue = Promise.resolve();
  var lastRequestAt = 0;
  var skip = /^(archidekt|cardsphere|commander spellbook|crossword|edhrec|fabrec|multi|mtgstocks|moxfield|preview|scryfall|spellify)$/i;
  function clean(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }
  function fromSlug(href) {
    var path = String(href || "").split("?")[0].split("#")[0];
    var slug = path.split("/").filter(Boolean).pop() || "";
    return clean(decodeURIComponent(slug).replace(/\+/g, " ").replace(/-/g, " "));
  }
  function cardName(img) {
    var link = img.closest && img.closest('a[href*="/cards/"], a[href*="/commanders/"]');
    var raw = clean(img.getAttribute("alt") || img.getAttribute("title") || "");
    raw = raw.replace(/^image:\s*/i, "").replace(/\s+card image$/i, "");
    if ((!raw || skip.test(raw)) && link) raw = fromSlug(link.getAttribute("href"));
    return raw && !skip.test(raw) && /[a-z0-9]/i.test(raw) ? raw : "";
  }
  function imageUrl(card) {
    var face = card && card.card_faces && card.card_faces[0];
    var uris = card && (card.image_uris || (face && face.image_uris));
    return (uris && (uris.normal || uris.large || uris.small || uris.png)) || "";
  }
  function apiJson(url) {
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Scryfall HTTP " + res.status);
      return res.json();
    });
  }
  function throttled(task) {
    queue = queue.then(function () {
      var wait = Math.max(0, 250 - (Date.now() - lastRequestAt));
      return new Promise(function (resolve) {
        setTimeout(resolve, wait);
      }).then(function () {
        lastRequestAt = Date.now();
        return task();
      });
    });
    return queue;
  }
  function lookup(name) {
    var key = name.toLowerCase();
    if (cache[key] !== undefined) return Promise.resolve(cache[key]);
    return throttled(function () {
      var q = '!"' + name.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '" lang:ja';
      var url = "https://api.scryfall.com/cards/search?unique=prints&order=released&dir=desc&q=" + encodeURIComponent(q);
      return apiJson(url).then(function (body) {
        var cards = (body && body.data) || [];
        var card = cards.find(function (c) {
          return c.lang === "ja" && imageUrl(c);
        });
        cache[key] = card ? { src: imageUrl(card), name: card.printed_name || card.name || name } : null;
        return cache[key];
      });
    }).catch(function () {
      cache[key] = null;
      return null;
    });
  }
  function replace(img) {
    if (!img || img.dataset.edhrecJaDone) return;
    var linked = img.closest && img.closest('a[href*="/cards/"], a[href*="/commanders/"]');
    var source = img.currentSrc || img.src || img.getAttribute("data-src") || "";
    if (!linked && !/scryfall/i.test(source)) return;
    var name = cardName(img);
    if (!name) return;
    img.dataset.edhrecJaDone = "pending";
    lookup(name).then(function (hit) {
      if (!hit) { img.dataset.edhrecJaDone = "missing"; return; }
      img.src = hit.src;
      img.removeAttribute("srcset");
      img.setAttribute("data-src", hit.src);
      img.setAttribute("data-lazy-src", hit.src);
      img.alt = hit.name;
      img.title = name + " / " + hit.name;
      img.dataset.edhrecJaDone = "replaced";
    });
  }
  function scan() { document.querySelectorAll('a[href*="/cards/"] img, a[href*="/commanders/"] img, img[src*="scryfall"], img[data-src*="scryfall"]').forEach(replace); }
  scan();
  new MutationObserver(function () { setTimeout(scan, 250); }).observe(document.body, { childList: true, subtree: true });
})();
