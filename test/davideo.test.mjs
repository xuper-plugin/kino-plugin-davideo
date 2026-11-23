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
            { repo: HDFULL, id: "hdfull-local", name: "HDFull", version: "0.6.3", available: null, enabled: true },
            { repo: SERIESFLIX, id: "seriesflix", name: "Seriesflix", version: "1.3.3", available: "1.3.4", enabled: true },
          ],
          running: false, lastRun: null, lastResult: [],
        };
      },
      async updateAll(opts) { calls.push(["updateAll", opts ?? null]); if (over.updateAllError) { const e = new Error("x"); e.code = over.updateAllError; throw e; } return { started: true, running: true }; },
    },
    plugins: {
      async setupStatus(repo) { calls.push(["setupStatus", repo]); return { ready: false, running: false }; },
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

test("the page: the heart with its update, the person's plugins with what each needs, then the ones to install", async () => {
  const kino = fakeKino();
  const p = await load(kino);
  const o = await p.screenEvent({ name: "open", state: {}, device: "phone", route: { name: "main" } });
  const tree = await p.screen({ state: o.state, device: "phone", installed: {} });
  assert.ok(byKey(tree, "heartTitle"));
  assert.deepEqual(byKey(tree, "update-0").onPressed, { event: "updateOne", arg: RESOLVER });
  // HDFull is installed and needs its setup: Configurar.
  // Installed cards carry the green edge (success) and an Uninstall button; the resolver is one of them.
  const green = nodes(tree).filter((n) => n.type === "Card" && n.border && n.border.color === "success");
  assert.equal(green.length, 3);
  assert.ok(nodes(tree).some((n) => n.onPressed && n.onPressed.go && n.onPressed.go.uninstallPlugin && n.onPressed.go.uninstallPlugin.repo === HDFULL));
  assert.ok(nodes(tree).some((n) => n.type === "ElevatedButton" && n.onPressed && n.onPressed.event === "setupPlugin" && n.onPressed.arg === HDFULL));
  // Seriesflix has an update; the rest of the catalog is to install.
  assert.ok(nodes(tree).some((n) => n.onPressed && n.onPressed.event === "updateOne" && n.onPressed.arg === SERIESFLIX));
  const installs = nodes(tree).filter((n) => n.onPressed && n.onPressed.go && n.onPressed.go.installPlugin);
  assert.equal(installs.length, 20);
  // Installed first: the grid's first cards are HDFull and Seriesflix, then the rest.
  const gridCards = byKey(tree, "pluginsGrid").children.map((c) => c.key);
  assert.deepEqual(gridCards.slice(0, 2), ["card-7", "card-15"]);
  // The filter: only installed, only missing.
  const f1 = await p.screenEvent({ name: "filter", value: "installed", state: o.state });
  const t1 = await p.screen({ state: { ...o.state, ...f1.state }, device: "phone", installed: {} });
  assert.equal(byKey(t1, "pluginsGrid").children.length, 2);
  const f2 = await p.screenEvent({ name: "filter", value: "missing", state: o.state });
  const t2 = await p.screen({ state: { ...o.state, ...f2.state }, device: "phone", installed: {} });
  assert.equal(byKey(t2, "pluginsGrid").children.length, 20);
  // The job is off: the one-tap card.
  assert.deepEqual(byKey(tree, "enableAuto").onPressed, { event: "enableAuto" });
  assert.deepEqual(await p.screenEvent({ name: "enableAuto", state: o.state }), { enableJob: "update", state: { jobOn: true } });
  assert.deepEqual(tree.every, { ms: 5000, event: "refresh" }, "a slow refresh while idle");
  for (const lang of ["es", "en"]) for (const device of ["phone", "tv"]) {
    const t = await p.screen({ state: o.state, device, installed: {} });
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

test("setup: Configurar asks Kino to set the plugin up", async () => {
  const kino = fakeKino();
  const p = await load(kino);
  await p.screenEvent({ name: "setupPlugin", arg: HDFULL, state: {} });
  assert.ok(kino.calls.some((c) => c[0] === "setup" && c[1] === HDFULL));
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
