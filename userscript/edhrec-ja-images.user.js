// ==UserScript==
// @name         EDHREC Japanese card image replacer
// @name:ja      EDHREC 日本語カード画像差し替え
// @namespace    https://github.com/soichirow/edhrec-ja-images
// @version      2026-06-04.3
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

  const CACHE_KEY = "edhrec-ja-image-cache-v2";
  const FAVORITES_KEY = "edhrec-ja-image-favorites-v1";
  const STYLE_ID = "edhrec-ja-image-style";
  const SCRIPT_VERSION = "2026-06-04.3";
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
  const REQUEST_GAP = 110;
  const RETRY_AFTER_FALLBACK = 10000;
  const FALLBACK_DELAY = 900;
  const MAX_PREFETCH_PER_SCAN = 80;
  const MAX_IMAGE_PRELOAD_PER_SCAN = 40;
  const MAX_CACHE_ENTRIES = 800;
  const MAX_API_RETRIES = 2;
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

  console.info("[EDHREC JA Images] version " + SCRIPT_VERSION);

  /**
   * @typedef {Object} CardHit
   * @property {string} src 置き換え先のカード画像URL。
   * @property {string} label 表示とコピーに使うカード名。日本語名がなければ英語名。
   * @property {string} scryfall Scryfallの個別カードページURL。
   * @property {string} english ショップ検索や重複判定に使う英語カード名。
   * @property {string} layout Scryfallのlayout値。横長カードの除外判定に使う。
   */

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

  /**
   * Scryfallの日本語printed_nameに入るふりがなを、表示とコピーで扱いやすい表記へ落とす。
   *
   * @param {string} name Scryfallから返ったカード名。
   * @returns {string} ふりがなを除いたカード名。
   */
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

  function scryfallIdOfImage(img) {
    const src = img ? img.currentSrc || img.src || img.getAttribute("data-src") || "" : "";
    const match = String(src).match(/cards\.scryfall\.io\/(?:small|normal|large|png)\/(?:front|back)\/[0-9a-f]\/[0-9a-f]\/([0-9a-f-]{36})/i);
    return match ? match[1] : "";
  }

  function faceIndexOfImage(img) {
    const src = img ? img.currentSrc || img.src || img.getAttribute("data-src") || "" : "";
    const match = String(src).match(/\/(front|back)\//i);
    return match && match[1].toLowerCase() === "back" ? 1 : 0;
  }

  function normalFaceIndex(faceIndex) {
    return faceIndex === 1 ? 1 : 0;
  }

  /**
   * 両面カードでは、EDHRECが裏面画像を表示しているときに裏面の名前と画像を選ぶ。
   *
   * @param {Object} card ScryfallのCardオブジェクト。
   * @param {number} faceIndex 0なら表面、1なら裏面。
   * @returns {Object|null} 対象面のcard_faces要素。
   */
  function cardFace(card, faceIndex) {
    const faces = card && card.card_faces ? card.card_faces : [];
    return faces[normalFaceIndex(faceIndex)] || faces[0] || null;
  }

  function cardImage(card, faceIndex) {
    const face = cardFace(card, faceIndex);
    let uris = card && card.image_uris;
    if (!uris && face) {
      uris = face.image_uris;
    }
    return uris ? uris.normal || uris.large || uris.small || uris.png || "" : "";
  }

  function isCardLikeImage(img) {
    const rect = img && img.getBoundingClientRect ? img.getBoundingClientRect() : null;
    const width = rect && rect.width ? rect.width : img.width || img.naturalWidth;
    const height = rect && rect.height ? rect.height : img.height || img.naturalHeight;
    let ratio;
    if (!width || !height) return true;
    if (width < 40 || height < 40) return false;
    ratio = width / height;
    return ratio >= 0.45 && ratio <= 0.95;
  }

  /**
   * 通常版に近い画像だけを候補に残す。ショーケース、拡張アート、プロモ系は
   * EDHREC上で期待する通常カード画像と見た目が離れやすいため避ける。
   *
   * @param {Object} card ScryfallのCardオブジェクト。
   * @returns {boolean} 通常版として扱える候補ならtrue。
   */
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

  function isUnsupportedLayout(layout) {
    return /^(battle|planar|scheme|vanguard)$/i.test(String(layout || ""));
  }

  function canReplaceImage(img, hit) {
    if (!isCardLikeImage(img)) return false;
    return !isUnsupportedLayout(hit && hit.layout);
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

  function cacheKeyForName(name, faceIndex) {
    return name.toLowerCase() + (normalFaceIndex(faceIndex) ? ":face:" + normalFaceIndex(faceIndex) : "");
  }

  /**
   * カード名から日本語印刷版を探し、必要に応じて英語通常版へフォールバックする。
   * pendingで同じカード名の同時検索をまとめ、cacheで再訪時のAPI通信を減らす。
   *
   * @param {string} name EDHRECから読み取った英語カード名。
   * @param {{fallback?: boolean, faceIndex?: number}=} options 検索方針。
   * @returns {Promise<CardHit|null>} 置き換えに使うカード情報。
   */
  function getJapanese(name, options) {
    options = options || {};
    const fallback = options.fallback !== false;
    const faceIndex = normalFaceIndex(options.faceIndex);
    const key = cacheKeyForName(name, faceIndex);
    const jaPendingKey = "ja:" + key;
    const pendingKey = fallback ? key : jaPendingKey;
    if (fresh(key)) return Promise.resolve(cache[key].value);
    if (!fallback && pending[key]) return pending[key];
    if (pending[pendingKey]) return pending[pendingKey];
    if (fallback && pending[jaPendingKey]) {
      pending[pendingKey] = pending[jaPendingKey].then(function (hit) {
        if (hit) return remember(key, hit);
        return fallbackEnglish(name, faceIndex).then(function (found) {
          return remember(key, found);
        });
      }).catch(function () {
        return null;
      }).finally(function () {
        delete pending[pendingKey];
      });
      return pending[pendingKey];
    }
    pending[pendingKey] = searchRegularPrint(name, "ja", faceIndex).then(function (found) {
      if (found) return hitFromCard(found, name, faceIndex);
      if (!fallback) return null;
      return fallbackEnglish(name, faceIndex);
    }).then(function (hit) {
      if (fallback || hit) return remember(key, hit);
      return hit;
    }).catch(function () {
      return null;
    }).finally(function () {
      delete pending[pendingKey];
    });
    return pending[pendingKey];
  }

  function fallbackEnglish(name, faceIndex) {
    return delay(FALLBACK_DELAY).then(function () {
      return searchRegularPrint(name, "en", faceIndex);
    }).then(function (found) {
      return found ? hitFromCard(found, name, faceIndex) : null;
    });
  }

  function getByScryfallId(id, faceIndex) {
    faceIndex = normalFaceIndex(faceIndex);
    const key = "id:" + String(id || "").toLowerCase() + (faceIndex ? ":face:" + faceIndex : "");
    if (!id) return Promise.resolve(null);
    if (fresh(key)) return Promise.resolve(cache[key].value);
    if (pending[key]) return pending[key];
    pending[key] = throttledApiJson("https://api.scryfall.com/cards/" + encodeURIComponent(id)).then(function (card) {
      if (!card || !card.name) return null;
      return getJapanese(card.name, { fallback: true, faceIndex: faceIndex }).then(function (hit) {
        return hit || hitFromCard(card, card.name, faceIndex);
      });
    }).then(function (hit) {
      return remember(key, hit);
    }).catch(function () {
      return null;
    }).finally(function () {
      delete pending[key];
    });
    return pending[key];
  }

  function hitFromCard(card, fallbackName, faceIndex) {
    const face = cardFace(card, faceIndex);
    return {
      src: cardImage(card, faceIndex),
      label: stripReading((face && face.printed_name) || card.printed_name || (face && face.name) || card.name || fallbackName),
      scryfall: card.scryfall_uri || "",
      english: (face && face.name) || card.name || fallbackName,
      layout: (face && face.layout) || card.layout || "",
    };
  }

  function searchRegularPrint(name, lang, faceIndex) {
    return throttledApiJson(scryfallSearchUrl(name, lang)).then(function (body) {
      const list = body && body.data ? body.data : [];
      return list.find(function (card) {
        return card.lang === lang && cardImage(card, faceIndex) && isRegularArt(card);
      }) || null;
    });
  }

  function scryfallSearchUrl(name, lang) {
    const query = '!"' + name.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '" lang:' + lang;
    return "https://api.scryfall.com/cards/search?unique=prints&order=released&dir=desc&q=" + encodeURIComponent(query);
  }

  /**
   * Scryfall APIを呼び出す薄い境界。429ではRetry-Afterを読み取り、後続キューの
   * 最短実行時刻も遅らせることで、同じページ内の連続アクセスを押し切らない。
   *
   * @param {string} url Scryfall APIのURL。
   * @returns {Promise<Object|null>} JSONレスポンス。404はnull。
   */
  function apiJson(url) {
    return fetch(url, { headers: API_HEADERS }).then(function (res) {
      if (res.status === 404) return null;
      if (res.status === 429) {
        const error = new Error("Scryfall HTTP 429");
        error.status = 429;
        error.retryAfterMs = retryAfterMs(res);
        last = Date.now() + error.retryAfterMs;
        throw error;
      }
      if (!res.ok) {
        const error = new Error("Scryfall HTTP " + res.status);
        error.status = res.status;
        throw error;
      }
      return res.json();
    });
  }

  /**
   * Scryfall APIへの呼び出しをthrottled経由にし、Retry-Afterまたは指数バックオフで
   * リトライ可能な失敗だけ遅延再試行する。
   *
   * @param {string} url Scryfall APIのURL。
   * @param {number=} attempt 現在の再試行回数。
   * @returns {Promise<Object|null>} JSONレスポンス。404はnull。
   */
  function throttledApiJson(url, attempt) {
    attempt = attempt || 0;
    return throttled(function () {
      return apiJson(url);
    }).catch(function (error) {
      if (attempt >= MAX_API_RETRIES || !retryableApiError(error)) throw error;
      return delay(apiRetryDelay(error, attempt)).then(function () {
        return throttledApiJson(url, attempt + 1);
      });
    });
  }

  function retryableApiError(error) {
    if (!error || !error.status) return true;
    return error.status === 429 || error.status >= 500;
  }

  function apiRetryDelay(error, attempt) {
    if (error && error.retryAfterMs) return error.retryAfterMs;
    return 1500 * Math.pow(2, attempt);
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
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

  /**
   * まだ画面外にあるカードリンクを軽く先読みする。日本語ヒットだけを探し、
   * 英語フォールバックは実表示時に任せてAPI負荷を抑える。
   */
  function prefetchLinks() {
    let count = 0;
    let imageCount = 0;
    Array.prototype.forEach.call(document.querySelectorAll(linkSelector), function (link) {
      if (count >= MAX_PREFETCH_PER_SCAN || link.dataset.edhrecJaPrefetch) return;
      const name = nameOfLink(link);
      if (!name) return;
      link.dataset.edhrecJaPrefetch = "1";
      count += 1;
      getJapanese(name, { fallback: false }).then(function (hit) {
        if (!hit || !hit.src || imageCount >= MAX_IMAGE_PRELOAD_PER_SCAN) return;
        imageCount += 1;
        preloadImage(hit.src);
      });
    });
  }

  /**
   * EDHREC上の1枚の画像を調べ、Scryfallの日本語画像または英語通常画像へ差し替える。
   * 画像がカード形でない場合や横長layoutの場合は、文字つぶれを避けるためスキップする。
   *
   * @param {HTMLImageElement} img 差し替え候補の画像。
   */
  function replaceOne(img) {
    if (!img || img.dataset.edhrecJaState) return;
    if (!isCardLikeImage(img)) return;
    const link = img.closest ? img.closest(linkSelector) : null;
    const src = img.currentSrc || img.src || img.getAttribute("data-src") || "";
    if (!link && !/scryfall/i.test(src)) return;
    const name = nameOfImage(img);
    const scryfallId = scryfallIdOfImage(img);
    const faceIndex = faceIndexOfImage(img);
    if (!name && !scryfallId) return;
    img.dataset.edhrecJaState = "pending";
    (name ? getJapanese(name, { fallback: true, faceIndex: faceIndex }) : getByScryfallId(scryfallId, faceIndex)).then(function (hit) {
      if (!hit) {
        img.dataset.edhrecJaState = "missing";
        return;
      }
      const englishName = hit.english || name || hit.label;
      if (!canReplaceImage(img, hit)) {
        img.dataset.edhrecJaState = "skipped";
        return;
      }
      preloadImage(hit.src);
      img.src = hit.src;
      img.removeAttribute("srcset");
      img.setAttribute("data-src", hit.src);
      img.setAttribute("data-lazy-src", hit.src);
      img.alt = hit.label;
      img.title = englishName + " / " + hit.label;
      img.dataset.edhrecJaState = "replaced";
      showScryfallLink(img, englishName, hit);
    });
  }

  function shopSearchUrl(base, queryKey, queryValue) {
    const url = new URL(base);
    url.searchParams.set(queryKey, queryValue);
    return url;
  }

  function shopLinks(englishName, jaLabel) {
    const query = jaLabel || englishName;
    const tokyoUrl = shopSearchUrl("https://tokyomtg.com/cardpage.html", "query", englishName);
    tokyoUrl.searchParams.set("p", "q");
    return [
      { label: "晴", title: "晴れる屋", url: shopSearchUrl("https://www.hareruyamtg.com/ja/products/search", "product", query) },
      { label: "BM", title: "BIG MAGIC", url: shopSearchUrl("https://www.bigweb.co.jp/ja/products/mtg/list", "name", englishName) },
      { label: "SS", title: "シングルスター", url: shopSearchUrl("https://www.singlestar.jp/product-list", "keyword", query) },
      { label: "東", title: "東京MTG", url: tokyoUrl },
      { label: "メ", title: "メルカリ", url: shopSearchUrl("https://jp.mercari.com/search", "keyword", query) },
    ];
  }

  function renderShopLinks(row, englishName, jaLabel) {
    if (!row) return;
    row.textContent = "";
    shopLinks(englishName, jaLabel).forEach(function (shop) {
      const link = document.createElement("a");
      link.href = shop.url.toString();
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
    const host = img.closest && img.closest(linkSelector);
    if (!host || !hit.scryfall) return;
    const scope = controlScope(host);
    ensureFavoriteDock();
    injectStyles();
    prepareOverlayHost(scope);
    let box = scope.querySelector('[data-edhrec-ja-box="' + cssEscape(englishName) + '"]');
    let scryfall;
    let shopRow;
    let copy;
    let favorite;
    if (!box) {
      box = document.createElement("span");
      box.dataset.edhrecJaBox = englishName;
      box.className = "edhrec-ja-overlay";
    }
    box.textContent = "";
    scryfall = document.createElement("a");
    scryfall.href = hit.scryfall;
    scryfall.target = "_blank";
    scryfall.rel = "noopener noreferrer";
    scryfall.className = "edhrec-ja-scryfall-link";
    setIconControl(scryfall, "external", "Scryfallで開く");
    scryfall.addEventListener("click", function (event) {
      event.stopPropagation();
    });
    shopRow = document.createElement("span");
    shopRow.className = "edhrec-ja-shop-row";
    copy = document.createElement("button");
    copy.type = "button";
    copy.className = "edhrec-ja-chip-button";
    setIconControl(copy, "copy", "カード名をコピー");
    copy.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      copyText(box.dataset.jaLabel).then(function (ok) {
        setIconControl(copy, ok ? "check" : "x", ok ? "コピーしました" : "コピーに失敗しました");
        setTimeout(function () {
          setIconControl(copy, "copy", "カード名をコピー");
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
    box.appendChild(scryfall);
    box.appendChild(shopRow);
    box.appendChild(copy);
    box.appendChild(favorite);
    box.dataset.englishName = englishName;
    box.dataset.jaLabel = hit.label;
    box.dataset.scryfall = hit.scryfall;
    box.dataset.imageSrc = hit.src;
    box.title = englishName + " / " + hit.label;
    renderShopLinks(shopRow, englishName, hit.label);
    insertControlBox(host, img, box);
    separateFromFollowingContent(box);
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () {
        separateFromFollowingContent(box);
      });
    }
    updateFavoriteButton(favorite, englishName);
  }

  function setIconControl(control, icon, label) {
    control.textContent = "";
    control.setAttribute("aria-label", label);
    control.title = label;
    control.appendChild(iconSvg(icon));
  }

  function iconSvg(icon) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.dataset.edhrecJaIcon = icon;
    if (icon === "check") {
      appendSvgPath(svg, "M20 6 9 17l-5-5");
    } else if (icon === "x") {
      appendSvgPath(svg, "M18 6 6 18M6 6l12 12");
    } else if (icon === "external") {
      appendSvgPath(svg, "M14 3h7v7M21 3l-9 9M11 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6");
    } else {
      appendSvgRect(svg, "9", "9", "11", "11");
      appendSvgPath(svg, "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1");
    }
    return svg;
  }

  function appendSvgPath(svg, d) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }

  function appendSvgRect(svg, x, y, width, height) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", width);
    rect.setAttribute("height", height);
    rect.setAttribute("rx", "2");
    rect.setAttribute("ry", "2");
    svg.appendChild(rect);
  }

  function prepareOverlayHost(host) {
    const style = window.getComputedStyle ? window.getComputedStyle(host) : null;
    if (!host.style.position || host.style.position === "static") {
      host.style.position = "relative";
    }
    if (style && style.display === "inline") {
      host.style.display = "inline-block";
    }
  }

  /**
   * 操作バーを置く親要素を選ぶ。EDHRECのカードコンテナでは画像と元表示の間に、
   * 通常カードではリンク内の画像直後に入れられるようにする。
   *
   * @param {Element} host カードリンク要素。
   * @returns {Element} 操作バーのスコープになる要素。
   */
  function controlScope(host) {
    const cardContainer = edhrecCardContainer(host);
    if (cardContainer) return cardContainer;
    return metadataSiblingAfter(host) ? host.parentNode : host;
  }

  function edhrecCardContainer(host) {
    let node = host;
    while (node && node !== document.body) {
      if (looksLikeEdhrecCardContainer(node) && hasEdhrecCardText(node)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function looksLikeEdhrecCardContainer(node) {
    return /\bCard_container/.test(String(node && node.className || ""));
  }

  function hasEdhrecCardText(node) {
    return Boolean(node && node.querySelector && node.querySelector('[class*="CardLabel"],[class*="CardPrice"],[class*="Card_nameWrapper"]'));
  }

  function edhrecImageContainer(host, cardContainer) {
    let node = host;
    while (node && node !== cardContainer) {
      if (/\bCardImage_container/.test(String(node.className || ""))) return node;
      node = node.parentElement;
    }
    return null;
  }

  function metadataSiblingAfter(host) {
    let sibling = host && host.nextElementSibling;
    let last = null;
    while (sibling) {
      if (sibling.matches && sibling.matches(linkSelector)) break;
      if (sibling.querySelector && sibling.querySelector("img")) break;
      if (text(sibling.textContent)) last = sibling;
      sibling = sibling.nextElementSibling;
    }
    return last;
  }

  /**
   * 操作バーをカード画像の直後へ差し込む。基本の表示順は
   * 画像 → 操作バー → 元の表示。EDHREC固有のCard_containerでは
   * CardImage_containerの直後へ置き、通常カードではリンク内の画像直後へ置く。
   *
   * @param {Element} host カードリンク要素。
   * @param {HTMLImageElement} img 差し替え済み画像。
   * @param {HTMLElement} box 追加する操作バー。
   */
  function insertControlBox(host, img, box) {
    if (!host || !img || !box || host === img) return;
    const cardContainer = edhrecCardContainer(host);
    if (cardContainer) {
      const imageContainer = edhrecImageContainer(host, cardContainer);
      const reference = imageContainer && imageContainer.parentNode === cardContainer ? imageContainer.nextSibling : cardContainer.firstChild;
      if (box.parentNode === cardContainer && box === reference) return;
      cardContainer.insertBefore(box, reference);
      return;
    }
    const before = metadataSiblingAfter(host);
    if (before && before.parentNode) {
      if (img.parentNode === host) {
        const imageReference = img.nextSibling;
        if (imageReference === box) return;
        host.insertBefore(box, imageReference);
        return;
      }
      if (before.previousSibling === box) return;
      before.parentNode.insertBefore(box, before);
      return;
    }
    const reference = img.nextSibling;
    if (reference === box) return;
    host.insertBefore(box, reference);
  }

  function separateFromFollowingContent(box) {
    const next = box && box.nextElementSibling;
    let overlap;
    if (!next || !box.getBoundingClientRect || !next.getBoundingClientRect) return;
    box.style.marginBottom = "";
    overlap = Math.ceil(box.getBoundingClientRect().bottom - next.getBoundingClientRect().top);
    if (overlap > 0) {
      box.style.marginBottom = overlap + 2 + "px";
    }
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

  /**
   * お気に入り登録に使う安定キーを作る。日本語名は版によって揺れるため、
   * Scryfall検索やショップ検索と同じ英語名で重複をまとめる。
   *
   * @param {string} englishName 英語カード名。
   * @returns {string} localStorage用キー。
   */
  function favoriteKey(englishName) {
    return text(englishName).toLowerCase();
  }

  /**
   * お気に入りの追加と解除を切り替え、ブラウザ内localStorageへ保存する。
   *
   * @param {{english: string, label: string, scryfall: string, src: string}} card 保存するカード情報。
   */
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

  /**
   * お気に入りパネルを描画する。リストは最新追加順で表示し、
   * 「全部コピー」はExcelやスプレッドシートへ貼り付けやすい改行区切りにする。
   */
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
    Array.prototype.forEach.call(document.querySelectorAll(imageSelector), replaceOne);
    schedulePrefetch();
    updateInlineFavoriteButtons();
  }

  function schedulePrefetch() {
    const run = function () {
      prefetchLinks();
    };
    if (window.requestIdleCallback) {
      window.requestIdleCallback(run, { timeout: 1500 });
      return;
    }
    setTimeout(run, 250);
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
      ".edhrec-ja-overlay{display:flex;flex-direction:row;align-items:center;gap:4px;box-sizing:border-box;width:100%;margin:4px 0 0;padding:3px 5px;border-top:1px solid rgba(96,165,250,.22);border-bottom:1px solid rgba(0,0,0,.28);background:rgba(30,39,47,.94);color:#bfdbfe;font-size:10px;line-height:1.1;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);pointer-events:auto;}",
      ".edhrec-ja-overlay svg{display:block;width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}",
      ".edhrec-ja-scryfall-link{display:flex;flex:0 0 auto;align-items:center;justify-content:center;width:18px;height:17px;border:1px solid rgba(96,165,250,.32);border-radius:4px;background:rgba(17,24,31,.72);color:#64b5ff;text-decoration:none;box-shadow:none;}",
      ".edhrec-ja-shop-row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;flex:1 1 auto;min-width:0;}",
      ".edhrec-ja-shop-link{display:block;min-width:0;overflow:hidden;padding:2px 0;border:1px solid rgba(96,165,250,.28);border-radius:4px;background:rgba(17,24,31,.72);color:#64b5ff;text-align:center;text-decoration:none;font-size:10px;font-weight:750;line-height:1.05;box-shadow:none;}",
      ".edhrec-ja-shop-link:hover{background:rgba(20,74,121,.55);border-color:rgba(125,211,252,.56);color:#dbeafe;}",
      ".edhrec-ja-chip-button,.edhrec-ja-star-button,.edhrec-ja-shop-link,.edhrec-ja-scryfall-link,.edhrec-ja-panel-button,.edhrec-ja-remove-button,.edhrec-ja-dock-button{appearance:none;font:inherit;transition:transform .12s ease,box-shadow .12s ease,background .12s ease,border-color .12s ease,color .12s ease;}",
      ".edhrec-ja-chip-button{display:flex;flex:0 0 auto;align-items:center;justify-content:center;width:20px;height:17px;padding:0;border:1px solid rgba(148,163,184,.32);border-radius:4px;background:rgba(17,24,31,.72);color:#e5e7eb;font-size:10px;font-weight:700;line-height:1.15;box-shadow:none;cursor:pointer;}",
      ".edhrec-ja-chip-button[aria-label='コピーしました']{border-color:rgba(134,239,172,.45);color:#86efac;background:rgba(20,83,45,.45);}",
      ".edhrec-ja-star-button{flex:0 0 auto;min-width:20px;height:17px;padding:0 5px;border:1px solid rgba(245,158,11,.5);border-radius:4px;background:rgba(69,26,3,.42);color:#fcd34d;font-size:12px;font-weight:800;line-height:1;box-shadow:none;cursor:pointer;}",
      ".edhrec-ja-star-button.is-active{background:rgba(180,83,9,.82);border-color:#fbbf24;color:#fff7ed;}",
      ".edhrec-ja-chip-button:hover,.edhrec-ja-star-button:hover,.edhrec-ja-shop-link:hover,.edhrec-ja-scryfall-link:hover,.edhrec-ja-panel-button:hover,.edhrec-ja-remove-button:hover,.edhrec-ja-dock-button:hover{transform:translateY(-1px);box-shadow:0 5px 14px rgba(0,0,0,.22);}",
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
