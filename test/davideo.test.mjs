// Da-Video: its page (the heart, the person's plugins, the ones to install), its search across plugins, and its job,
// against a fake kino; every tree and answer goes through the kit's own screen checks (the rules Kino applies).
import test from "node:test";
import assert from "node:assert/strict";
import * as kit from "../sdk/screen.mjs";

const HDFULL = "xuper-plugin/kino-plugin-hdfull";
const SERIESFLIX = "xuper-plugin/kino-plugin-seriesflix";
const RESOLVER = "xuper-plugin/kino-plugin-kino-resolver";

function fakeKino(over = {}) {
  const m = new Map();
  const calls = [];
  const kino = {
    calls,
    storage: { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) },
    log() {},
    jobOn: () => over.jobOn ?? false,
    manage: {
      async updates() {
        return over.updates ?? {
          plugins: [
            { repo: RESOLVER, id: "kino-resolver", name: "Kino Resolver", version: "0.0.27", available: "0.0.28", enabled: true },
            { repo: HDFULL, id: "hdfull-local", name: "HDFull", version: "0.6.3", available: null, enabled: true, needsSetup: true },
            { repo: SERIESFLIX, id: "seriesflix", name: "Seriesflix", version: "1.3.3", available: "1.3.4", enabled: true },
          ],
          running: false, lastRun: null, lastResult: [],
        };
      },
      async updateAll(opts) { calls.push(["updateAll", opts ?? null]); if (over.updateAllError) { const e = new Error("x"); e.code = over.updateAllError; throw e; } return { started: true, running: true }; },
    },
    plugins: {
      async setup(repo) { calls.push(["setup", repo]); return { state: "SETTING_UP" }; },
      async providers() { return [{ repo: HDFULL, id: "hdfull-local", name: "HDFull", version: "0.6.3" }, { repo: SERIESFLIX, id: "seriesflix", name: "Seriesflix", version: "1.3.3" }]; },
      async callAll(alias, call, arg, opts) {
        calls.push(["callAll", alias, call, arg, opts]);
        return opts.only.map((repo) => repo === HDFULL
          ? { repo, id: "hdfull-local", name: "HDFull", ok: true, value: [{ id: "1", ref: "h:1", title: "Dune", kind: "movie" }] }
          : { repo, id: "seriesflix", name: "Seriesflix", ok: false, code: "timeout" });
      },
    },
  };
  return kino;
}

/** A fresh copy of the plugin bound to [kino] (std keeps one screen per module instance). */
async function load(kino) {
  globalThis.kino = kino;
  return import(`../src/plugin.js?${Math.random()}`);
}

function nodes(tree, out = []) {
  if (Array.isArray(tree)) { for (const t of tree) nodes(t, out); return out; }
  if (!tree || typeof tree !== "object") return out;
  if (typeof tree.type === "string") out.push(tree);
  for (const v of Object.values(tree)) if (v && typeof v === "object") nodes(v, out);
  return out;
}
const fold = (v) => JSON.parse(JSON.stringify(v));
const byKey = (tree, key) => nodes(tree).find((n) => n.key === key);

test("the page (design C): home-screen icons, yours then the ones to install, Editar to uninstall", async () => {
  const kino = fakeKino();
  const p = await load(kino);
  const o = await p.screenEvent({ name: "open", state: {}, device: "phone", route: { name: "main" } });
  const tree = await p.screen({ state: o.state, device: "phone", installed: {} });
  // The search field on top; no search icon in the bar; the back arrow instead of the X.
  assert.equal(byKey(tree, "dvSearch").type, "TextField");
  assert.ok(!byKey(tree, "searchButton"));
  assert.equal(byKey(tree, "close").icon, "arrow_back");
  // Yours: the heart first, then HDFull and Seriesflix; a tap on any asks for its sheet.
  assert.deepEqual(byKey(tree, "mineGrid").children.map((c) => c.key), ["card-0", "card-4", "card-18"]);
  assert.deepEqual(byKey(tree, "card-4").onTap, { event: "pick", arg: HDFULL });
  // «Nueva» on the ones with an update (the heart and Seriesflix); «Configurar» on HDFull, which needs its setup.
  assert.ok(byKey(tree, "new-0") && byKey(tree, "new-18") && byKey(tree, "setup-4"));
  // The rest: dimmed, with a download button each (20 of them).
  const installs = nodes(tree).filter((n) => n.onPressed && n.onPressed.go && n.onPressed.go.installPlugin);
  assert.equal(installs.length, 21);
  assert.equal(byKey(tree, "missingGrid").children.length, 21);
  // The sheet: Abrir, Configurar (HDFull needs its setup), Desinstalar; never Desinstalar for the heart.
  const pk = await p.screenEvent({ name: "pick", arg: HDFULL, state: o.state });
  assert.deepEqual(pk.ui, [{ open: "pluginSheet" }]);
  const te = await p.screen({ state: { ...o.state, ...pk.state }, device: "phone", installed: {} });
  assert.deepEqual(byKey(te, "sheetOpen").onPressed, { go: { plugin: { repo: HDFULL } } });
  // Still to set up: the main button is Configurar and opens its own screen.
  assert.equal(byKey(te, "sheetOpen").labelText, "Configurar");
  assert.ok(!byKey(te, "sheetSetup"));
  assert.deepEqual(byKey(te, "sheetUninstall").onPressed, { go: { uninstallPlugin: { repo: HDFULL } } });
  const ps = await p.screenEvent({ name: "pick", arg: SERIESFLIX, state: o.state });
  const ts = await p.screen({ state: { ...o.state, ...ps.state }, device: "phone", installed: {} });
  assert.deepEqual(byKey(ts, "sheetUpdate").onPressed, { event: "updateOne", arg: SERIESFLIX });
  assert.equal(byKey(ts, "sheetOpen").labelText, "Abrir");
  const ph = await p.screenEvent({ name: "pick", arg: RESOLVER, state: o.state });
  const th = await p.screen({ state: { ...o.state, ...ph.state }, device: "phone", installed: {} });
  assert.ok(byKey(th, "sheetOpen") && !byKey(th, "sheetUninstall"));
  assert.deepEqual(await p.screenEvent({ name: "unpick", state: ph.state }), { state: { pick: null } });
  // The job is off: the one-tap card.
  assert.deepEqual(byKey(tree, "enableAuto").onPressed, { event: "enableAuto" });
  assert.deepEqual(await p.screenEvent({ name: "enableAuto", state: o.state }), { enableJob: "update", state: { jobOn: true } });
  // Seriesflix keeps a ready Home: the Contenido Home is fetched right after the first drawing, then the slow refresh.
  assert.equal(o.state.contentLoading, true);
  assert.deepEqual(tree.every, { ms: 1000, event: "contentLoad" });
  const after = await p.screenEvent({ name: "contentLoad", state: o.state });
  const idle = await p.screen({ state: { ...o.state, ...after.state }, device: "phone", installed: {} });
  assert.deepEqual(idle.every, { ms: 5000, event: "refresh" }, "a slow refresh while idle");
  for (const lang of ["es", "en"]) for (const device of ["phone", "tv"]) for (const t of [tree, te]) {
    assert.deepEqual(kit.checkScreenTree(fold(t), lang, undefined, { apiVersion: 31 }).dropped, [], `${device}/${lang}`);
  }
});

test("updating: a pass starts on Kino's side and the page polls while it runs; errors become a short line", async () => {
  const kino = fakeKino();
  const p = await load(kino);
  const r = await p.screenEvent({ name: "updateOne", arg: SERIESFLIX, state: {} });
  assert.deepEqual(kino.calls.find((c) => c[0] === "updateAll"), ["updateAll", { only: [SERIESFLIX] }]);
  assert.equal(r.state.busy, true);
  const tree = await p.screen({ state: r.state, device: "phone", installed: {} });
  assert.deepEqual(tree.every, { ms: 3000, event: "refresh" });
  const k2 = fakeKino({ updateAllError: "rate_limited" });
  const p2 = await load(k2);
  const r2 = await p2.screenEvent({ name: "checkNow", state: {} });
  assert.match(r2.state.notice[0], /hace poco/);
});

test("search: shown here, one plugin at a time, cards open in the plugin that found them", async () => {
  const kino = fakeKino();
  const p = await load(kino);
  const r = await p.screenEvent({ name: "search", value: "dune", state: { searching: true } });
  assert.deepEqual(r.route, { push: "results" });
  const route = { name: "results" };
  const t = await p.screenEvent({ name: "tick", state: r.state, route });
  const state = { ...r.state, ...t.state };
  const call = kino.calls.find((c) => c[0] === "callAll");
  assert.deepEqual(call.slice(1, 4), ["mine", "search", { q: "dune" }]);
  const tree = await p.screen({ state, route, device: "phone", installed: {} });
  const rail = nodes(tree).find((n) => n.type === "titleRail");
  assert.equal(rail.items[0].origin, HDFULL);
  assert.ok(nodes(tree).some((n) => n.key && n.key.startsWith("failed-")), "Seriesflix did not answer");
  assert.deepEqual(kit.checkScreenTree(fold(tree), "es", undefined, { apiVersion: 31 }).dropped, []);
});

test("the job: one updateAll, and a refusal never throws", async () => {
  const kino = fakeKino();
  const p = await load(kino);
  assert.equal(await p.job({ id: "update", reason: "scheduled" }), null);
  assert.deepEqual(kino.calls.filter((c) => c[0] === "updateAll"), [["updateAll", null]]);
  const p2 = await load(fakeKino({ updateAllError: "auto_update_off" }));
  assert.equal(await p2.job({ id: "update", reason: "scheduled" }), null);
});

test("the sheet of a plugin that needs the resolver, while the resolver is missing: Instalar resolver, not Abrir", async () => {
  const kino = fakeKino({ updates: { plugins: [
    { repo: SERIESFLIX, id: "seriesflix", name: "Seriesflix", version: "1.3.6", available: null, enabled: true },
    { repo: "xuper-plugin/kino-plugin-animes-es", id: "animes-es", name: "AnimES", version: "1.7.7", available: null, enabled: true },
  ], running: false, lastRun: null, lastResult: [] } });
  const p = await load(kino);
  const o = await p.screenEvent({ name: "open", state: {}, device: "phone", route: { name: "main" } });
  const ps = await p.screenEvent({ name: "pick", arg: SERIESFLIX, state: o.state });
  const t = await p.screen({ state: { ...o.state, ...ps.state }, device: "phone", installed: {} });
  assert.ok(!byKey(t, "sheetOpen"));
  assert.equal(byKey(t, "sheetResolver").labelText, "Instalar resolver");
  assert.deepEqual(byKey(t, "sheetResolver").onPressed, { go: { installPlugin: { repo: RESOLVER } } });
  assert.equal(byKey(t, "sheetResolverNote").text, "Para abrir este plugin es necesario el resolver.");
  assert.ok(byKey(t, "sheetUninstall"), "it can still be uninstalled");
  // AnimES plays without the resolver: Abrir as always.
  const pa = await p.screenEvent({ name: "pick", arg: "xuper-plugin/kino-plugin-animes-es", state: o.state });
  const ta = await p.screen({ state: { ...o.state, ...pa.state }, device: "phone", installed: {} });
  assert.equal(byKey(ta, "sheetOpen").labelText, "Abrir");
  assert.ok(!byKey(ta, "sheetResolverNote"));
});

// ---- Contenido ----
import { buildContent, buildShared, categoryOf, MAX_SLIDES } from "../src/content.js";

const card = (n, extra = {}) => ({ id: "i" + n, ref: "r:" + n, title: "Title " + n, kind: "movie", poster: "https://p/" + n + ".jpg", ...extra });

test("Contenido: rows sorted into categories, one card per title (the first plugin keeps it), cards carry their origin", () => {
  const A = "xuper-plugin/kino-plugin-serieskao", B = "xuper-plugin/kino-plugin-cinehdplus";
  const home = buildContent([
    { repo: A, kind: "series", rows: [
      { id: "s", title: "Destacados", hidden: true, items: [card(1, { backdrop: "https://b/1.jpg", overview: "Uno" })] },
      { id: "r", title: "Películas recientes", items: [card(1), card(2), card(3), card(4)] },
      { id: "a", title: "Acción", items: [card(5), card(6), card(7), card(8)] },
    ] },
    { repo: B, kind: "movies", rows: [
      { id: "n", title: "Estrenos", items: [card(1, { title: "TITLE 1", backdrop: "https://b/1b.jpg" }), card(9), card(10), card(11)] },
      { id: "x", title: "Anime", items: [card(12)] },
    ] },
  ]);
  assert.deepEqual(home.rails.map((r) => r.id), ["estrenos", "accion"], "Anime has under 4 cards: left out");
  const est = home.rails[0].items;
  assert.equal(est.filter((c) => c.title.toLowerCase() === "title 1").length, 1, "one card for the same title");
  assert.equal(est.find((c) => c.ref === "r:1").origin, A, "the first plugin keeps it");
  assert.ok(est.every((c) => c.origin && !c.backdrop), "rails: posters only, every card with its origin");
  // The slide is a drawn card (same id as in its rail), with the backdrop another plugin's copy lent it.
  assert.equal(home.slides.length, 1);
  assert.ok(est.some((c) => c.id === home.slides[0].id));
  assert.ok(home.slides.length <= MAX_SLIDES);
});

test("Contenido: a row's category by its title, else its plugin's kind", () => {
  assert.equal(categoryOf({ title: "K-Drama", items: [] }, "series"), "doramas");
  assert.equal(categoryOf({ title: "Series de drama", items: [] }, "movies"), "drama");
  assert.equal(categoryOf({ title: "Nickelodeon", items: [] }, "kids"), "infantil");
  assert.equal(categoryOf({ title: "Inicio", items: [] }, "anime"), "anime");
  assert.equal(categoryOf({ title: "Tendencias en películas", items: [] }, "movies"), "populares");
  assert.equal(categoryOf({ title: "Cosas", items: [card(1)] }, "movies"), "mas");
});

test("Contenido: the tab shows once a plugin with a ready Home is installed, built from the repositories' files", async () => {
  const now = Date.now();
  // The shared Home (this repository's Action) holds two plugins' copies; only Seriesflix is installed here.
  const shared = buildShared([
    { repo: "xuper-plugin/kino-plugin-serieskao", kind: "series", rows: [{ id: "x", title: "Series populares", items: [card(1, { kind: "series", ref: "sk:1" })] }] },
    { repo: "xuper-plugin/kino-plugin-seriesflix", kind: "series", rows: [{ id: "p", title: "Series populares", items: [card(1, { kind: "series", backdrop: "https://b/1.jpg", overview: "x" }), card(2, { kind: "series" }), card(3, { kind: "series" }), card(4, { kind: "series" })] }] },
  ], now);
  const files = { "xuper-plugin/kino-plugin-davideo/main/home/content.json": shared };
  const kino = fakeKino();
  kino.fetch = async (url) => {
    const f = files[String(url).replace("https://raw.githubusercontent.com/", "")];
    return f ? { ok: true, text: async () => JSON.stringify(f) } : { ok: false, status: 404, text: async () => "" };
  };
  const p = await load(kino);
  const o = await p.screenEvent({ name: "open", state: {}, device: "phone", route: { name: "main" } });
  const mine = await p.screen({ state: o.state, device: "phone", installed: {} });
  assert.equal(byKey(mine, "dvTabs").value, "mine");
  await p.screenEvent({ name: "contentLoad", state: o.state });
  const sw = await p.screenEvent({ name: "dvTab", value: "content", state: o.state });
  const t = await p.screen({ state: { ...o.state, ...sw.state }, device: "phone", installed: {} });
  const rail = byKey(t, "dvrail-series");
  assert.equal(rail.items.length, 4);
  assert.equal(rail.items[0].origin, "xuper-plugin/kino-plugin-seriesflix", "the installed copy, not SeriesKao's");
  assert.equal(rail.items[0].ref, "r:1");
  assert.ok(byKey(t, "dvslide-" + rail.items[0].id), "the slide is the rail's card");
  assert.ok(!byKey(t, "mineGrid"), "Contenido replaces the plugins grid");
  assert.deepEqual(kit.checkScreenTree(fold(t), "es", undefined, { apiVersion: 31 }).dropped, []);
});

test("Contenido: no tabs while no plugin with a ready Home is installed", async () => {
  const kino = fakeKino({ updates: { plugins: [{ repo: RESOLVER, id: "kino-resolver", name: "Kino Resolver", version: "0.0.29", available: null, enabled: true }], running: false, lastRun: null, lastResult: [] } });
  const p = await load(kino);
  const o = await p.screenEvent({ name: "open", state: {}, device: "phone", route: { name: "main" } });
  const t = await p.screen({ state: o.state, device: "phone", installed: {} });
  assert.ok(!byKey(t, "dvTabs"));
  assert.ok(!o.state.contentLoading);
});

test("Contenido: a Home kept without a slider is asked again after 2 minutes, a full one after 30", async () => {
  const { contentStale, CACHE_KEY } = await import("../src/content.js");
  const store = new Map();
  globalThis.kino = { storage: { get: (k) => store.get(k) ?? null, set: (k, v) => store.set(k, v), remove: (k) => store.delete(k) } };
  // keptContent() caches in memory: this test only reads what contentStale decides from a kept Home through a fresh import.
  const mod = await import(`../src/content.js?stale-${Math.random()}`);
  const now = Date.now();
  store.set(mod.CACHE_KEY, JSON.stringify({ at: now - 3 * 60 * 1000, repos: ["a/b"], slides: [], rails: [] }));
  assert.equal(mod.contentStale(["a/b"], now), true);
  const mod2 = await import(`../src/content.js?stale2-${Math.random()}`);
  store.set(mod2.CACHE_KEY, JSON.stringify({ at: now - 3 * 60 * 1000, repos: ["a/b"], slides: [{ id: "x" }], rails: [] }));
  assert.equal(mod2.contentStale(["a/b"], now), false);
  assert.ok(contentStale && CACHE_KEY);
});
