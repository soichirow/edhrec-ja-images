const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const rootDir = path.join(__dirname, "..");

test("layout fixture works in a real browser", async (t) => {
  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    t.skip("Chromium browser not found. Set E2E_BROWSER_PATH to run this test.");
    return;
  }

  const server = await startStaticServer(rootDir);
  t.after(async () => {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const debugPort = await freePort();
  const userDataDir = await fsp.mkdtemp(path.join(os.tmpdir(), "edhrec-ja-e2e-"));
  const browser = spawn(browserPath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], { stdio: "ignore" });

  t.after(async () => {
    if (browser.exitCode === null) {
      browser.kill();
      await new Promise((resolve) => {
        browser.once("exit", resolve);
        setTimeout(resolve, 2000);
      });
    }
    await fsp.rm(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  });

  await waitForDevTools(debugPort);
  const page = await openPage(debugPort, `http://127.0.0.1:${server.port}/fixtures/layout-test.html`);
  const cdp = await CdpSession.connect(page.webSocketDebuggerUrl);
  t.after(() => cdp.close());
  await cdp.send("Runtime.enable");
  const consoleMessages = [];
  cdp.on("Runtime.consoleAPICalled", (params) => {
    consoleMessages.push(params.args.map((arg) => arg.value || "").join(" "));
  });
  await cdp.send("Page.enable");
  await cdp.send("Page.reload", { ignoreCache: true });

  let lastState = null;
  const ready = await poll(async () => {
    const state = await cdp.evaluate(pageStateExpression());
    lastState = state;
    return state.ready ? state : null;
  }, 6000).catch((error) => {
    error.message += `\nLast page state: ${JSON.stringify(lastState)}`;
    throw error;
  });

  assert.equal(ready.commanderOverlayCount, 0);
  assert.deepEqual(ready.cardOverlays, [1, 1, 1, 1, 1]);
  assert.equal(ready.imageOverlapCount, 0, JSON.stringify(ready.imageOverlapDetails));
  assert.equal(ready.nativeMetaOverlapCount, 0);
  assert.equal(ready.edhrecOriginalTextOverlapCount, 0);
  assert.deepEqual(ready.overlayBeforeNativeMeta, [true, true, true, true, true]);
  assert.deepEqual(ready.overlayImmediatelyAfterImage, [true, true, true, true, true]);
  assert.equal(ready.edhrecOverlayAfterImage, true);
  assert.ok(ready.edhrecOverlayImageGap >= 4, `image/control gap: ${ready.edhrecOverlayImageGap}`);
  assert.equal(ready.edhrecOverlayBeforeOriginalText, true);
  assert.equal(ready.edhrecMockOverlayParentIsCardContainer, true);
  assert.equal(ready.edhrecLazyOverlayAfterImage, true);
  assert.equal(ready.edhrecLazyOverlayBeforePrices, true);
  assert.equal(ready.edhrecLazyPricesBeforeOriginalText, true);
  assert.equal(ready.edhrecLazyOverlayBeforeOriginalText, true);
  assert.equal(ready.edhrecLazyOverlayParentIsImageContainer, true);
  assert.equal(ready.taggerOverlayCount, 1);
  assert.equal(ready.taggerImageState, "replaced");
  assert.equal(ready.taggerOverlayParentIsGridItem, true);
  assert.equal(ready.taggerOverlayAfterCard, true);
  assert.equal(ready.taggerOverlayBeforeTagRow, true);
  assert.equal(ready.taggerAlt, "爆発的植生");
  assert.equal(ready.taggerLabel, "爆発的植生");
  assert.equal(ready.taggerEnglish, "Explosive Vegetation");
  assert.equal(ready.scryfallSearchOverlayCount, 1);
  assert.equal(ready.scryfallSearchImageState, "replaced");
  assert.equal(ready.scryfallSearchOverlayParentIsGridItem, true);
  assert.equal(ready.scryfallSearchOverlayAfterCard, true);
  assert.equal(ready.scryfallSearchEnglish, "Aftermath Analyst");
  assert.ok(ready.fetchLog.some((url) => url.includes("/cards/mock/007/ja")));
  assert.ok(ready.fetchLog.some((url) => url.includes("/cards/eoc/91/ja")));
  assert.equal(ready.fetchLog.some((url) => url.includes("cards/search") && url.includes("Aftermath")), false);
  assert.equal(ready.nameButtonCount, 0);
  assert.deepEqual(ready.copyButtons, Array.from({ length: 9 }, () => (
    { text: "", aria: "カード名をコピー", title: "カード名をコピー", svgCount: 1, icon: "copy" }
  )));
  assert.deepEqual(ready.scryfallLinks.map((link) => ({
    text: link.text,
    aria: link.aria,
    title: link.title,
    svgCount: link.svgCount,
    icon: link.icon
  })), Array.from({ length: 9 }, () => (
    { text: "", aria: "Scryfallで開く", title: "Scryfallで開く", svgCount: 1, icon: "external" }
  )));
  assert.ok(ready.scryfallLinks.every((link) => /^https:\/\/scryfall\.com\/card\//.test(link.href)));
  assert.ok(ready.overlayHeights.every((height) => height <= 36), `overlay heights: ${ready.overlayHeights.join(",")}`);
  assert.deepEqual(ready.compactControlCounts, Array.from({ length: 9 }, () => (
    { scryfall: 1, shops: 5, copies: 1, stars: 1 }
  )));
  assert.equal(ready.shopLinkCount, 45);
  assert.deepEqual(ready.shopLabels, ["晴", "BM", "SS", "東", "メ"]);
  assert.match(ready.shopHrefs[1], /^https:\/\/www\.bigweb\.co\.jp\/ja\/products\/mtg\/list\?name=Sol(\+|%20)Ring$/);
  assert.match(ready.shopHrefs[3], /^https:\/\/tokyomtg\.com\/cardpage\.html\?query=Sol(\+|%20)Ring&p=q$/);
  assert.deepEqual(ready.commanderAlts, ["The Sixth Doctor", "Susan Foreman"]);
  assert.equal(ready.wideThumbnailOverlayCount, 0);
  assert.notEqual(ready.wideThumbnailState, "replaced");
  assert.equal(ready.battleThumbnailOverlayCount, 0);
  assert.notEqual(ready.battleThumbnailState, "replaced");
  assert.equal(ready.backFace.alt, "昆虫の逸脱者");
  assert.equal(ready.backFace.label, "昆虫の逸脱者");
  assert.equal(ready.backFace.english, "Insectile Aberration");
  assert.ok(consoleMessages.includes("[EDHREC JA Images] version 2026-06-05.1"));

  const favoriteState = await cdp.evaluate(`(() => {
    document.querySelector(".card-shell .edhrec-ja-star-button").click();
    const favorites = JSON.parse(localStorage.getItem("edhrec-ja-image-favorites-v1") || "{}");
    return {
      favoriteCount: Object.keys(favorites).length,
      dockText: document.querySelector(".edhrec-ja-dock-button").textContent
    };
  })()`);
  assert.equal(favoriteState.favoriteCount, 1);
  assert.match(favoriteState.dockText, /お気に入り 1/);

  const copyState = await cdp.evaluate(`(() => new Promise((resolve) => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.resolve() }
    });
    const button = document.querySelector(".card-shell .edhrec-ja-chip-button");
    button.click();
    setTimeout(() => {
      const icon = button.querySelector("svg");
      resolve({
        text: button.textContent.trim(),
        aria: button.getAttribute("aria-label"),
        title: button.title,
        svgCount: button.querySelectorAll("svg").length,
        icon: icon ? icon.dataset.edhrecJaIcon : ""
      });
    }, 100);
  }))()`);
  assert.deepEqual(copyState, {
    text: "",
    aria: "コピーしました",
    title: "コピーしました",
    svgCount: 1,
    icon: "check"
  });
});

function pageStateExpression() {
  return `(() => {
    const commander = document.querySelector(".commander-preview");
    const cards = Array.from(document.querySelectorAll(".card-shell"));
    const overlays = Array.from(document.querySelectorAll(".edhrec-ja-overlay"));
    const images = Array.from(document.querySelectorAll("main img"));
    const cardishImages = images.filter((img) => !img.closest(".wide-thumbnail") && !img.closest(".battle-thumbnail"));
    const wideThumbnail = document.querySelector(".wide-thumbnail");
    const battleThumbnail = document.querySelector(".battle-thumbnail");
    const metas = Array.from(document.querySelectorAll(".native-meta"));
    const edhrecOriginalText = document.querySelector(".edhrec-original-text");
    const edhrecMockImageContainer = document.querySelector(".edhrec-card-mock .CardImage_container__mock");
    const edhrecMockOverlay = document.querySelector(".edhrec-card-mock .edhrec-ja-overlay");
    const edhrecLazyOriginalText = document.querySelector(".edhrec-lazy-original-text");
    const edhrecLazyPrices = document.querySelector(".edhrec-lazy-prices");
    const edhrecLazyImageContainer = document.querySelector(".edhrec-card-mock-lazy .CardImage_container__mock a");
    const edhrecLazyOverlay = document.querySelector(".edhrec-card-mock-lazy .edhrec-ja-overlay");
    const backFaceCard = document.querySelector(".back-face-card");
    const backFaceImage = backFaceCard && backFaceCard.querySelector("img");
    const backFaceOverlay = backFaceCard && backFaceCard.querySelector(".edhrec-ja-overlay");
    const taggerCard = document.querySelector(".tagger-card-item");
    const taggerLink = taggerCard && taggerCard.querySelector("a.card");
    const taggerImage = taggerCard && taggerCard.querySelector("img");
    const taggerTagRow = taggerCard && taggerCard.querySelector(".tag-row");
    const taggerOverlay = taggerCard && taggerCard.querySelector(".edhrec-ja-overlay");
    const scryfallSearchCard = document.querySelector(".scryfall-search-card-item");
    const scryfallSearchLink = scryfallSearchCard && scryfallSearchCard.querySelector("a.card-grid-item-card");
    const scryfallSearchImage = scryfallSearchCard && scryfallSearchCard.querySelector("img");
    const scryfallSearchOverlay = scryfallSearchCard && scryfallSearchCard.querySelector(".edhrec-ja-overlay");
    const overlaps = (one, two) => {
      if (!one || !two) return false;
      const a = one.getBoundingClientRect();
      const b = two.getBoundingClientRect();
      return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    };
    const imageOverlapDetails = [];
    const imageOverlapCount = overlays.filter((overlay, overlayIndex) => {
      const a = overlay.getBoundingClientRect();
      return images.some((img, imageIndex) => {
        const b = img.getBoundingClientRect();
        const hit = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        if (hit) {
          imageOverlapDetails.push({
            overlayIndex,
            imageIndex,
            overlayParentClass: String(overlay.parentElement && overlay.parentElement.className || ""),
            imageParentClass: String(img.parentElement && img.parentElement.className || ""),
            imageAlt: img.alt,
            overlayLabel: overlay.dataset.jaLabel || ""
          });
        }
        return hit;
      });
    }).length;
    const nativeMetaOverlapCount = overlays.filter((overlay) => {
      const a = overlay.getBoundingClientRect();
      return metas.some((meta) => {
        const b = meta.getBoundingClientRect();
        return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      });
    }).length;
    const edhrecOriginalTextOverlapCount = edhrecMockOverlay && edhrecOriginalText && overlaps(edhrecMockOverlay, edhrecOriginalText) ? 1 : 0;
    const replaced = cardishImages.map((img) => img.dataset.edhrecJaState || "");
    const firstShopLinks = Array.from(document.querySelectorAll(".card-shell:first-of-type .edhrec-ja-shop-link"));
    const layoutReady = imageOverlapCount === 0 && nativeMetaOverlapCount === 0 && edhrecOriginalTextOverlapCount === 0;
    return {
      ready: cardishImages.length === 12 && replaced.every((state) => state === "replaced") && overlays.length >= 9 && layoutReady,
      commanderOverlayCount: commander ? commander.querySelectorAll(".edhrec-ja-overlay").length : -1,
      commanderAlts: commander ? Array.from(commander.querySelectorAll("img")).map((img) => img.alt) : [],
      cardOverlays: cards.map((card) => card.querySelectorAll(".edhrec-ja-overlay").length),
      imageOverlapCount,
      imageOverlapDetails,
      nativeMetaOverlapCount,
      overlayBeforeNativeMeta: cards.map((card) => {
        const meta = card.querySelector(".native-meta");
        const overlay = card.querySelector(".edhrec-ja-overlay");
        if (!meta || !overlay) return false;
        return overlay.getBoundingClientRect().bottom <= meta.getBoundingClientRect().top;
      }),
      overlayImmediatelyAfterImage: cards.map((card) => {
        const image = card.querySelector(".card img");
        const overlay = card.querySelector(".edhrec-ja-overlay");
        const name = card.querySelector(".name");
        if (!image || !overlay || !name) return false;
        const imageBox = image.getBoundingClientRect();
        const overlayBox = overlay.getBoundingClientRect();
        const nameBox = name.getBoundingClientRect();
        return imageBox.bottom <= overlayBox.top && overlayBox.bottom <= nameBox.top;
      }),
      edhrecOriginalTextOverlapCount,
      edhrecOverlayAfterImage: edhrecMockOverlay && edhrecMockImageContainer ? edhrecMockImageContainer.getBoundingClientRect().bottom <= edhrecMockOverlay.getBoundingClientRect().top : false,
      edhrecOverlayImageGap: edhrecMockOverlay && edhrecMockImageContainer ? Math.round(edhrecMockOverlay.getBoundingClientRect().top - edhrecMockImageContainer.getBoundingClientRect().bottom) : -1,
      edhrecOverlayBeforeOriginalText: edhrecOriginalText && edhrecMockOverlay ? edhrecMockOverlay.getBoundingClientRect().bottom <= edhrecOriginalText.getBoundingClientRect().top : false,
      edhrecMockOverlayParentIsCardContainer: edhrecMockOverlay ? edhrecMockOverlay.parentElement.className.indexOf("Card_container") !== -1 : false,
      edhrecLazyOverlayAfterImage: edhrecLazyOverlay && edhrecLazyImageContainer ? edhrecLazyImageContainer.getBoundingClientRect().bottom <= edhrecLazyOverlay.getBoundingClientRect().top : false,
      edhrecLazyOverlayBeforePrices: edhrecLazyPrices && edhrecLazyOverlay ? edhrecLazyOverlay.getBoundingClientRect().bottom <= edhrecLazyPrices.getBoundingClientRect().top : false,
      edhrecLazyPricesBeforeOriginalText: edhrecLazyPrices && edhrecLazyOriginalText ? edhrecLazyPrices.getBoundingClientRect().bottom <= edhrecLazyOriginalText.getBoundingClientRect().top : false,
      edhrecLazyOverlayBeforeOriginalText: edhrecLazyOriginalText && edhrecLazyOverlay ? edhrecLazyOverlay.getBoundingClientRect().bottom <= edhrecLazyOriginalText.getBoundingClientRect().top : false,
      edhrecLazyOverlayParentIsImageContainer: edhrecLazyOverlay ? edhrecLazyOverlay.parentElement.className.indexOf("CardImage_container") !== -1 : false,
      taggerOverlayCount: taggerCard ? taggerCard.querySelectorAll(".edhrec-ja-overlay").length : -1,
      taggerImageState: taggerImage ? taggerImage.dataset.edhrecJaState || "" : "",
      taggerOverlayParentIsGridItem: taggerOverlay ? taggerOverlay.parentElement.className.indexOf("card-grid-item") !== -1 : false,
      taggerOverlayAfterCard: taggerOverlay && taggerLink ? taggerLink.getBoundingClientRect().bottom <= taggerOverlay.getBoundingClientRect().top : false,
      taggerOverlayBeforeTagRow: taggerOverlay && taggerTagRow ? taggerOverlay.getBoundingClientRect().bottom <= taggerTagRow.getBoundingClientRect().top : false,
      taggerAlt: taggerImage ? taggerImage.alt : "",
      taggerLabel: taggerOverlay ? taggerOverlay.dataset.jaLabel : "",
      taggerEnglish: taggerOverlay ? taggerOverlay.dataset.englishName : "",
      scryfallSearchOverlayCount: scryfallSearchCard ? scryfallSearchCard.querySelectorAll(".edhrec-ja-overlay").length : -1,
      scryfallSearchImageState: scryfallSearchImage ? scryfallSearchImage.dataset.edhrecJaState || "" : "",
      scryfallSearchOverlayParentIsGridItem: scryfallSearchOverlay ? scryfallSearchOverlay.parentElement.className.indexOf("card-grid-item") !== -1 : false,
      scryfallSearchOverlayAfterCard: scryfallSearchOverlay && scryfallSearchLink ? scryfallSearchLink.getBoundingClientRect().bottom <= scryfallSearchOverlay.getBoundingClientRect().top : false,
      scryfallSearchAlt: scryfallSearchImage ? scryfallSearchImage.alt : "",
      scryfallSearchLabel: scryfallSearchOverlay ? scryfallSearchOverlay.dataset.jaLabel : "",
      scryfallSearchEnglish: scryfallSearchOverlay ? scryfallSearchOverlay.dataset.englishName : "",
      nameButtonCount: document.querySelectorAll(".edhrec-ja-name-button").length,
      copyButtons: overlays.map((overlay) => {
        const button = overlay.querySelector(".edhrec-ja-chip-button");
        const icon = button && button.querySelector("svg");
        return {
          text: button ? button.textContent.trim() : "",
          aria: button ? button.getAttribute("aria-label") : "",
          title: button ? button.title : "",
          svgCount: button ? button.querySelectorAll("svg").length : 0,
          icon: icon ? icon.dataset.edhrecJaIcon : ""
        };
      }),
      scryfallLinks: overlays.map((overlay) => {
        const link = overlay.querySelector(".edhrec-ja-scryfall-link");
        const icon = link && link.querySelector("svg");
        return {
          text: link ? link.textContent.trim() : "",
          aria: link ? link.getAttribute("aria-label") : "",
          title: link ? link.title : "",
          href: link ? link.href : "",
          svgCount: link ? link.querySelectorAll("svg").length : 0,
          icon: icon ? icon.dataset.edhrecJaIcon : ""
        };
      }),
      overlayHeights: overlays.map((overlay) => Math.ceil(overlay.getBoundingClientRect().height)),
      compactControlCounts: overlays.map((overlay) => ({
        scryfall: overlay.querySelectorAll(".edhrec-ja-scryfall-link").length,
        shops: overlay.querySelectorAll(".edhrec-ja-shop-link").length,
        copies: overlay.querySelectorAll(".edhrec-ja-chip-button").length,
        stars: overlay.querySelectorAll(".edhrec-ja-star-button").length
      })),
      shopLabels: firstShopLinks.map((link) => link.textContent),
      shopHrefs: firstShopLinks.map((link) => link.href),
      shopLinkCount: document.querySelectorAll(".edhrec-ja-shop-link").length,
      backFace: {
        alt: backFaceImage ? backFaceImage.alt : "",
        label: backFaceOverlay ? backFaceOverlay.dataset.jaLabel : "",
        english: backFaceOverlay ? backFaceOverlay.dataset.englishName : ""
      },
      wideThumbnailOverlayCount: wideThumbnail ? wideThumbnail.querySelectorAll(".edhrec-ja-overlay").length : -1,
      wideThumbnailState: wideThumbnail ? wideThumbnail.querySelector("img").dataset.edhrecJaState || "" : "",
      battleThumbnailOverlayCount: battleThumbnail ? battleThumbnail.querySelectorAll(".edhrec-ja-overlay").length : -1,
      battleThumbnailState: battleThumbnail ? battleThumbnail.querySelector("img").dataset.edhrecJaState || "" : "",
      fetchLog: window.fetchLog || [],
      replaced
    };
  })()`;
}

function findBrowserExecutable() {
  const candidates = [
    process.env.E2E_BROWSER_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/microsoft-edge",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function startStaticServer(root) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const requestPath = decodeURIComponent(url.pathname === "/" ? "/fixtures/layout-test.html" : url.pathname);
      const filePath = path.resolve(root, "." + requestPath);
      if (!filePath.startsWith(root)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      const body = await fsp.readFile(filePath);
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      res.end(body);
    } catch (error) {
      res.writeHead(404).end("Not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      server.port = server.address().port;
      resolve(server);
    });
  });
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitForDevTools(port) {
  await poll(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      return res.ok ? true : null;
    } catch (error) {
      return null;
    }
  }, 5000);
}

async function openPage(port, url) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!res.ok) throw new Error(`DevTools new page failed: ${res.status}`);
  return res.json();
}

async function poll(fn, timeoutMs) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error(`Timed out after ${timeoutMs}ms`);
}

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = {};
    ws.addEventListener("message", (event) => this.onMessage(event));
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener("open", () => resolve(new CdpSession(ws)));
      ws.addEventListener("error", reject);
    });
  }

  send(method, params) {
    const id = this.nextId;
    this.nextId += 1;
    const message = JSON.stringify({ id, method, params: params || {} });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(message);
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
    }
    return result.result.value;
  }

  onMessage(event) {
    const data = JSON.parse(event.data);
    if (data.method && this.listeners[data.method]) {
      this.listeners[data.method].forEach((listener) => listener(data.params || {}));
    }
    if (!data.id || !this.pending.has(data.id)) return;
    const { resolve, reject } = this.pending.get(data.id);
    this.pending.delete(data.id);
    if (data.error) {
      reject(new Error(data.error.message));
    } else {
      resolve(data.result);
    }
  }

  close() {
    this.ws.close();
  }

  on(method, listener) {
    if (!this.listeners[method]) this.listeners[method] = [];
    this.listeners[method].push(listener);
  }
}
