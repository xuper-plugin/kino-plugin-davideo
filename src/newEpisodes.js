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
/** At most this many plugins' `episodes` asked for one series in one run. */
export const EPISODES_PER_SERIES = 3;

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

/** TMDB's episode as {season, episode}, or null when there is none, it is a special (season 0) or it has not aired by [today]. */
function airedOf(e, today) {
  if (!e || !posInt(e.season_number) || !posInt(e.episode_number)) return null;
  if (typeof e.air_date === "string" && e.air_date && e.air_date > today) return null;
  return { season: e.season_number, episode: e.episode_number };
}

/** TMDB's regular seasons (no specials), in order: [{ season, count }]. */
const seasonCounts = (seasons) => (Array.isArray(seasons) ? seasons : [])
  .filter((s) => s && posInt(s.season_number) && nonNegInt(s.episode_count))
  .map((s) => ({ season: s.season_number, count: s.episode_count }))
  .sort((a, b) => a.season - b.season);

/** Episode [n] counted straight through, as TMDB's {season, episode}, or null when the seasons do not reach it. */
export function fromAbsolute(seasons, n) {
  let left = n;
  for (const s of seasonCounts(seasons)) {
    if (left <= s.count) return { season: s.season, episode: left };
    left -= s.count;
  }
  return null;
}

/**
 * The episode the library says was played, in TMDB's numbering: a source that numbers straight through (season 1, a number
 * beyond TMDB's season 1) is converted; one that cannot be (or a special) is unknown (null).
 */
export function playedOf(c, seasons) {
  if (!c || !posInt(c.season) || !posInt(c.episode)) return null;
  if (c.season !== 1) return { season: c.season, episode: c.episode };
  const first = seasonCounts(seasons).find((s) => s.season === 1);
  if (!first || c.episode <= first.count) return { season: 1, episode: c.episode };
  return fromAbsolute(seasons, c.episode);
}

/** The episode right after [floor] (which is before [last], the last aired), by TMDB's season episode counts; null if unknown. */
export function nextAfter(seasons, floor, last) {
  if (floor.season === last.season) return { season: floor.season, episode: floor.episode + 1 };
  const counts = seasonCounts(seasons);
  const cur = counts.find((s) => s.season === floor.season);
  if (cur && floor.episode < cur.count) return { season: floor.season, episode: floor.episode + 1 };
  const next = counts.find((s) => s.season > floor.season);
  if (next) return { season: next.season, episode: 1 };
  return floor.season < last.season ? { season: last.season, episode: 1 } : null;
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

  const seriesOf = (id) => { const m = /^ep-(\d+)-s(\d+)e(\d+)$/.exec(id); return m ? { key: m[1], season: +m[2], episode: +m[3] } : null; };
  // Only ever raises a series' baseline (TMDB can briefly report an older episode).
  const raise = (key, ep) => {
    if (ep && (!state.baselines[key] || isNewer(ep, state.baselines[key]))) state.baselines[key] = { season: ep.season, episode: ep.episode };
  };
  // Drops a series' pending ids other than [keep] (a superseded episode: the person watched on, or TMDB moved).
  const dropPending = (key, keep) => { for (const k of Object.keys(state.pending)) if (k !== keep && k.startsWith(`ep-${key}-`)) delete state.pending[k]; };
  const save = () => {
    // Prune to the series still in the library, pending ids within RETRY_DAYS, and the last MAX_NOTIFIED ids. A pending id
    // that outlived its window is dropped as the check would: its baseline moves up to it, so its timer never restarts.
    const still = new Set((Array.isArray(watched) ? watched : []).filter((e) => e && e.ids && posInt(e.ids.tmdb)).map((e) => String(e.ids.tmdb)));
    const pending = {};
    for (const [k, v] of Object.entries(state.pending)) {
      const p = seriesOf(k);
      if (!p || !still.has(p.key)) continue;
      if (now - v > L.RETRY_DAYS * DAY_MS) { raise(p.key, p); continue; }
      pending[k] = v;
    }
    const baselines = {};
    for (const [k, v] of Object.entries(state.baselines)) if (still.has(k)) baselines[k] = v;
    const out = { cursor: list.length ? (state.cursor % list.length + (unfinished >= 0 ? unfinished : visited)) % list.length : 0, baselines, pending, notified: state.notified.slice(-MAX_NOTIFIED) };
    try { deps.storage.set(STORAGE_KEY, JSON.stringify(out)); } catch (_) { /* full storage: the next run repeats this one */ }
  };
  const later = (i) => { if (unfinished < 0) unfinished = i; };

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
    const last = airedOf(body && body.last_episode_to_air, today); // a season 0 special counts as nothing aired
    if (!last) continue;
    if (!state.baselines[key]) { raise(key, last); continue; } // first sight: what is already out never notifies
    const seasons = body.seasons;
    const played = playedOf(c, seasons);
    const floor = played && isNewer(played, state.baselines[key]) ? played : state.baselines[key];
    if (!isNewer(last, floor)) { raise(key, last); dropPending(key, null); continue; } // caught up
    // The first episode after what the person has (or Da-Video's baseline), not the last one aired: a season released all at
    // once notifies its first chapter.
    const target = nextAfter(seasons, floor, last);
    if (!target) continue;
    if (target.season !== last.season) {
      if (requests + 3 > L.REQUESTS) { later(i); break; } // season data + search + episodes do not fit: first next run
      requests++;
      let season;
      try { season = await deps.tmdb(`/tv/${c.tmdb}/season/${target.season}`, {}); } catch (_) { season = null; }
      const ep = season && Array.isArray(season.episodes) ? season.episodes.find((e) => e && e.episode_number === target.episode) : null;
      if (!ep || typeof ep.air_date !== "string" || !ep.air_date || ep.air_date > today) continue; // not out (or unknown): wait
    }
    const id = `ep-${c.tmdb}-s${target.season}e${target.episode}`;
    dropPending(key, id);
    if (notified.has(id)) { raise(key, last); delete state.pending[id]; continue; }
    if (!(id in state.pending)) state.pending[id] = now;
    if (now - state.pending[id] > L.RETRY_DAYS * DAY_MS) { raise(key, last); delete state.pending[id]; continue; } // nobody had it: dropped
    if (requests + 2 > L.REQUESTS) { later(i); break; } // no room for search + episodes: this series goes first next run

    requests++;
    let answers;
    try { answers = await deps.callAll(ALIAS, "search", { q: c.title, type: "series", tmdb: c.tmdb }); } catch (_) { answers = []; }
    const absolute = absoluteNumber(seasons, target.season, target.episode);
    let hit = null;
    let asked = 0;
    for (const a of Array.isArray(answers) ? answers : []) {
      // A series gets at most EPISODES_PER_SERIES door calls a run, then the others have their turn.
      if (asked >= EPISODES_PER_SERIES || requests >= L.REQUESTS) break;
      if (!a || !a.ok || typeof a.repo !== "string") continue;
      const item = pickItem(a.value, c);
      if (!item) continue;
      requests++;
      asked++;
      let chapters;
      try { chapters = await deps.call(a.repo, "episodes", { ref: item.ref }); } catch (_) { continue; }
      const chapter = matchChapter(chapters, { season: target.season, episode: target.episode, absolute });
      if (chapter) { hit = { repo: a.repo, name: a.name || a.id || a.repo, ref: item.ref, chapter }; break; }
    }
    if (!hit) continue; // pending: asked again when its turn comes round
    const notice = noticeOf({ tmdb: c.tmdb, title: c.title, season: target.season, episode: target.episode, repo: hit.repo, ref: hit.ref, pluginName: hit.name, chapter: hit.chapter });
    try {
      await deps.notify(notice);
    } catch (e) {
      const code = errCode(e);
      if (code === "permission_denied" || code === "not_allowed") { save(); return { ...summary, skipped: "notifications_denied" }; }
      continue; // rate limited or refused this once: still pending, asked again on its next turn
    }
    summary.posted++;
    notified.add(id);
    state.notified.push(id);
    delete state.pending[id];
    raise(key, last); // one notice covers everything aired so far
  }
  save();
  return summary;
}
