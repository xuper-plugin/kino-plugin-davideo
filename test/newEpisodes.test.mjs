// The new-episode notices (src/newEpisodes.js): the pure pieces and one job run against a fake kino — a library shaped like
// the kit's KINO_LIBRARY_FIXTURE, a fake kino.tmdb and fake catalog-door answers — bound through bindDeps like the real one.
import test from "node:test";
import assert from "node:assert/strict";
import {
  NEW_EP, candidates, isNewer, absoluteNumber, matchChapter, noticeOf, runNewEpisodes, bindDeps, readState, STORAGE_KEY,
} from "../src/newEpisodes.js";

const DAY = 86400000;
const NOW = Date.parse("2026-11-24T12:00:00Z");
const TODAY0 = Date.parse("2026-11-24T00:00:00Z");
const HDFULL = "xuper-plugin/kino-plugin-hdfull";
const SERIESFLIX = "xuper-plugin/kino-plugin-seriesflix";
const ANIME = "xuper-plugin/kino-plugin-animes-es";

/** What the kit's KINO_LIBRARY_FIXTURE holds (`watched`), as kino.library.watched gives it. */
const KINO_LIBRARY_FIXTURE = {
  watched: [
    { title: "The Bear", kind: "series", ids: { tmdb: 136315 }, progress: 1, watchedAtMs: TODAY0 - 2 * DAY, season: 3, episode: 4 },
    { title: "Dune", kind: "movie", ids: { tmdb: 438631 }, progress: 1, watchedAtMs: TODAY0 - DAY },
  ],
};

const tv = (season, episode, seasons = [{ season_number: 1, episode_count: 10 }, { season_number: 2, episode_count: 10 }, { season_number: 3, episode_count: 10 }], airDate = "2026-11-20") =>
  ({ last_episode_to_air: { season_number: season, episode_number: episode, air_date: airDate }, seasons });

/**
 * A fake kino. [tmdb]: { <id>: body }. [search]: { <repo>: Item[] } (name order = key order). [episodes]: { <repo>: { <ref>: Episode[] } }.
 */
function fakeKino(over = {}) {
  const store = new Map();
  if (over.state) store.set(STORAGE_KEY, JSON.stringify(over.state));
  const calls = [];
  const notices = [];
  const names = { [HDFULL]: "HDFull", [SERIESFLIX]: "Seriesflix", [ANIME]: "Animes ES" };
  const kino = {
    calls, notices, store,
    pluginApiVersion: over.apiVersion ?? 35,
    storage: { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => store.set(k, v), remove: (k) => store.delete(k) },
    library: {
      async watched(opts) {
        calls.push(["library", opts]);
        if (over.libraryDenied) { const e = new Error("no"); e.code = "permission_denied"; throw e; }
        return (over.watched ?? KINO_LIBRARY_FIXTURE.watched).filter((e) => !opts || !opts.kind || e.kind === opts.kind);
      },
    },
    async tmdb(path) {
      calls.push(["tmdb", path]);
      const id = /\/tv\/(\d+)/.exec(path)[1];
      const b = (over.tmdb || {})[id];
      if (!b) { const e = new Error("404"); e.code = "not_found"; throw e; }
      return b;
    },
    plugins: {
      async callAll(alias, call, arg, opts) {
        calls.push(["callAll", alias, call, arg, opts]);
        const repos = opts && opts.only ? opts.only : Object.keys(over.search || {});
        return repos.map((repo) => {
          const name = names[repo] || repo;
          if (call === "search") return { repo, id: repo.split("/")[1], name, ok: true, value: (over.search || {})[repo] || [] };
          const eps = ((over.episodes || {})[repo] || {})[arg.ref];
          return eps ? { repo, id: repo.split("/")[1], name, ok: true, value: eps } : { repo, id: repo.split("/")[1], name, ok: false, code: "provider_failed" };
        });
      },
    },
    notifications: {
      async post(n) {
        if (over.notificationsDenied) { const e = new Error("no"); e.code = "permission_denied"; throw e; }
        notices.push(n);
      },
    },
  };
  if (over.noNotifications) delete kino.notifications;
  return kino;
}

const deps = (kino, now = NOW) => ({ ...bindDeps(kino), now: () => now });
const stateOf = (kino) => readState(kino.store.get(STORAGE_KEY));
const requestsOf = (kino) => kino.calls.filter((c) => c[0] === "tmdb" || c[0] === "callAll").length;
const seen = (baselines) => ({ cursor: 0, baselines, pending: {}, notified: [] });
const bearEps = (n) => Array.from({ length: n }, (_, i) => ({ season: 3, number: i + 1, ref: `hd:bear:3:${i + 1}`, title: `Ep ${i + 1}` }));

test("NEW_EP keeps the agreed limits", () => {
  assert.deepEqual(NEW_EP, { MAX_AGE_DAYS: 60, MAX_NOTICES: 5, RETRY_DAYS: 7, REQUESTS: 10 });
});

test("skips titles without a TMDB id", () => {
  const w = [{ title: "Unknown", kind: "series", ids: {}, watchedAtMs: TODAY0 }, KINO_LIBRARY_FIXTURE.watched[0]];
  assert.deepEqual(candidates(w, {}, NOW).map((c) => c.tmdb), [136315]);
});

test("skips series not played in 60 days", () => {
  const w = [
    { title: "Old", kind: "series", ids: { tmdb: 1 }, watchedAtMs: TODAY0 - 61 * DAY },
    { title: "Recent", kind: "series", ids: { tmdb: 2 }, watchedAtMs: TODAY0 - 59 * DAY },
    { title: "A movie", kind: "movie", ids: { tmdb: 3 }, watchedAtMs: TODAY0 },
  ];
  assert.deepEqual(candidates(w, {}, NOW).map((c) => c.tmdb), [2]);
});

test("candidates rotate from the cursor and carry the episode played", () => {
  const w = [1, 2, 3].map((id) => ({ title: `S${id}`, kind: "series", ids: { tmdb: id }, watchedAtMs: TODAY0, season: 1, episode: id }));
  const c = candidates(w, { cursor: 1 }, NOW);
  assert.deepEqual(c.map((x) => x.tmdb), [2, 3, 1]);
  assert.deepEqual(c[0], { tmdb: 2, title: "S2", season: 1, episode: 2 });
  assert.deepEqual(candidates(w, { cursor: 4 }, NOW).map((x) => x.tmdb), [2, 3, 1]);
});

test("isNewer orders by season then episode", () => {
  assert.equal(isNewer({ season: 2, episode: 1 }, { season: 1, episode: 9 }), true);
  assert.equal(isNewer({ season: 1, episode: 5 }, { season: 1, episode: 4 }), true);
  assert.equal(isNewer({ season: 1, episode: 4 }, { season: 1, episode: 4 }), false);
  assert.equal(isNewer({ season: 1, episode: 9 }, { season: 2, episode: 1 }), false);
});

test("absoluteNumber adds the earlier seasons' episodes, not the specials", () => {
  const seasons = [{ season_number: 0, episode_count: 3 }, { season_number: 1, episode_count: 12 }, { season_number: 2, episode_count: 13 }];
  assert.equal(absoluteNumber(seasons, 1, 5), 5);
  assert.equal(absoluteNumber(seasons, 2, 3), 15);
  assert.equal(absoluteNumber(seasons, 3, 1), 26);
});

test("matchChapter: season and number, else absolute on a one-season plugin, else null", () => {
  const two = [{ season: 1, number: 1, ref: "a" }, { season: 2, number: 3, ref: "b" }];
  assert.equal(matchChapter(two, { season: 2, episode: 3, absolute: 15 }).ref, "b");
  assert.equal(matchChapter(two, { season: 2, episode: 4, absolute: 1 }), null);
  const one = [{ season: 1, number: 14, ref: "x" }, { season: 1, number: 15, ref: "y" }];
  assert.equal(matchChapter(one, { season: 2, episode: 3, absolute: 15 }).ref, "y");
  assert.equal(matchChapter(one, { season: 2, episode: 3, absolute: 16 }), null);
});

test("first sight of a series posts nothing (baseline stored)", async () => {
  const kino = fakeKino({ tmdb: { 136315: tv(3, 6) }, search: { [HDFULL]: [{ id: "1", ref: "hd:bear", title: "The Bear", kind: "series", tmdb: 136315 }] } });
  const out = await runNewEpisodes({}, deps(kino));
  assert.deepEqual(out, { checked: 1, posted: 0 });
  assert.equal(kino.notices.length, 0);
  assert.deepEqual(stateOf(kino).baselines, { 136315: { season: 3, episode: 6 } });
  assert.equal(kino.calls.some((c) => c[0] === "callAll"), false);
});

test("baselines when the library has no episode", async () => {
  const watched = [{ title: "The Bear", kind: "series", ids: { tmdb: 136315 }, watchedAtMs: TODAY0 }];
  const opts = { watched, search: { [HDFULL]: [{ id: "1", ref: "hd:bear", title: "The Bear", kind: "series", tmdb: 136315 }] }, episodes: { [HDFULL]: { "hd:bear": bearEps(7) } } };
  const kino = fakeKino({ ...opts, tmdb: { 136315: tv(3, 6) } });
  await runNewEpisodes({}, deps(kino));
  assert.deepEqual(stateOf(kino).baselines, { 136315: { season: 3, episode: 6 } });
  assert.equal(kino.notices.length, 0);
  // The next episode airs: compared with the baseline alone.
  const next = fakeKino({ ...opts, tmdb: { 136315: tv(3, 7) }, state: stateOf(kino) });
  const out = await runNewEpisodes({}, deps(next));
  assert.equal(out.posted, 1);
  assert.equal(next.notices[0].id, "ep-136315-s3e7");
});

test("posts when TMDB has a newer episode and a plugin lists it", async () => {
  const kino = fakeKino({
    tmdb: { 136315: tv(3, 5) },
    state: seen({ 136315: { season: 3, episode: 4 } }),
    search: {
      [HDFULL]: [{ id: "1", ref: "hd:bear", title: "The Bear", kind: "series", tmdb: 136315, year: 2022 }],
      [SERIESFLIX]: [{ id: "2", ref: "sf:bear", title: "The Bear", kind: "series", tmdb: 136315 }],
    },
    episodes: { [HDFULL]: { "hd:bear": bearEps(5) } },
  });
  const out = await runNewEpisodes({}, deps(kino));
  assert.deepEqual(out, { checked: 1, posted: 1 });
  assert.deepEqual(kino.notices, [{
    id: "ep-136315-s3e5",
    title: "Nuevo capítulo de The Bear",
    titleEn: "New episode of The Bear",
    text: "T3·E5 ya está en HDFull",
    textEn: "S3·E5 is now on HDFull",
    go: { episode: { origin: HDFULL, ref: "hd:bear", season: 3, episode: 5 } },
  }]);
  const search = kino.calls.find((c) => c[0] === "callAll" && c[2] === "search");
  assert.deepEqual(search.slice(1, 4), ["mine", "search", { q: "The Bear", type: "series", tmdb: 136315 }]);
  assert.equal(kino.calls.filter((c) => c[2] === "episodes").length, 1, "stops at the first plugin that lists it");
  const st = stateOf(kino);
  assert.deepEqual(st.notified, ["ep-136315-s3e5"]);
  assert.deepEqual(st.baselines["136315"], { season: 3, episode: 5 });
  assert.deepEqual(st.pending, {});
  for (const n of kino.notices) assert.equal(/xuper/i.test(JSON.stringify([n.title, n.titleEn, n.text, n.textEn])), false);
});

test("noticeOf carries the plugin's own numbering in go", () => {
  const n = noticeOf({ tmdb: 37854, title: "One Piece", season: 2, episode: 3, repo: ANIME, ref: "an:op", pluginName: "Animes ES", chapter: { season: 1, number: 15, ref: "x" } });
  assert.equal(n.id, "ep-37854-s2e3");
  assert.equal(n.text, "T2·E3 ya está en Animes ES");
  assert.deepEqual(n.go, { episode: { origin: ANIME, ref: "an:op", season: 1, episode: 15 } });
});

test("retries for 7 days when no plugin has it yet, then drops it", async () => {
  const base = {
    tmdb: { 136315: tv(3, 5) },
    search: { [HDFULL]: [{ id: "1", ref: "hd:bear", title: "The Bear", kind: "series", tmdb: 136315 }] },
    episodes: { [HDFULL]: { "hd:bear": bearEps(4) } },
  };
  const k1 = fakeKino({ ...base, state: seen({ 136315: { season: 3, episode: 4 } }) });
  assert.equal((await runNewEpisodes({}, deps(k1))).posted, 0);
  assert.equal(stateOf(k1).pending["ep-136315-s3e5"], NOW);
  assert.deepEqual(stateOf(k1).baselines["136315"], { season: 3, episode: 4 });

  const k2 = fakeKino({ ...base, state: stateOf(k1) });
  await runNewEpisodes({}, deps(k2, NOW + 6 * DAY));
  assert.equal(stateOf(k2).pending["ep-136315-s3e5"], NOW, "still pending within 7 days");
  assert.equal(k2.calls.some((c) => c[0] === "callAll"), true, "asked again");

  const k3 = fakeKino({ ...base, state: stateOf(k2) });
  await runNewEpisodes({}, deps(k3, NOW + 8 * DAY));
  assert.deepEqual(stateOf(k3).pending, {});
  assert.deepEqual(stateOf(k3).baselines["136315"], { season: 3, episode: 5 });
  assert.equal(k3.calls.some((c) => c[0] === "callAll"), false, "dropped without asking");
  assert.equal(k3.notices.length, 0);
});

test("matches an anime by absolute number on a one-season plugin", async () => {
  const watched = [{ title: "Sousou no Frieren", kind: "series", ids: { tmdb: 209867 }, watchedAtMs: TODAY0, season: 2, episode: 2 }];
  const kino = fakeKino({
    watched,
    tmdb: { 209867: tv(2, 3, [{ season_number: 0, episode_count: 2 }, { season_number: 1, episode_count: 28 }, { season_number: 2, episode_count: 12 }]) },
    state: seen({ 209867: { season: 2, episode: 2 } }),
    search: { [ANIME]: [{ id: "f", ref: "an:frieren", title: "Sousou no Frieren", kind: "series" }] },
    episodes: { [ANIME]: { "an:frieren": Array.from({ length: 31 }, (_, i) => ({ season: 1, number: i + 1, ref: `an:f:${i + 1}` })) } },
  });
  const out = await runNewEpisodes({}, deps(kino));
  assert.equal(out.posted, 1);
  assert.equal(kino.notices[0].id, "ep-209867-s2e3");
  assert.equal(kino.notices[0].text, "T2·E3 ya está en Animes ES");
  assert.deepEqual(kino.notices[0].go, { episode: { origin: ANIME, ref: "an:frieren", season: 1, episode: 31 } });
});

test("skips a plugin that matches neither", async () => {
  const kino = fakeKino({
    tmdb: { 136315: tv(3, 5) },
    state: seen({ 136315: { season: 3, episode: 4 } }),
    search: {
      [HDFULL]: [{ id: "1", ref: "hd:bear", title: "The Bear", kind: "series", tmdb: 136315 }],
      [SERIESFLIX]: [{ id: "2", ref: "sf:bear", title: "The Bear", kind: "series" }],
    },
    episodes: {
      // Two seasons listed, no S3E5: neither match.
      [HDFULL]: { "hd:bear": [{ season: 2, number: 5, ref: "a" }, { season: 3, number: 4, ref: "b" }] },
      [SERIESFLIX]: { "sf:bear": bearEps(5).map((e) => ({ ...e, ref: e.ref.replace("hd", "sf") })) },
    },
  });
  const out = await runNewEpisodes({}, deps(kino));
  assert.equal(out.posted, 1);
  assert.equal(kino.notices[0].go.episode.origin, SERIESFLIX);
  assert.equal(kino.notices[0].text, "T3·E5 ya está en Seriesflix");
  // An item for another show (another TMDB id, same title) is never asked.
  const other = fakeKino({
    tmdb: { 136315: tv(3, 5) },
    state: seen({ 136315: { season: 3, episode: 4 } }),
    search: { [HDFULL]: [{ id: "9", ref: "hd:other", title: "The Bear", kind: "series", tmdb: 999 }] },
    episodes: { [HDFULL]: { "hd:other": bearEps(5) } },
  });
  assert.equal((await runNewEpisodes({}, deps(other))).posted, 0);
  assert.equal(other.calls.some((c) => c[2] === "episodes"), false);
});

test("never posts the same id twice", async () => {
  const opts = {
    tmdb: { 136315: tv(3, 5) },
    search: { [HDFULL]: [{ id: "1", ref: "hd:bear", title: "The Bear", kind: "series", tmdb: 136315 }] },
    episodes: { [HDFULL]: { "hd:bear": bearEps(5) } },
  };
  const k1 = fakeKino({ ...opts, state: seen({ 136315: { season: 3, episode: 4 } }) });
  await runNewEpisodes({}, deps(k1));
  assert.equal(k1.notices.length, 1);
  // Even with the baseline rolled back, the id already posted is not posted again.
  const st = stateOf(k1);
  st.baselines["136315"] = { season: 3, episode: 4 };
  const k2 = fakeKino({ ...opts, state: st });
  await runNewEpisodes({}, deps(k2, NOW + DAY));
  assert.equal(k2.notices.length, 0);
  assert.deepEqual(stateOf(k2).notified, ["ep-136315-s3e5"]);
});

/** [n] series, each one episode ahead of its baseline, each listed by HDFull. */
function manySeries(n) {
  const watched = [];
  const tmdb = {};
  const baselines = {};
  const search = [];
  const episodes = {};
  for (let i = 1; i <= n; i++) {
    watched.push({ title: `Show ${i}`, kind: "series", ids: { tmdb: 100 + i }, watchedAtMs: TODAY0 - i * DAY });
    tmdb[100 + i] = tv(1, 2, [{ season_number: 1, episode_count: 10 }]);
    baselines[100 + i] = { season: 1, episode: 1 };
    search.push({ id: `s${i}`, ref: `hd:${i}`, title: `Show ${i}`, kind: "series", tmdb: 100 + i });
    episodes[`hd:${i}`] = [{ season: 1, number: 1, ref: `hd:${i}:1` }, { season: 1, number: 2, ref: `hd:${i}:2` }];
  }
  return { watched, tmdb, state: seen(baselines), search: { [HDFULL]: search }, episodes: { [HDFULL]: episodes } };
}

test("at most 5 notices a run", async () => {
  // At 3 requests a series the 10-request budget alone stops at 3 notices; with a larger budget (deps.limits, a test seam)
  // the notice cap is what stops the run.
  const kino = fakeKino(manySeries(8));
  const out = await runNewEpisodes({}, { ...deps(kino), limits: { ...NEW_EP, REQUESTS: 100 } });
  assert.equal(out.posted, NEW_EP.MAX_NOTICES);
  assert.equal(kino.notices.length, 5);
  assert.deepEqual(kino.notices.map((n) => n.id), [101, 102, 103, 104, 105].map((id) => `ep-${id}-s1e2`), "newest series first");
  const next = fakeKino({ ...manySeries(8), state: stateOf(kino) });
  await runNewEpisodes({}, { ...deps(next), limits: { ...NEW_EP, REQUESTS: 100 } });
  assert.deepEqual(next.notices.map((n) => n.id), [106, 107, 108].map((id) => `ep-${id}-s1e2`), "the rest on the next run");
});

test("stays within 10 requests", async () => {
  const kino = fakeKino(manySeries(8));
  const out = await runNewEpisodes({}, deps(kino));
  assert.ok(requestsOf(kino) <= NEW_EP.REQUESTS, `requests: ${requestsOf(kino)}`);
  assert.equal(out.posted, 3, "3 requests a series: 3 series in 10 requests");
  // The fourth series was asked TMDB with no room left for the door: the next run starts with it.
  const next = fakeKino({ ...manySeries(8), state: stateOf(kino) });
  await runNewEpisodes({}, deps(next));
  assert.ok(requestsOf(next) <= NEW_EP.REQUESTS);
  assert.equal(next.notices[0].id, "ep-104-s1e2");
});

test("quiet when library is denied", async () => {
  const kino = fakeKino({ libraryDenied: true, tmdb: { 136315: tv(3, 5) } });
  assert.deepEqual(await runNewEpisodes({}, deps(kino)), { skipped: "library_denied" });
  assert.equal(requestsOf(kino), 0);
});

test("quiet when notifications are denied", async () => {
  const none = fakeKino({ noNotifications: true });
  assert.deepEqual(await runNewEpisodes({}, deps(none)), { skipped: "notifications_denied" });
  assert.equal(none.calls.length, 0);
  const kino = fakeKino({
    notificationsDenied: true,
    tmdb: { 136315: tv(3, 5) },
    state: seen({ 136315: { season: 3, episode: 4 } }),
    search: { [HDFULL]: [{ id: "1", ref: "hd:bear", title: "The Bear", kind: "series", tmdb: 136315 }] },
    episodes: { [HDFULL]: { "hd:bear": bearEps(5) } },
  });
  const out = await runNewEpisodes({}, deps(kino));
  assert.equal(out.skipped, "notifications_denied");
  assert.equal(out.posted, 0);
  assert.deepEqual(stateOf(kino).notified, [], "not remembered as posted");
});

test("quiet when Kino is older", async () => {
  const kino = fakeKino({ apiVersion: 34, tmdb: { 136315: tv(3, 5) } });
  assert.deepEqual(await runNewEpisodes({}, deps(kino)), { skipped: "kino_too_old" });
  assert.equal(kino.calls.length, 0);
  const prev = globalThis.kino;
  globalThis.kino = { pluginApiVersion: 31 };
  try { assert.deepEqual(await runNewEpisodes({}), { skipped: "kino_too_old" }); } finally { globalThis.kino = prev; }
});

test("never throws, whatever kino does", async () => {
  const kino = fakeKino({ tmdb: { 136315: tv(3, 5) }, state: seen({ 136315: { season: 3, episode: 4 } }) });
  kino.plugins.callAll = () => { throw new Error("boom"); };
  kino.storage.get = () => "{not json";
  const out = await runNewEpisodes({}, deps(kino));
  assert.equal(typeof out, "object");
  const broken = await runNewEpisodes({}, { apiVersion: 35, library: async () => { throw new Error("x"); }, notify: () => {}, tmdb: () => {}, callAll: () => {}, call: () => {}, storage: {} });
  assert.deepEqual(broken, { skipped: "library_failed" });
});
