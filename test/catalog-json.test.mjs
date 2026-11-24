// catalog.json (owner, 2026-11-24): the list Da-Video shows, fetched from this repository's main branch when Da-Video opens,
// kept in its storage, checked strictly; the kept copy and then the built-in list when it cannot be fetched or is not valid.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as cat from "../src/catalog.js";

const HDFULL = "xuper-plugin/kino-plugin-hdfull";
const ULTRAHD = "xuper-plugin/kino-plugin-ultrahd";
const base = () => JSON.parse(JSON.stringify(cat.builtInCatalogJson()));
const res = (status, text) => ({ ok: status >= 200 && status < 300, status, text: async () => text });

function fakeKino({ answer, kept } = {}) {
  const m = new Map(kept ? [[cat.CATALOG_CACHE_KEY, kept]] : []);
  const fetched = [];
  return {
    m, fetched,
    storage: { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) },
    fetch: async (url, init) => {
      fetched.push(url);
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(url, init) : answer;
    },
  };
}

test.beforeEach(() => cat.resetCatalog());

test("the repository's catalog.json is the built-in catalog exactly, Ultra Hd right after HDFull", () => {
  const file = JSON.parse(readFileSync(new URL("../catalog.json", import.meta.url), "utf8"));
  assert.deepEqual(file, cat.builtInCatalogJson());
  const parsed = cat.parseCatalog(JSON.stringify(file));
  assert.deepEqual(parsed, { plugins: cat.BUILT_IN_PLUGINS, searchFirst: cat.BUILT_IN_SEARCH_FIRST });
  const i = file.plugins.findIndex((p) => p.repo === HDFULL);
  assert.equal(file.plugins[i + 1].repo, ULTRAHD);
  assert.deepEqual(file.searchFirst.slice(0, 2), [HDFULL, ULTRAHD]);
});

test("parseCatalog: order, hidden, flags, unknown fields and additions of xuper-plugin", () => {
  const o = base();
  o.plugins.reverse();
  o.plugins[0] = { ...o.plugins[0], hidden: true, extra: "ignored" };
  o.plugins.push({ repo: "Xuper-Plugin/kino-plugin-new", name: " Nuevo ", kind: "series", needsResolver: true, snapshot: false, color: "#fff" });
  o.searchFirst = [ULTRAHD, HDFULL, o.plugins[0].repo];
  o.future = { anything: 1 };
  const c = cat.parseCatalog(o);
  assert.equal(c.plugins.length, cat.BUILT_IN_PLUGINS.length); // one hidden, one added
  assert.equal(c.plugins[0].repo, o.plugins[1].repo);
  assert.ok(!c.plugins.some((p) => p.repo === o.plugins[0].repo));
  assert.deepEqual(c.plugins.at(-1), { repo: "xuper-plugin/kino-plugin-new", name: "Nuevo", kind: "series", needsResolver: true });
  assert.deepEqual(c.searchFirst, [ULTRAHD, HDFULL]); // the hidden one leaves the search's first rows
  const noFirst = base();
  delete noFirst.searchFirst;
  assert.deepEqual(cat.parseCatalog(noFirst).searchFirst, cat.BUILT_IN_SEARCH_FIRST);
});

test("parseCatalog refuses the whole file: another owner, the heart, bad shapes, repeats, too big, nothing to show", () => {
  const bad = (edit) => { const o = base(); edit(o); return cat.parseCatalog(o); };
  assert.equal(bad((o) => o.plugins.push({ repo: "someone/kino-plugin-x", name: "X", kind: "movies" })), null);
  assert.equal(bad((o) => o.plugins.push({ repo: "xuper-plugin/../evil", name: "X", kind: "movies" })), null);
  assert.equal(bad((o) => o.plugins.push({ repo: "https://github.com/xuper-plugin/x", name: "X", kind: "movies" })), null);
  assert.equal(bad((o) => o.plugins.push({ repo: "xuper-plugin/kino-plugin-kino-resolver", name: "R", kind: "movies" })), null);
  assert.equal(bad((o) => o.plugins.push({ ...o.plugins[0] })), null);
  assert.equal(bad((o) => { o.plugins[0].kind = "music"; }), null);
  assert.equal(bad((o) => { o.plugins[0].name = ""; }), null);
  assert.equal(bad((o) => { o.plugins[0].name = "x".repeat(41); }), null);
  assert.equal(bad((o) => { o.plugins[0].name = "a\u202eb"; }), null);
  assert.equal(bad((o) => { o.plugins[0].needsResolver = "yes"; }), null);
  assert.equal(bad((o) => { o.plugins[0] = null; }), null);
  assert.equal(bad((o) => { o.v = 2; }), null);
  assert.equal(bad((o) => { o.searchFirst = ["someone/x"]; }), null);
  assert.equal(bad((o) => { o.searchFirst = "xuper-plugin/a"; }), null);
  assert.equal(bad((o) => { o.plugins.forEach((p) => { p.hidden = true; }); }), null);
  assert.equal(bad((o) => { o.plugins = []; }), null);
  assert.equal(bad((o) => { o.plugins = Array.from({ length: 101 }, (_, i) => ({ repo: `xuper-plugin/p${i}`, name: "P", kind: "movies" })); }), null);
  assert.equal(cat.parseCatalog("{not json"), null);
  assert.equal(cat.parseCatalog("[]"), null);
  assert.equal(cat.parseCatalog(JSON.stringify(base()) + " ".repeat(cat.CATALOG_MAX_BYTES)), null);
});

test("refreshCatalog: a valid file is used and kept; the next run starts from the kept copy without a fetch", async () => {
  const o = base();
  o.plugins = [o.plugins.find((p) => p.repo === ULTRAHD), o.plugins.find((p) => p.repo === HDFULL)];
  const text = JSON.stringify(o);
  const kino = fakeKino({ answer: res(200, text) });
  assert.equal(await cat.refreshCatalog(kino, 1000), "fetched");
  assert.deepEqual(kino.fetched, [cat.CATALOG_URL]);
  assert.deepEqual(cat.PLUGINS.map((p) => p.repo), [ULTRAHD, HDFULL]);
  assert.deepEqual(cat.SEARCH_FIRST, [HDFULL, ULTRAHD]);
  assert.equal(cat.entryOf(ULTRAHD).name, "Ultra Hd");
  assert.equal(kino.m.get(cat.CATALOG_CACHE_KEY), text);
  // Opened again a minute later: no second fetch.
  assert.equal(await cat.refreshCatalog(kino, 61_000), "fetched");
  assert.equal(kino.fetched.length, 1);
  // A new run (the module's memory gone): the kept copy at once, synchronously.
  cat.resetCatalog();
  assert.equal(cat.useKeptCatalog(fakeKino({ kept: text })), "kept");
  assert.deepEqual(cat.PLUGINS.map((p) => p.repo), [ULTRAHD, HDFULL]);
});

test("refreshCatalog falls back: a bad, missing or unreachable file keeps the kept copy, else the built-in list", async () => {
  const kept = JSON.stringify({ v: 1, plugins: [{ repo: HDFULL, name: "HDFull", kind: "movies", needsResolver: true }] });
  for (const answer of [res(200, "{bad"), res(200, JSON.stringify({ v: 1, plugins: [{ repo: "evil/x", name: "X", kind: "movies" }] })), res(404, ""), new Error("offline")]) {
    cat.resetCatalog();
    const k1 = fakeKino({ answer, kept });
    assert.equal(await cat.refreshCatalog(k1, 1), "kept");
    assert.deepEqual(cat.PLUGINS.map((p) => p.repo), [HDFULL]);
    assert.equal(k1.m.get(cat.CATALOG_CACHE_KEY), kept); // the good copy is not overwritten
    cat.resetCatalog();
    const k2 = fakeKino({ answer, kept: "{also bad" });
    assert.equal(await cat.refreshCatalog(k2, 1), "built-in");
    assert.equal(cat.PLUGINS, cat.BUILT_IN_PLUGINS);
    assert.equal(cat.SEARCH_FIRST, cat.BUILT_IN_SEARCH_FIRST);
  }
  // A Kino without fetch (or no kino at all): the built-in list, never empty.
  cat.resetCatalog();
  assert.equal(await cat.refreshCatalog({ storage: { get: () => null } }, 1), "built-in");
  assert.equal(await cat.refreshCatalog(undefined, 1), "built-in");
  assert.ok(cat.PLUGINS.length > 0);
});
