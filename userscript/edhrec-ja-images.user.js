// ==UserScript==
// @name         EDHREC Japanese card image replacer
// @name:ja      EDHREC 日本語カード画像差し替え
// @namespace    https://github.com/soichirow/edhrec-ja-images
// @version      2026-06-02.11
// @description  Replace EDHREC card images with Japanese Scryfall images
// @description:ja EDHREC のカード画像を Scryfall の日本語印刷版画像に差し替え、日本語名コピーとお気に入り管理を追加します
// @author       soichirow
// @license      MIT
// @match        https://edhrec.com/*
// @match        https://www.edhrec.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=edhrec.com
// @homepageURL  https://github.com/soichirow/edhrec-ja-images
// @supportURL   https://github.com/soichirow/edhrec-ja-images/issues
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function () {
  "use strict";

  const CACHE_KEY = "edhrec-ja-image-cache-v1";
  const FAVORITES_KEY = "edhrec-ja-image-favorites-v1";
  const STYLE_ID = "edhrec-ja-image-style";
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
  const REQUEST_GAP = 110;
  const RETRY_AFTER_FALLBACK = 10000;
  const MAX_PREFETCH_PER_SCAN = 80;
  const MAX_IMAGE_PRELOAD_PER_SCAN = 40;
  const MAX_CACHE_ENTRIES = 800;
  const API_HEADERS = { Accept: "application/json;q=0.9,*/*;q=0.8" };
  const imageSelector = 'a[href*="/cards/"] img, a[href*="/commanders/"] img, img[src*="scryfall"], img[data-src*="scryfall"]';
  const linkSelector = 'a[href*="/cards/"], a[href*="/commanders/"]';
  const skipTitle = /^(abstract performance|expansion algorithm|marvel super heroes|planar engineering|reality fracture|secret lair drop|secrets of strixhaven|teenage mutant ninja turtles|the hobbit)$/i;
  const skipWord = /^(archidekt|cardsphere|commander spellbook|crossword|edhrec|fabrec|multi|mtgstocks|moxfield|preview|scryfall|spellify)$/i;
  const cache = readCache();
  const favorites = readFavorites();
  const pending = {};
  const preloadedImages = {};
  let favoriteDock = null;
  let queue = Promise.resolve();
  let last = 0;

  function text(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function fromHref(href) {
    const path = String(href || "").split("?")[0].split("#")[0];
    let slug = path.split("/").filter(Boolean).pop() || "";
    try {
      slug = decodeURIComponent(slug);
    } catch (error) {}
    return text(slug.replace(/\+/g, " ").replace(/-/g, " "));
  }

  function normalizeName(name) {
    name = text(name).replace(/^image:\s*/i, "").replace(/\s+card image$/i, "");
    if (!name || name.indexOf(" // ") !== -1 || skipWord.test(name) || skipTitle.test(name)) {
      return "";
    }
    return /[a-z0-9]/i.test(name) ? name : "";
  }

  function stripReading(name) {
    return text(name).replace(/([一-龯々])（[ぁ-ゖァ-ヺー]+）/g, "$1");
  }

  function nameOfLink(link) {
    return normalizeName(link.getAttribute("aria-label") || link.getAttribute("title") || link.textContent || fromHref(link.getAttribute("href")));
  }

  function nameOfImage(img) {
    const link = img.closest ? img.closest(linkSelector) : null;
    return normalizeName(img.getAttribute("alt") || img.getAttribute("title")) || (link ? nameOfLink(link) : "");
  }

  function cardImage(card) {
    let uris = card && card.image_uris;
    if (!uris && card && card.card_faces && card.card_faces[0]) {
      uris = card.card_faces[0].image_uris;
    }
    return uris ? uris.normal || uris.large || uris.small || uris.png || "" : "";
  }

  function isRegularArt(card) {
    const effects = card && card.frame_effects ? card.frame_effects.join(" ") : "";
    const promos = card && card.promo_types ? card.promo_types.join(" ") : "";
    if (!card) return false;
    if (card.digital || card.full_art || card.textless || card.oversized || card.variation) return false;
    if (card.border_color === "borderless") return false;
    if (/\b(showcase|extendedart|etched|inverted)\b/i.test(effects)) return false;
    if (/\b(boosterfun|serialized|promopack|gameday|storechampionship|judgegift|convention|event)\b/i.test(promos)) return false;
    return true;
  }

  function fresh(key) {
    const hit = cache[key];
    if (!hit) return false;
    if (Date.now() - hit.time > CACHE_TTL) {
      delete cache[key];
      writeCache();
      return false;
    }
    return true;
  }

  function remember(key, value) {
    cache[key] = { time: Date.now(), value: value || null };
    pruneCache();
    writeCache();
    return cache[key].value;
  }

  function getJapanese(name) {
    const key = name.toLowerCase();
    if (fresh(key)) return Promise.resolve(cache[key].value);
    if (pending[key]) return pending[key];
    pending[key] = throttled(function () {
      const query = '!"' + name.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '" lang:ja';
      const url = "https://api.scryfall.com/cards/search?unique=prints&order=released&dir=desc&q=" + encodeURIComponent(query);
      return apiJson(url).then(function (body) {
        const list = body && body.data ? body.data : [];
        const found = list.find(function (card) {
          return card.lang === "ja" && cardImage(card) && isRegularArt(card);
        });
        return remember(key, found ? { src: cardImage(found), label: stripReading(found.printed_name || found.name || name), scryfall: found.scryfall_uri || "" } : null);
      });
    }).catch(function () {
      return null;
    }).finally(function () {
      delete pending[key];
    });
    return pending[key];
  }

  function apiJson(url) {
    return fetch(url, { headers: API_HEADERS }).then(function (res) {
      if (res.status === 404) return null;
      if (res.status === 429) {
        last = Date.now() + retryAfterMs(res);
        throw new Error("Scryfall HTTP 429");
      }
      if (!res.ok) throw new Error("Scryfall HTTP " + res.status);
      return res.json();
    });
  }

  function retryAfterMs(res) {
    const value = res && res.headers && res.headers.get ? res.headers.get("Retry-After") : "";
    const seconds = Number(value);
    let date;
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
    date = Date.parse(value);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
    return RETRY_AFTER_FALLBACK;
  }

  function throttled(task) {
    const run = queue.catch(function () {}).then(function () {
      const wait = Math.max(0, REQUEST_GAP - (Date.now() - last));
      return new Promise(function (resolve) {
        setTimeout(resolve, wait);
      }).then(function () {
        last = Date.now();
        return task();
      });
    });
    queue = run.catch(function () {});
    return run;
  }

  function preloadImage(src) {
    if (!src || preloadedImages[src]) return;
    const image = new Image();
    preloadedImages[src] = image;
    image.decoding = "async";
    image.loading = "eager";
    image.onload = image.onerror = function () {
      preloadedImages[src] = "done";
    };
    image.src = src;
  }

  function prefetchLinks() {
    let count = 0;
    let imageCount = 0;
    Array.prototype.forEach.call(document.querySelectorAll(linkSelector), function (link) {
      if (count >= MAX_PREFETCH_PER_SCAN || link.dataset.edhrecJaPrefetch) return;
      const name = nameOfLink(link);
      if (!name) return;
      link.dataset.edhrecJaPrefetch = "1";
      count += 1;
      getJapanese(name).then(function (hit) {
        if (!hit || !hit.src || imageCount >= MAX_IMAGE_PRELOAD_PER_SCAN) return;
        imageCount += 1;
        preloadImage(hit.src);
      });
    });
  }

  function replaceOne(img) {
    if (!img || img.dataset.edhrecJaState) return;
    const link = img.closest ? img.closest(linkSelector) : null;
    const src = img.currentSrc || img.src || img.getAttribute("data-src") || "";
    if (!link && !/scryfall/i.test(src)) return;
    const name = nameOfImage(img);
    if (!name) return;
    img.dataset.edhrecJaState = "pending";
    getJapanese(name).then(function (hit) {
      if (!hit) {
        img.dataset.edhrecJaState = "missing";
        return;
      }
      preloadImage(hit.src);
      img.src = hit.src;
      img.removeAttribute("srcset");
      img.setAttribute("data-src", hit.src);
      img.setAttribute("data-lazy-src", hit.src);
      img.alt = hit.label;
      img.title = name + " / " + hit.label;
      img.dataset.edhrecJaState = "replaced";
      showScryfallLink(img, name, hit);
    });
  }

  function shopSearchUrl(base, queryKey, queryValue) {
    const url = new URL(base);
    url.searchParams.set(queryKey, queryValue);
    return url.toString();
  }

  function shopLinks(englishName, jaLabel) {
    const query = jaLabel || englishName;
    return [
      { label: "晴", title: "晴れる屋", url: shopSearchUrl("https://www.hareruyamtg.com/ja/products/search", "product", query) },
      { label: "BM", title: "BIG MAGIC", url: shopSearchUrl("https://www.bigweb.co.jp/ja/products/mtg", "freeword", query) },
      { label: "SS", title: "シングルスター", url: shopSearchUrl("https://www.singlestar.jp/product-list", "keyword", query) },
      { label: "東", title: "東京MTG", url: shopSearchUrl("https://tokyomtg.com/search.html", "keyword", englishName) },
      { label: "メ", title: "メルカリ", url: shopSearchUrl("https://jp.mercari.com/search", "keyword", query) },
    ];
  }

  function renderShopLinks(row, englishName, jaLabel) {
    if (!row) return;
    row.textContent = "";
    shopLinks(englishName, jaLabel).forEach(function (shop) {
      const link = document.createElement("a");
      link.href = shop.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = shop.label;
      link.title = shop.title + "で検索";
      link.className = "edhrec-ja-shop-link";
      link.addEventListener("click", function (event) {
        event.stopPropagation();
      });
      row.appendChild(link);
    });
  }

  function showScryfallLink(img, englishName, hit) {
    const host = (img.closest && img.closest(linkSelector)) || img;
    if (!host || !hit.scryfall) return;
    ensureFavoriteDock();
    injectStyles();
    prepareOverlayHost(host);
    let box = host.querySelector('[data-edhrec-ja-box="' + cssEscape(englishName) + '"]');
    let actionRow;
    let shopRow;
    let label;
    let copy;
    let favorite;
    if (!box) {
      box = document.createElement("span");
      box.dataset.edhrecJaBox = englishName;
      box.className = "edhrec-ja-overlay";
      actionRow = document.createElement("span");
      actionRow.className = "edhrec-ja-action-row";
      shopRow = document.createElement("span");
      shopRow.className = "edhrec-ja-shop-row";
      label = document.createElement("button");
      label.type = "button";
      label.className = "edhrec-ja-name-button";
      label.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        window.open(box.dataset.scryfall, "_blank", "noopener,noreferrer");
      });
      copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "コピー";
      copy.className = "edhrec-ja-chip-button";
      copy.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        copyText(box.dataset.jaLabel).then(function (ok) {
          copy.textContent = ok ? "コピー済み" : "失敗";
          setTimeout(function () {
            copy.textContent = "コピー";
          }, 1200);
        });
      });
      favorite = document.createElement("button");
      favorite.type = "button";
      favorite.title = "お気に入り";
      favorite.className = "edhrec-ja-star-button";
      favorite.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite({
          english: box.dataset.englishName,
          label: box.dataset.jaLabel,
          scryfall: box.dataset.scryfall,
          src: box.dataset.imageSrc,
        });
        updateFavoriteButton(favorite, box.dataset.englishName);
        renderFavorites();
      });
      actionRow.appendChild(label);
      actionRow.appendChild(copy);
      actionRow.appendChild(favorite);
      box.appendChild(actionRow);
      box.appendChild(shopRow);
      host.appendChild(box);
    } else {
      actionRow = box.querySelector(".edhrec-ja-action-row");
      shopRow = box.querySelector(".edhrec-ja-shop-row");
      label = box.querySelector(".edhrec-ja-name-button");
      copy = box.querySelector(".edhrec-ja-chip-button");
      favorite = box.querySelector("button[title='お気に入り']");
      if (!actionRow) {
        actionRow = document.createElement("span");
        actionRow.className = "edhrec-ja-action-row";
        if (label) actionRow.appendChild(label);
        if (copy) actionRow.appendChild(copy);
        if (favorite) actionRow.appendChild(favorite);
        box.insertBefore(actionRow, box.firstChild);
      }
      if (!shopRow) {
        shopRow = document.createElement("span");
        shopRow.className = "edhrec-ja-shop-row";
        box.appendChild(shopRow);
      }
    }
    box.dataset.englishName = englishName;
    box.dataset.jaLabel = hit.label;
    box.dataset.scryfall = hit.scryfall;
    box.dataset.imageSrc = hit.src;
    label.textContent = hit.label;
    renderShopLinks(shopRow, englishName, hit.label);
    positionOverlayBox(box, host, img);
    updateFavoriteButton(favorite, englishName);
  }

  function prepareOverlayHost(host) {
    const style = window.getComputedStyle ? window.getComputedStyle(host) : null;
    if (!host.style.position || host.style.position === "static") {
      host.style.position = "relative";
    }
    if (style && style.display === "inline") {
      host.style.display = "inline-block";
    }
    host.style.overflow = host.style.overflow || "hidden";
  }

  function positionOverlayBox(box, host, img) {
    if (!box || !host || !img || !host.getBoundingClientRect || !img.getBoundingClientRect) return;
    const hostRect = host.getBoundingClientRect();
    const imageRect = img.getBoundingClientRect();
    const lowerContent = Math.max(0, Math.round(hostRect.bottom - imageRect.bottom));
    box.style.bottom = Math.max(6, lowerContent + 6) + "px";
  }

  function fallbackCopyText(value) {
    let ok = false;
    const selection = document.getSelection && document.getSelection();
    const ranges = [];
    if (selection) {
      for (let index = 0; index < selection.rangeCount; index += 1) {
        ranges.push(selection.getRangeAt(index));
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    textarea.remove();
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach(function (range) {
        selection.addRange(range);
      });
    }
    return ok;
  }

  function copyText(value) {
    value = text(value);
    if (!value) return Promise.resolve(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value).then(function () {
        return true;
      }).catch(function () {
        return fallbackCopyText(value);
      });
    }
    return Promise.resolve(fallbackCopyText(value));
  }

  function favoriteKey(englishName) {
    return text(englishName).toLowerCase();
  }

  function toggleFavorite(card) {
    const key = favoriteKey(card.english);
    if (!key) return;
    if (favorites[key]) {
      delete favorites[key];
    } else {
      favorites[key] = {
        english: card.english,
        label: card.label,
        scryfall: card.scryfall,
        src: card.src,
        time: Date.now(),
      };
    }
    writeFavorites();
  }

  function updateFavoriteButton(button, englishName) {
    if (!button) return;
    const on = Boolean(favorites[favoriteKey(englishName)]);
    button.textContent = on ? "★" : "☆";
    button.classList.toggle("is-active", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function ensureFavoriteDock() {
    if (favoriteDock || !document.body) return;
    injectStyles();
    favoriteDock = {
      open: false,
      root: document.createElement("div"),
      button: document.createElement("button"),
      panel: document.createElement("div"),
    };
    favoriteDock.root.className = "edhrec-ja-dock";
    favoriteDock.button.type = "button";
    favoriteDock.button.className = "edhrec-ja-dock-button";
    favoriteDock.panel.className = "edhrec-ja-favorites-panel";
    favoriteDock.button.addEventListener("click", function () {
      favoriteDock.open = !favoriteDock.open;
      renderFavorites();
    });
    favoriteDock.root.appendChild(favoriteDock.panel);
    favoriteDock.root.appendChild(favoriteDock.button);
    document.body.appendChild(favoriteDock.root);
    renderFavorites();
  }

  function favoriteList() {
    return Object.keys(favorites).map(function (key) {
      return favorites[key];
    }).sort(function (a, b) {
      return (b.time || 0) - (a.time || 0);
    });
  }

  function renderFavorites() {
    ensureFavoriteDock();
    const list = favoriteList();
    favoriteDock.button.textContent = "★ お気に入り " + list.length;
    favoriteDock.panel.style.display = favoriteDock.open ? "block" : "none";
    favoriteDock.panel.textContent = "";
    if (!favoriteDock.open) return;
    const actions = document.createElement("div");
    actions.className = "edhrec-ja-panel-actions";
    const copyAll = document.createElement("button");
    copyAll.type = "button";
    copyAll.textContent = "全部コピー";
    copyAll.className = "edhrec-ja-panel-button";
    copyAll.addEventListener("click", function () {
      copyText(list.map(function (card) { return card.label; }).join("\n")).then(function (ok) {
        copyAll.textContent = ok ? "コピー済み" : "失敗";
        setTimeout(function () {
          copyAll.textContent = "全部コピー";
        }, 1200);
      });
    });
    actions.appendChild(copyAll);
    favoriteDock.panel.appendChild(actions);
    if (!list.length) {
      favoriteDock.panel.appendChild(document.createTextNode("お気に入りはまだありません。"));
      return;
    }
    list.forEach(function (card) {
      const row = document.createElement("div");
      const link = document.createElement("a");
      const remove = document.createElement("button");
      row.className = "edhrec-ja-favorite-row";
      link.href = card.scryfall;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = card.label;
      link.className = "edhrec-ja-favorite-link";
      remove.type = "button";
      remove.textContent = "削除";
      remove.className = "edhrec-ja-remove-button";
      remove.addEventListener("click", function () {
        delete favorites[favoriteKey(card.english)];
        writeFavorites();
        updateInlineFavoriteButtons();
        renderFavorites();
      });
      row.appendChild(link);
      row.appendChild(remove);
      favoriteDock.panel.appendChild(row);
    });
  }

  function scan() {
    injectStyles();
    ensureFavoriteDock();
    prefetchLinks();
    Array.prototype.forEach.call(document.querySelectorAll(imageSelector), replaceOne);
    updateInlineFavoriteButtons();
  }

  function updateInlineFavoriteButtons() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-edhrec-ja-box]"), function (box) {
      updateFavoriteButton(box.querySelector("button[title='お気に入り']"), box.dataset.englishName);
    });
  }

  function readCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") || {};
    } catch (error) {
      return {};
    }
  }

  function writeCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error) {}
  }

  function readFavorites() {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "{}") || {};
    } catch (error) {
      return {};
    }
  }

  function writeFavorites() {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch (error) {}
  }

  function pruneCache() {
    const keys = Object.keys(cache);
    if (keys.length <= MAX_CACHE_ENTRIES) return;
    keys.sort(function (a, b) {
      return cache[a].time - cache[b].time;
    }).slice(0, keys.length - MAX_CACHE_ENTRIES).forEach(function (key) {
      delete cache[key];
    });
  }

  function cssEscape(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".edhrec-ja-overlay{position:absolute;left:6px;right:6px;bottom:6px;z-index:20;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;max-width:calc(100% - 12px);padding:5px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:linear-gradient(135deg,rgba(15,23,42,.92),rgba(30,41,59,.82));color:#fff;font-size:11px;line-height:1.2;box-shadow:0 10px 28px rgba(0,0,0,.34);backdrop-filter:blur(10px);pointer-events:auto;}",
      ".edhrec-ja-action-row{display:flex;align-items:center;gap:5px;width:100%;min-width:0;}",
      ".edhrec-ja-shop-row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;width:100%;}",
      ".edhrec-ja-shop-link{display:block;min-width:0;overflow:hidden;padding:3px 0;border:1px solid rgba(255,255,255,.2);border-radius:999px;background:rgba(255,255,255,.1);color:#e0f2fe;text-align:center;text-decoration:none;font-size:10px;font-weight:800;line-height:1.1;box-shadow:inset 0 1px 0 rgba(255,255,255,.08);}",
      ".edhrec-ja-shop-link:hover{background:rgba(14,165,233,.24);border-color:rgba(125,211,252,.55);color:#fff;}",
      ".edhrec-ja-name-button{min-width:0;flex:1 1 auto;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:3px 7px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(255,255,255,.1);color:#fff;text-align:left;text-decoration:none;font:inherit;font-weight:700;line-height:1.25;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.08);}",
      ".edhrec-ja-name-button:hover{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.28);}",
      ".edhrec-ja-name-button,.edhrec-ja-chip-button,.edhrec-ja-star-button,.edhrec-ja-shop-link,.edhrec-ja-panel-button,.edhrec-ja-remove-button,.edhrec-ja-dock-button{appearance:none;font:inherit;transition:transform .12s ease,box-shadow .12s ease,background .12s ease,border-color .12s ease;}",
      ".edhrec-ja-chip-button{flex:0 0 auto;padding:3px 8px;border:1px solid rgba(255,255,255,.56);border-radius:999px;background:rgba(255,255,255,.94);color:#1e293b;font-size:11px;font-weight:650;line-height:1.25;box-shadow:0 2px 8px rgba(0,0,0,.18);cursor:pointer;}",
      ".edhrec-ja-star-button{flex:0 0 auto;min-width:25px;height:22px;padding:0 6px;border:1px solid rgba(251,191,36,.72);border-radius:999px;background:rgba(255,251,235,.96);color:#92400e;font-size:13px;font-weight:800;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,.18);cursor:pointer;}",
      ".edhrec-ja-star-button.is-active{background:linear-gradient(135deg,#f59e0b,#facc15);border-color:#fde68a;color:#451a03;}",
      ".edhrec-ja-name-button:hover,.edhrec-ja-chip-button:hover,.edhrec-ja-star-button:hover,.edhrec-ja-shop-link:hover,.edhrec-ja-panel-button:hover,.edhrec-ja-remove-button:hover,.edhrec-ja-dock-button:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(15,23,42,.18);}",
      ".edhrec-ja-dock{position:fixed;right:14px;bottom:14px;z-index:2147483647;font-family:system-ui,sans-serif;}",
      ".edhrec-ja-dock-button{padding:9px 13px;border:1px solid rgba(245,158,11,.45);border-radius:999px;background:linear-gradient(135deg,#fff7ed,#fffbeb);color:#78350f;font-size:13px;font-weight:750;box-shadow:0 12px 34px rgba(15,23,42,.2);cursor:pointer;}",
      ".edhrec-ja-favorites-panel{display:none;width:320px;max-height:46vh;overflow:auto;margin-bottom:10px;padding:12px;border:1px solid rgba(148,163,184,.38);border-radius:12px;background:rgba(255,255,255,.96);color:#0f172a;box-shadow:0 20px 54px rgba(15,23,42,.24);backdrop-filter:blur(10px);font-size:12px;}",
      ".edhrec-ja-panel-actions{display:flex;gap:8px;margin-bottom:10px;}",
      ".edhrec-ja-panel-button{padding:5px 9px;border:1px solid #cbd5e1;border-radius:999px;background:#f8fafc;color:#0f172a;font-size:12px;font-weight:650;cursor:pointer;}",
      ".edhrec-ja-favorite-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:8px 0;border-top:1px solid #e2e8f0;}",
      ".edhrec-ja-favorite-link{color:#1d4ed8;text-decoration:none;overflow-wrap:anywhere;font-weight:650;}",
      ".edhrec-ja-favorite-link:hover{text-decoration:underline;}",
      ".edhrec-ja-remove-button{padding:4px 8px;border:1px solid #fecaca;border-radius:999px;background:#fff1f2;color:#991b1b;font-size:12px;font-weight:650;cursor:pointer;}"
    ].join("");
    document.head.appendChild(style);
  }

  scan();
  new MutationObserver(function () {
    setTimeout(scan, 300);
  }).observe(document.body, { childList: true, subtree: true });
})();
