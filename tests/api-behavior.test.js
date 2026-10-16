const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../userscript/edhrec-ja-images.user.js'), 'utf8');
function apiHarness(fetch, options = {}) {
  const storage = options.storage || new Map();
  const context = {
    location: { hostname: options.hostname || 'edhrec.com', href: 'https://scryfall.com/search' },
    document: options.document, window: { innerHeight: 1000 }, console: { info() {} },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    navigator: options.navigator || {}, fetch, setTimeout, clearTimeout, URL,
  };
  const entry = source.lastIndexOf('\n  scan();');
  assert.ok(entry > 0);
  vm.runInNewContext(source.slice(0, entry) + '\n globalThis.api = { getJapanese, throttledApiJson, getByScryfallPrint, retryAfterMs, prefetchLinks, readCache, readFavorites };\n})();', context);
  return context.api;
}
function response(status, data = {}, retryAfter = null) {
  return { status, ok: status >= 200 && status < 300, headers: { get: () => retryAfter }, json: async () => data };
}
const japaneseCard = {
  name: 'Sol Ring', printed_name: '太陽の指輪', lang: 'ja', layout: 'normal',
  image_uris: { normal: 'https://cards.scryfall.io/example.jpg' }, scryfall_uri: 'https://scryfall.com/card/example',
};

test('concurrent duplicate lookups and subsequent cache hits make one request', async () => {
  let calls = 0;
  const api = apiHarness(async () => { calls++; return response(200, { data: [japaneseCard] }); });
  const results = await Promise.all([api.getJapanese('Sol Ring'), api.getJapanese('Sol Ring'), api.getJapanese('Sol Ring', {fallback: false})]);
  assert.ok(results.every(r => r.label === '太陽の指輪'));
  await api.getJapanese('Sol Ring');
  assert.equal(calls, 1);
});

test('API requests are spaced by at least 250 ms, including concurrent callers', async () => {
  const times = [];
  const api = apiHarness(async () => { times.push(Date.now()); return response(200); });
  await Promise.all([1, 2, 3].map(n => api.throttledApiJson('https://api.scryfall.com/' + n)));
  assert.equal(times.length, 3);
  assert.ok(times.slice(1).every((t, i) => t - times[i] >= 245), JSON.stringify(times));
});

test('429 Retry-After delays queued requests too; a second 429 stops further network requests', async () => {
  const times = [];
  const api = apiHarness(async () => { times.push(Date.now()); return response(429, {}, '1'); });
  await Promise.allSettled([api.throttledApiJson('https://api.scryfall.com/a'), api.throttledApiJson('https://api.scryfall.com/b')]);
  await assert.rejects(api.throttledApiJson('https://api.scryfall.com/c'));
  assert.equal(times.length, 2);
  assert.ok(times[1] - times[0] >= 1000, JSON.stringify(times));
});

test('same-origin tabs share the request interval through Web Locks and storage', async () => {
  let tail = Promise.resolve();
  const navigator = { locks: { request: (_key, callback) => {
    const next = tail.catch(() => {}).then(callback); tail = next; return next;
  } } };
  const storage = new Map();
  const times = [];
  const fetch = async () => { times.push(Date.now()); return response(200); };
  const first = apiHarness(fetch, { navigator, storage });
  const second = apiHarness(fetch, { navigator, storage });
  await Promise.all([first.throttledApiJson('https://api.scryfall.com/a'), second.throttledApiJson('https://api.scryfall.com/b')]);
  assert.ok(times[1] - times[0] >= 245, JSON.stringify(times));
});

test('a rejected exact-print request does not poison the persistent cache', async () => {
  let fail = true; let calls = 0;
  const api = apiHarness(async () => { calls++; return fail ? response(403) : response(200, japaneseCard); });
  const print = { set: 'cmm', number: '396', name: 'Sol Ring' };
  await assert.rejects(api.getByScryfallPrint(print, 0), error => error.status === 403);
  fail = false;
  assert.equal((await api.getByScryfallPrint(print, 0)).label, '太陽の指輪');
  assert.equal(calls, 2);
});

test('Retry-After accepts seconds, HTTP dates and missing-header fallback', () => {
  const api = apiHarness(async () => response(200));
  assert.equal(api.retryAfterMs(response(429, {}, '2')), 2000);
  const wait = api.retryAfterMs(response(429, {}, new Date(Date.now() + 5000).toUTCString()));
  assert.ok(wait > 3500 && wait <= 5000);
  assert.equal(api.retryAfterMs(response(429)), 10000);
});


test('a failed Scryfall prefetch is handled without an unhandled rejection', async () => {
  let calls = 0;
  const img = { getBoundingClientRect: () => ({width: 200, height: 280, top: 0, bottom: 280}) };
  const link = { dataset: {}, textContent: 'Sol Ring', querySelector: () => img,
    getAttribute: name => name === 'href' ? 'https://scryfall.com/card/cmm/396/sol-ring' : null };
  const api = apiHarness(async () => { calls++; return response(403); }, {
    hostname: 'scryfall.com', document: { querySelectorAll: () => [link] },
  });
  api.prefetchLinks();
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(calls, 1);
});


test('persistent cache and favorites reject unsafe URLs and malformed data', () => {
  const good = { label: '太陽の指輪', english: 'Sol Ring', src: 'https://cards.scryfall.io/normal/front/example.jpg', scryfall: 'https://scryfall.com/card/cmm/396', time: Date.now() };
  for (const unsafe of [
    { ...good, scryfall: 'javascript:alert(1)' },
    { ...good, scryfall: 'https://scryfall.com.evil.example/card' },
    { ...good, scryfall: 'https://user:password@scryfall.com/card' },
    { ...good, src: 'https://example.com/tracking.png' },
  ]) {
    const storage = new Map([
      ['edhrec-ja-image-cache-v2', JSON.stringify({ good: { time: Date.now(), value: good }, bad: { time: Date.now(), value: unsafe } })],
      ['edhrec-ja-image-favorites-v1', JSON.stringify({ good, bad: unsafe })],
    ]);
    const api = apiHarness(async () => response(200), {storage});
    assert.deepEqual(Object.keys(api.readCache()), ['good']);
    assert.deepEqual(Object.keys(api.readFavorites()), ['good']);
  }
  for (const value of ['null', '[]', '42', '{invalid']) {
    const storage = new Map([['edhrec-ja-image-cache-v2', value], ['edhrec-ja-image-favorites-v1', value]]);
    const api = apiHarness(async () => response(200), {storage});
    assert.equal(Object.keys(api.readCache()).length, 0);
    assert.equal(Object.keys(api.readFavorites()).length, 0);
  }
});
