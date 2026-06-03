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

  const ready = await poll(async () => {
    const state = await cdp.evaluate(pageStateExpression());
    return state.ready ? state : null;
  }, 6000);

  assert.equal(ready.commanderOverlayCount, 0);
  assert.deepEqual(ready.cardOverlays, [1, 1, 1, 1]);
  assert.equal(ready.imageOverlapCount, 0);
  assert.equal(ready.nativeMetaOverlapCount, 0);
  assert.deepEqual(ready.nativeMetaBeforeOverlay, [true, true, true, true]);
  assert.equal(ready.shopLinkCount, 20);
  assert.deepEqual(ready.shopLabels, ["晴", "BM", "SS", "東", "メ"]);
  assert.match(ready.shopHrefs[1], /^https:\/\/www\.bigweb\.co\.jp\/ja\/products\/mtg\/list\?name=Sol(\+|%20)Ring$/);
  assert.match(ready.shopHrefs[3], /^https:\/\/tokyomtg\.com\/cardpage\.html\?query=Sol(\+|%20)Ring&p=q$/);
  assert.deepEqual(ready.cardLabels, ["太陽の指輪", "ファイレクシアの変形者", "剣を鍬に", "対抗呪文"]);
  assert.deepEqual(ready.commanderAlts, ["The Sixth Doctor", "Susan Foreman"]);
  assert.equal(ready.wideThumbnailOverlayCount, 0);
  assert.notEqual(ready.wideThumbnailState, "replaced");

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
});

function pageStateExpression() {
  return `(() => {
    const commander = document.querySelector(".commander-preview");
    const cards = Array.from(document.querySelectorAll(".card-shell"));
    const overlays = Array.from(document.querySelectorAll(".edhrec-ja-overlay"));
    const images = Array.from(document.querySelectorAll("main img"));
    const cardishImages = images.filter((img) => !img.closest(".wide-thumbnail"));
    const wideThumbnail = document.querySelector(".wide-thumbnail");
    const metas = Array.from(document.querySelectorAll(".native-meta"));
    const imageOverlapCount = overlays.filter((overlay) => {
      const a = overlay.getBoundingClientRect();
      return images.some((img) => {
        const b = img.getBoundingClientRect();
        return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      });
    }).length;
    const nativeMetaOverlapCount = overlays.filter((overlay) => {
      const a = overlay.getBoundingClientRect();
      return metas.some((meta) => {
        const b = meta.getBoundingClientRect();
        return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      });
    }).length;
    const replaced = cardishImages.map((img) => img.dataset.edhrecJaState || "");
    const firstShopLinks = Array.from(document.querySelectorAll(".card-shell:first-of-type .edhrec-ja-shop-link"));
    return {
      ready: cardishImages.length === 6 && replaced.every((state) => state === "replaced") && overlays.length >= 4,
      commanderOverlayCount: commander ? commander.querySelectorAll(".edhrec-ja-overlay").length : -1,
      commanderAlts: commander ? Array.from(commander.querySelectorAll("img")).map((img) => img.alt) : [],
      cardOverlays: cards.map((card) => card.querySelectorAll(".edhrec-ja-overlay").length),
      cardLabels: cards.map((card) => card.querySelector(".edhrec-ja-name-button") && card.querySelector(".edhrec-ja-name-button").textContent),
      imageOverlapCount,
      nativeMetaOverlapCount,
      nativeMetaBeforeOverlay: cards.map((card) => {
        const meta = card.querySelector(".native-meta");
        const overlay = card.querySelector(".edhrec-ja-overlay");
        if (!meta || !overlay) return false;
        return meta.getBoundingClientRect().bottom <= overlay.getBoundingClientRect().top;
      }),
      shopLabels: firstShopLinks.map((link) => link.textContent),
      shopHrefs: firstShopLinks.map((link) => link.href),
      shopLinkCount: document.querySelectorAll(".edhrec-ja-shop-link").length,
      wideThumbnailOverlayCount: wideThumbnail ? wideThumbnail.querySelectorAll(".edhrec-ja-overlay").length : -1,
      wideThumbnailState: wideThumbnail ? wideThumbnail.querySelector("img").dataset.edhrecJaState || "" : "",
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
}
