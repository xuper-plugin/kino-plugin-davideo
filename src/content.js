// Contenido (owner, 2026-11-23): a streaming-style Home made from the ready copies of the person's installed plugins. Each
// plugin repository keeps its screen's tabs in home/<tab>.json (and their list in home/index.json), refreshed every 6 hours by
// its own GitHub Action. This repository's Action (scripts/content-snapshot.mjs, every 6 hours, after theirs) merges them all
// into one shared Home, home/content.json: one card per title with every plugin that has it, rows by category (buildShared).
// The device makes one request and keeps, for each card, the first copy whose plugin the person installed (pickForInstalled),
// then puts a slider on top. Every card carries its `origin`: Kino opens and plays it in that plugin (Kino's plugin federation).
import { PLUGINS } from "./catalog.js";

const k = () => globalThis.kino;

export const RAW_HOST = "raw.githubusercontent.com";

export const CACHE_KEY = "dv:content:v1";
/** A kept Home younger than this opens as it is; older, it is shown at once and fetched again behind it. */
export const FRESH_MS = 30 * 60 * 1000;
const PER_CATEGORY = 30;
const MIN_PER_CATEGORY = 4;
export const MAX_SLIDES = 8;
const FETCH_MS = 7000;

/**
 * The categories, in the order they are drawn. A source row lands in the first whose `match` its folded title passes (or whose
 * `kinds` holds its plugin's kind); a row nothing matches goes to «Más para ver».
 */
export const CATEGORIES = [
  { id: "anime", es: "Anime", en: "Anime", match: /anime|donghua|\bovas?\b/, kinds: ["anime"] },
  { id: "doramas", es: "Doramas", en: "K-dramas & Asian dramas", match: /dorama|kdrama|jdrama|cdrama|thaidrama|asiatic/ },
  { id: "infantil", es: "Para los niños", en: "For kids", match: /nino|infantil|familia|cartoon|nickelodeon|disney|foxkids|hanna|warner|kids|marvel/, kinds: ["kids"] },
  { id: "accion", es: "Acción", en: "Action", match: /accion|action/ },
  { id: "comedia", es: "Comedia", en: "Comedy", match: /comedia|comedy/ },
  { id: "terror", es: "Terror", en: "Horror", match: /terror|horror/ },
  { id: "cienciaficcion", es: "Ciencia ficción", en: "Science fiction", match: /cienciaficcion|scifi|sciencefiction/ },
  { id: "romance", es: "Romance", en: "Romance", match: /romance|romant/ },
  { id: "aventura", es: "Aventura", en: "Adventure", match: /aventura|adventure/ },
  { id: "suspenso", es: "Suspenso y crimen", en: "Thriller & crime", match: /suspens|thriller|misterio|crimen|crime/ },
  { id: "animacion", es: "Animación", en: "Animation", match: /animacion|animation/ },
  { id: "documental", es: "Documentales", en: "Documentaries", match: /documental|documentar/ },
  { id: "drama", es: "Drama", en: "Drama", match: /drama/ },
  { id: "series", es: "Series", en: "Series", match: /serie|tvshow/ },
  { id: "estrenos", es: "Estrenos y novedades", en: "New releases", match: /estreno|reciente|nuev|novedad|actualizad|ultim|encines|agregad|emision|latest|new/ },
  { id: "populares", es: "Populares", en: "Popular", match: /popular|tendencia|valorad|\btop\b|trending|destacad|masvist/ },
];
const MORE = { id: "mas", es: "Más para ver", en: "More to watch" };
/** The order the rows are drawn in (the matching order above puts the narrow ones first). */
export const DRAW_ORDER = ["estrenos", "populares", "series", "anime", "doramas", "infantil", "accion", "comedia", "terror", "drama",
  "cienciaficcion", "romance", "aventura", "suspenso", "animacion", "documental", "mas"];

/** Lower case, no accents, letters and digits only: how titles are compared. */
export const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const year4 = (v) => { const m = /\d{4}/.exec(String(v || "")); return m ? m[0] : ""; };
const kindOf = (item) => (item.kind === "series" ? "series" : "movie");

/** The category of a source row: by its title, else by its plugin's kind, else «Más para ver». Pure. */
export function categoryOf(row, pluginKind) {
  const t = fold(row.title);
  for (const c of CATEGORIES) if (c.match.test(t)) return c.id;
  for (const c of CATEGORIES) if (c.kinds && c.kinds.includes(pluginKind)) return c.id;
  if (row.items.length > 0 && row.items.every((i) => i.kind === "series")) return "series";
  return MORE.id;
}

/**
 * The shared Home (home/content.json, written by this repository's Action from every plugin's ready copies): the sources in
 * Da-Video's order, `[{ repo, kind, rows }]` (rows as the plugins' files hold them, hidden rows included). One card per title
 * (folded title + kind) with every plugin that has it in `copies` (`{ origin, ref, id }`, Da-Video's order), the first copy
 * lending the card its pictures and the others filling what it lacks. Each category mixes its rows' cards in turn, at most
 * SHARED_PER_CATEGORY (the device keeps the ones whose plugin the person installed). Pure.
 */
export const SHARED_PER_CATEGORY = 60;
export const FEATURED_PER_PLUGIN = 4;
export function buildShared(sources, now = Date.now()) {
  const chosen = new Map();
  const cardOf = (item, src) => {
    if (!item || typeof item.ref !== "string" || typeof item.title !== "string" || !item.title.trim() || item.adult === true) return null;
    const key = fold(item.title) + "|" + kindOf(item);
    const copy = { origin: src.repo, ref: item.ref, id: String(item.id || item.ref).slice(0, 100) };
    const have = chosen.get(key);
    if (have) {
      if (!have.copies.some((c) => c.origin === copy.origin)) have.copies.push(copy);
      for (const f of ["poster", "backdrop", "overview", "rating"]) if (have[f] == null && item[f] != null) have[f] = item[f];
      if (!have.year && year4(item.year)) have.year = year4(item.year);
      if (!(have.ids && have.ids.tmdb) && item.ids && item.ids.tmdb) have.ids = { tmdb: item.ids.tmdb };
      return have;
    }
    const card = {
      key, title: item.title.trim(), kind: kindOf(item), ...(year4(item.year) ? { year: year4(item.year) } : {}),
      ...(item.poster ? { poster: item.poster } : {}), ...(item.backdrop ? { backdrop: item.backdrop } : {}),
      ...(item.overview ? { overview: String(item.overview).slice(0, 300) } : {}), ...(typeof item.rating === "number" ? { rating: item.rating } : {}),
      ...(item.ids && item.ids.tmdb ? { ids: { tmdb: item.ids.tmdb } } : {}),
      copies: [copy],
    };
    chosen.set(key, card);
    return card;
  };
  const byCategory = new Map();
  for (const src of sources) {
    for (const row of src.rows || []) {
      if (!row || !Array.isArray(row.items)) continue;
      const cards = row.items.map((i) => cardOf(i, src)).filter(Boolean);
      if (row.hidden || cards.length === 0) continue; // a plugin's own slider row only lends its pictures
      const cat = categoryOf(row, src.kind);
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(cards);
    }
  }
  const rails = [];
  for (const id of DRAW_ORDER) {
    const queues = (byCategory.get(id) || []).map((q) => q.slice());
    const out = [];
    const seen = new Set();
    while (out.length < SHARED_PER_CATEGORY && queues.some((q) => q.length)) {
      for (const q of queues) {
        const c = q.shift();
        if (c && !seen.has(c.key) && out.length < SHARED_PER_CATEGORY) { seen.add(c.key); out.push(c); }
      }
    }
    if (out.length === 0) continue;
    const cat = CATEGORIES.find((c) => c.id === id) || MORE;
    rails.push({ id, title: cat.es, titleEn: cat.en, items: out });
  }
  // The slider's candidates (featured): cards with a backdrop and a synopsis, FEATURED_PER_PLUGIN per plugin in turn (the device
  // keeps the ones it can open). Only they keep the backdrop and the synopsis: Kino's title page takes the description from
  // TMDB (the card's ids), and a rail draws posters. The file stays small.
  const featured = new Set();
  const perPlugin = new Map();
  for (const r of rails) for (const c of r.items) {
    const o = c.copies[0].origin;
    if (!c.backdrop || !c.overview || featured.has(c.key) || (perPlugin.get(o) || 0) >= FEATURED_PER_PLUGIN) continue;
    featured.add(c.key);
    perPlugin.set(o, (perPlugin.get(o) || 0) + 1);
  }
  const slim = ({ key, backdrop, overview, ...rest }) => (featured.has(key) ? { ...rest, featured: true, backdrop, overview: overview.slice(0, 160) } : rest);
  return { v: 1, at: now, rails: rails.map((r) => ({ ...r, items: r.items.map(slim) })) };
}

/**
 * The person's Home from the shared one: each card opens in the first of its copies whose plugin is installed ([installed]: repos,
 * Da-Video's order), cards with none are left out, at most PER_CATEGORY per row and rows under MIN_PER_CATEGORY dropped. The
 * slides: drawn cards with a backdrop (a synopsis first), one plugin after another. Rails draw posters only. Pure.
 */
export function pickForInstalled(shared, installed) {
  const order = new Map(installed.map((r, i) => [r, i]));
  const rails = [];
  for (const r of (shared && Array.isArray(shared.rails) ? shared.rails : [])) {
    const items = [];
    for (const c of Array.isArray(r.items) ? r.items : []) {
      if (items.length >= PER_CATEGORY) break;
      const copy = (Array.isArray(c.copies) ? c.copies : []).filter((x) => order.has(x.origin)).sort((a, b) => order.get(a.origin) - order.get(b.origin))[0];
      if (!copy || typeof copy.ref !== "string") continue;
      const { copies, ...rest } = c;
      items.push({ ...rest, id: (order.get(copy.origin) + "~" + copy.id).slice(0, 128), ref: copy.ref, origin: copy.origin });
    }
    if (items.length >= MIN_PER_CATEGORY) rails.push({ id: r.id, title: r.title, titleEn: r.titleEn, items });
  }
  const drawn = [...new Map(rails.flatMap((r) => r.items).map((c) => [c.id, c])).values()].filter((c) => c.featured === true && /^https:\/\//.test(c.backdrop || ""));
  drawn.sort((a, b) => (b.overview ? 1 : 0) - (a.overview ? 1 : 0));
  const slides = [];
  const used = new Set();
  for (let pass = 0; pass < 2 && slides.length < MAX_SLIDES; pass++) {
    for (const c of drawn) {
      if (slides.length >= MAX_SLIDES || slides.includes(c)) continue;
      if (pass === 0 && used.has(c.origin)) continue; // one per plugin first
      used.add(c.origin);
      slides.push(c);
    }
  }
  return { slides, rails: rails.map((r) => ({ ...r, items: r.items.map(({ backdrop, overview, featured, ...rest }) => rest) })) };
}

/** buildShared then pickForInstalled with every source installed (the tests and the Action's summary). Pure. */
export function buildContent(sources) {
  return pickForInstalled(buildShared(sources), sources.map((s) => s.repo));
}

/** The installed plugins whose repository keeps a ready Home, in Da-Video's order (`st`: loadStatus()'s answer). */
export function contentPlugins(st) {
  return PLUGINS.filter((p) => p.snapshot === true && st && st.plugins && st.plugins[p.repo]);
}

let memo = null; // { at, repos, slides, rails }

/** The Home last built (memory, else kino.storage), or null. */
export function keptContent() {
  if (memo) return memo;
  try {
    const o = JSON.parse(k().storage.get(CACHE_KEY) || "null");
    if (o && Array.isArray(o.rails) && Array.isArray(o.slides) && Array.isArray(o.repos)) memo = o;
  } catch (_) { /* nothing kept */ }
  return memo;
}

/** Whether [repos] need a fetch: nothing kept, another set of plugins, or older than FRESH_MS. */
export function contentStale(repos, now = Date.now()) {
  const c = keptContent();
  if (!c) return true;
  if (c.repos.join(",") !== repos.join(",")) return true;
  return now - Number(c.at) > FRESH_MS;
}

/** Where this repository's Action keeps the shared Home. */
export const SHARED_URL = `https://${RAW_HOST}/xuper-plugin/kino-plugin-davideo/main/home/content.json`;
/** A shared Home older than this is not used (the Action stopped): Contenido says it has nothing yet. */
const SHARED_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/** One request: the shared Home, kept for the installed [plugins] only. */
export async function loadContent(plugins, now = Date.now()) {
  let shared = null;
  try {
    const r = await k().fetch(SHARED_URL, { timeoutMs: FETCH_MS });
    if (r && r.ok) shared = JSON.parse(await r.text());
  } catch (_) { /* offline: the kept Home stays */ }
  if (!shared || shared.v !== 1 || !Array.isArray(shared.rails) || now - Number(shared.at) > SHARED_MAX_AGE_MS) return keptContent();
  const repos = plugins.map((p) => p.repo);
  memo = { at: now, repos, ...pickForInstalled(shared, repos) };
  try { k().storage.set(CACHE_KEY, JSON.stringify(memo)); } catch (_) { /* full storage: kept in memory only */ }
  return memo;
}

const slideNode = (s) => ({
  type: "heroCard", key: "dvslide-" + s.id, h: { compact: 200, expanded: 240 }, title: s.title, text: clip(s.overview || [s.year].filter(Boolean).join("")), image: s.backdrop,
  buttons: [
    { type: "ElevatedButton", key: "dvwatch-" + s.id, labelText: "Ver", labelTextEn: "Watch", icon: "play", onPressed: { go: { play: titleOf(s) } } },
    { type: "TextButton", key: "dvinfo-" + s.id, labelText: "Más información", labelTextEn: "More info", onPressed: { go: { title: titleOf(s) } } },
  ],
});
const titleOf = (s) => ({ ref: s.ref, kind: s.kind, id: s.id, title: s.title });
const clip = (t) => { const s = String(t || "").trim(); return s.length <= 140 ? s : s.slice(0, 139).trimEnd() + "…"; };

/** The Contenido tab's nodes: the slider, then a rail per category; skeletons while the first build is on its way. */
export function contentView(content, loading) {
  if (!content || content.rails.length === 0) {
    if (!loading) return [{ type: "Text", key: "contentEmpty", text: "Todavía no hay contenido de tus plugins. Vuelve en un momento.", textEn: "Nothing from your plugins yet. Come back in a moment.", color: "muted" }];
    return [{ type: "Skeleton", key: "contentHeroWait", shape: "block", height: { compact: 200, expanded: 320 } },
      { type: "Skeleton", key: "contentRailWait", shape: "block", height: 180 }];
  }
  const nodes = [];
  const s = content.slides;
  // The key carries the count: Kino's pager keeps the count of its first drawing (std's hero, same reason).
  if (s.length === 1) nodes.push(slideNode(s[0]));
  else if (s.length > 1) nodes.push({ type: "PageView", key: "dvHero" + s.length, autoPlayMs: 6000, children: s.map(slideNode) });
  for (const r of content.rails) nodes.push({ type: "titleRail", key: "dvrail-" + r.id, title: r.title, titleEn: r.titleEn, items: r.items });
  return nodes;
}
