const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "userscript", "edhrec-ja-images.user.js");
const source = fs.readFileSync(scriptPath, "utf8");

test("userscript stays below the old failing line number", () => {
  assert.ok(source.split(/\r?\n/).length < 102);
});

test("userscript parses as JavaScript", () => {
  assert.doesNotThrow(() => new vm.Script(source));
});

test("userscript contains direct replacement behavior", () => {
  assert.match(source, /img\.src = hit\.src/);
  assert.doesNotMatch(source, /mouseenter|mouseover|GM_xmlhttpRequest/);
});
