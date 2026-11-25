// New-episode notices: for the series the person watched (kino.library), TMDB's last aired episode is compared with what
// they last played and with the baseline Da-Video took the first time it saw the series (episodes that existed before never
// notify). A newer one is looked up in the person's installed xuper-plugin plugins through the catalog door ("mine":
// `search`, then `episodes` of the first plugin whose item is that series) and, when one lists that chapter, one bell notice
// is posted whose tap plays it there (`go.episode`, Kino apiVersion 35). Every TMDB and door call counts against the job's
// 10 requests a run. Nothing here throws out of runNewEpisodes.

export const NEW_EP = { MAX_AGE_DAYS: 60, MAX_NOTICES: 5, RETRY_DAYS: 7, REQUESTS: 10 };

/** The Kino apiVersion that allows the federation in a job and the notice's `go.episode`. */
export const MIN_API = 35;
export const STORAGE_KEY = "newEpisodes";
const MAX_NOTIFIED = 500;
const DAY_MS = 86400000;
const ALIAS = "mine";

/** Lower case, no accents, letters and digits only: how titles are compared. */
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const clip = (s, n) => { const t = String(s || "").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const posInt = (v) => Number.isInteger(v) && v > 0;
const nonNegInt = (v) => Number.isInteger(v) && v >= 0;
const errCode = (e) => (e && typeof e.code === "string" ? e.code : "error");

/** The state kept in kino.storage, always well formed. */
export function readState(raw) {
  let o = null;
  try { o = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (_) { o = null; }
  if (!o || typeof o !== "object") o = {};
  const baselines = {};
  if (o.baselines && typeof o.baselines === "object") {
    for (const [k, v] of Object.entries(o.baselines)) {
      if (v && nonNegInt(v.season) && nonNegInt(v.episode)) baselines[k] = { season: v.season, episode: v.episode };
    }
  }
  const pending = {};
  if (o.pending && typeof o.pending === "object") {
    for (const [k, v] of Object.entries(o.pending)) if (typeof v === "number" && Number.isFinite(v)) pending[k] = v;
  }
  const notified = Array.isArray(o.notified) ? o.notified.filter((x) => typeof x === "string") : [];
  const cursor = nonNegInt(o.cursor) ? o.cursor : 0;
  return { cursor, baselines, pending, notified };
}

/**
 * The series worth checking: kind series, a TMDB id, played within MAX_AGE_DAYS of [nowMs]; one per TMDB id, in the
 * library's order (newest first), rotated so the list starts at `state.cursor`.
 */
export function candidates(watched, state, nowMs) {
  const out = [];
  const seen = new Set();
  const oldest = nowMs - NEW_EP.MAX_AGE_DAYS * DAY_MS;
  for (const e of Array.isArray(watched) ? watched : []) {
    if (!e || e.kind !== "series" || !e.ids || !posInt(e.ids.tmdb) || seen.has(e.ids.tmdb)) continue;
    if (typeof e.watchedAtMs !== "number" || e.watchedAtMs < oldest) continue;
    seen.add(e.ids.tmdb);
    const c = { tmdb: e.ids.tmdb, title: String(e.title || "") };
    if (nonNegInt(e.season) && posInt(e.episode)) { c.season = e.season; c.episode = e.episode; }
    out.push(c);
  }
  if (!out.length) return out;
  const start = (state && nonNegInt(state.cursor) ? state.cursor : 0) % out.length;
  return out.slice(start).concat(out.slice(0, start));
}

/** True when [aired] comes after [seen] in {season, episode} order (anything is newer than nothing). */
export function isNewer(aired, seen) {
  if (!aired) return false;
  if (!seen) return true;
  return aired.season > seen.season || (aired.season === seen.season && aired.episode > seen.episode);
}

/** The number counted straight through: TMDB's episode counts of the seasons before [season] (specials left out) + [episode]. */
export function absoluteNumber(seasons, season, episode) {
  let n = episode;
  for (const s of Array.isArray(seasons) ? seasons : []) {
    if (s && posInt(s.season_number) && s.season_number < season && nonNegInt(s.episode_count)) n += s.episode_count;
  }
  return n;
}

/**
 * The plugin's chapter for that episode: the one with that season and number; else, when the plugin lists a single season
 * (anime numbered straight through), the one numbered [absolute]; else null (never a guess).
 */
export function matchChapter(chapters, { season, episode, absolute }) {
  const list = (Array.isArray(chapters) ? chapters : []).filter((c) => c && typeof c.ref === "string" && Number.isInteger(c.number));
  const exact = list.find((c) => c.season === season && c.number === episode);
  if (exact) return exact;
  const seasons = new Set(list.map((c) => c.season));
  if (seasons.size === 1 && posInt(absolute)) return list.find((c) => c.number === absolute) || null;
  return null;
}

/**
 * The notice for one new episode. [season]/[episode] are TMDB's (the id and the text); the `go` carries the plugin's own
 * numbering ([chapter], when it differs, e.g. an anime listed straight through) and its series [ref].
 */
export function noticeOf({ tmdb, title, season, episode, repo, ref, pluginName, chapter }) {
  const name = clip(title, 60);
  const plugin = clip(pluginName, 60);
  const goSeason = chapter && Number.isInteger(chapter.season) ? chapter.season : season;
  const goEpisode = chapter && Number.isInteger(chapter.number) ? chapter.number : episode;
  return {
    id: `ep-${tmdb}-s${season}e${episode}`,
    title: `Nuevo capítulo de ${name}`,
    titleEn: `New episode of ${name}`,
    text: `T${season}·E${episode} ya está en ${plugin}`,
    textEn: `S${season}·E${episode} is now on ${plugin}`,
    go: { episode: { origin: repo, ref, season: goSeason, episode: goEpisode } },
  };
}

/** A search item's TMDB id, wherever the plugin put it. */
const itemTmdb = (it) => (posInt(it.tmdb) ? it.tmdb : it.ids && posInt(it.ids.tmdb) ? it.ids.tmdb : 0);

/** The plugin's item for the series: the one carrying its TMDB id, else one with the exact folded title (and no other id). */
export function pickItem(items, { tmdb, title }) {
  const list = (Array.isArray(items) ? items : []).filter((it) => it && typeof it.ref === "string" && (!it.kind || it.kind === "series"));
  const byId = list.find((it) => itemTmdb(it) === tmdb);
  if (byId) return byId;
  const want = fold(title);
  return (want && list.find((it) => itemTmdb(it) === 0 && fold(it.title) === want)) || null;
}

/** The real kino, bound lazily (globalThis.kino is only there at run time). `call` asks one plugin of the author entry. */
export function bindDeps(kino) {
  const has = (o, f) => o && typeof o[f] === "function";
  return {
    apiVersion: kino && typeof kino.pluginApiVersion === "number" ? kino.pluginApiVersion : 0,
    library: kino && has(kino.library, "watched") ? (opts) => kino.library.watched(opts) : null,
    tmdb: kino && typeof kino.tmdb === "function" ? (path, params) => kino.tmdb(path, params) : null,
    callAll: kino && has(kino.plugins, "callAll") ? (alias, call, arg, opts) => kino.plugins.callAll(alias, call, arg, opts) : null,
    // An author entry names many repos: one plugin is asked through callAll's `only` (still one request).
    call: kino && has(kino.plugins, "callAll") ? async (repo, call, arg) => {
      const answers = await kino.plugins.callAll(ALIAS, call, arg, { only: [repo] });
      const a = (Array.isArray(answers) ? answers : []).find((x) => x && x.repo === repo);
      if (!a || !a.ok) { const e = new Error(`${call}: ${(a && a.code) || "provider_missing"}`); e.code = (a && a.code) || "provider_missing"; throw e; }
      return a.value;
    } : null,
    notify: kino && has(kino.notifications, "post") ? (n) => kino.notifications.post(n) : null,
    storage: kino && kino.storage ? kino.storage : null,
    now: () => Date.now(),
  };
}

export const defaultDeps = new Proxy({}, { get: (_, key) => bindDeps(globalThis.kino)[key] });

/**
 * One run of the new-episodes job: `{ checked, posted }`, or `{ skipped: reason }` (kino_too_old, library_denied,
 * library_failed, notifications_denied, no_tmdb, no_federation, no_storage) when it could do nothing. Never throws.
 */
export async function runNewEpisodes(ctx, deps = defaultDeps) {
  try {
    return await run(deps);
  } catch (e) {
    return { checked: 0, posted: 0, skipped: `error:${errCode(e)}` };
  }
}

async function run(deps) {
  if (!(typeof deps.apiVersion === "number" && deps.apiVersion >= MIN_API)) return { skipped: "kino_too_old" };
  if (!deps.library) return { skipped: "library_denied" };
  if (!deps.notify) return { skipped: "notifications_denied" };
  if (!deps.tmdb) return { skipped: "no_tmdb" };
  if (!deps.callAll || !deps.call) return { skipped: "no_federation" };
  if (!deps.storage) return { skipped: "no_storage" };
  const now = typeof deps.now === "function" ? deps.now() : Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const L = deps.limits && typeof deps.limits === "object" ? { ...NEW_EP, ...deps.limits } : NEW_EP; // a test seam; Kino never passes it

  let watched;
  try {
    watched = await deps.library({ kind: "series", limit: 100 });
  } catch (e) {
    const c = errCode(e);
    return { skipped: c === "permission_denied" || c === "not_allowed" ? "library_denied" : "library_failed" };
  }
  const state = readState(deps.storage.get(STORAGE_KEY));
  const list = candidates(watched, state, now);
  const notified = new Set(state.notified);
  const summary = { checked: 0, posted: 0 };
  let requests = 0;
  let visited = 0;
  let unfinished = -1; // the first candidate left half done (out of requests, a notice refused once): the cursor stops there

  const save = () => {
    // Prune to the series still in the library, and the last MAX_NOTIFIED ids.
    const still = new Set((Array.isArray(watched) ? watched : []).filter((e) => e && e.ids && posInt(e.ids.tmdb)).map((e) => String(e.ids.tmdb)));
    const baselines = {};
    for (const [k, v] of Object.entries(state.baselines)) if (still.has(k)) baselines[k] = v;
    const pending = {};
    for (const [k, v] of Object.entries(state.pending)) { const m = /^ep-(\d+)-/.exec(k); if (m && still.has(m[1])) pending[k] = v; }
    const out = { cursor: list.length ? (state.cursor % list.length + (unfinished >= 0 ? unfinished : visited)) % list.length : 0, baselines, pending, notified: state.notified.slice(-MAX_NOTIFIED) };
    try { deps.storage.set(STORAGE_KEY, JSON.stringify(out)); } catch (_) { /* full storage: the next run repeats this one */ }
  };
  const later = (i) => { if (unfinished < 0) unfinished = i; };
  const settle = (key, aired) => { state.baselines[key] = { season: aired.season, episode: aired.episode }; };

  // candidates() already rotated the list: index i counts from the cursor.
  for (let i = 0; i < list.length; i++) {
    if (summary.posted >= L.MAX_NOTICES || requests >= L.REQUESTS) break;
    const c = list[i];
    visited = i + 1;
    const key = String(c.tmdb);
    requests++;
    let body;
    try { body = await deps.tmdb(`/tv/${c.tmdb}`, {}); } catch (_) { body = null; }
    summary.checked++;
    const last = body && body.last_episode_to_air;
    const aired = last && nonNegInt(last.season_number) && posInt(last.episode_number)
      ? { season: last.season_number, episode: last.episode_number, airDate: typeof last.air_date === "string" ? last.air_date : "" }
      : null;
    if (!aired || (aired.airDate && aired.airDate > today)) { continue; }
    const baseline = state.baselines[key];
    if (!baseline) { settle(key, aired); continue; } // first sight: what is already out never notifies
    const played = Number.isInteger(c.season) && Number.isInteger(c.episode) ? { season: c.season, episode: c.episode } : null;
    if (!isNewer(aired, baseline) || (played && !isNewer(aired, played))) { settle(key, aired); continue; }
    const id = `ep-${c.tmdb}-s${aired.season}e${aired.episode}`;
    if (notified.has(id)) { settle(key, aired); delete state.pending[id]; continue; }
    if (!(id in state.pending)) state.pending[id] = now;
    if (now - state.pending[id] > L.RETRY_DAYS * DAY_MS) { settle(key, aired); delete state.pending[id]; continue; } // nobody had it: dropped
    if (requests + 2 > L.REQUESTS) { later(i); break; } // no room for search + episodes: this series goes first next run

    requests++;
    let answers;
    try { answers = await deps.callAll(ALIAS, "search", { q: c.title, type: "series", tmdb: c.tmdb }); } catch (_) { answers = []; }
    const absolute = absoluteNumber(body.seasons, aired.season, aired.episode);
    let hit = null;
    let outOfRequests = false;
    for (const a of Array.isArray(answers) ? answers : []) {
      if (!a || !a.ok || typeof a.repo !== "string") continue;
      const item = pickItem(a.value, c);
      if (!item) continue;
      if (requests >= L.REQUESTS) { outOfRequests = true; break; }
      requests++;
      let chapters;
      try { chapters = await deps.call(a.repo, "episodes", { ref: item.ref }); } catch (_) { continue; }
      const chapter = matchChapter(chapters, { season: aired.season, episode: aired.episode, absolute });
      if (chapter) { hit = { repo: a.repo, name: a.name || a.id || a.repo, ref: item.ref, chapter }; break; }
    }
    if (!hit) { if (outOfRequests) later(i); continue; } // pending: a later run asks again
    const notice = noticeOf({ tmdb: c.tmdb, title: c.title, season: aired.season, episode: aired.episode, repo: hit.repo, ref: hit.ref, pluginName: hit.name, chapter: hit.chapter });
    try {
      await deps.notify(notice);
    } catch (e) {
      const code = errCode(e);
      if (code === "permission_denied" || code === "not_allowed") { save(); return { ...summary, skipped: "notifications_denied" }; }
      later(i);
      continue; // rate limited or refused this once: still pending, the cursor stays here
    }
    summary.posted++;
    notified.add(id);
    state.notified.push(id);
    delete state.pending[id];
    settle(key, aired);
  }
  save();
  return summary;
}
