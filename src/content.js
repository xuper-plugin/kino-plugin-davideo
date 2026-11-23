// Contenido (owner, 2026-11-23): a streaming-style Home made from the ready copies of the person's installed plugins. Each
// plugin repository keeps its screen's tabs in home/<tab>.json (and their list in home/index.json), refreshed every 6 hours by
// its own GitHub Action; Da-Video fetches those of the plugins the person has installed, merges the same title found by several
// plugins into one card (the plugin first in Da-Video's order keeps it), sorts the rows into fixed categories and puts a slider
// on top. Every card carries its `origin`: Kino opens and plays it in the plugin it came from (Kino's plugin federation).
import { PLUGINS } from "./catalog.js";

const k = () => globalThis.kino;

export const RAW_HOST = "raw.githubusercontent.com";
const fileUrl = (repo, name) => `https://${RAW_HOST}/${repo}/main/home/${encodeURIComponent(name)}.json`;

export const CACHE_KEY = "dv:content:v1";
/** A kept Home younger than this opens as it is; older, it is shown at once and fetched again behind it. */
export const FRESH_MS = 30 * 60 * 1000;
/** A plugin's file older than this is left out (its Action stopped): the plugin's own screen still scrapes its site. */
const FILE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const TABS_PER_PLUGIN = 3;
const PER_CATEGORY = 30;
const MIN_PER_CATEGORY = 4;
export const MAX_SLIDES = 8;
const FETCH_MS = 7000;
const BATCH = 8;

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
 * The Home from the sources, in Da-Video's order: `[{ repo, kind, rows }]` (rows as the plugins' files hold them, hidden rows
 * included). One card per title (folded title + kind): the first plugin that has it keeps it, the others fill what it lacks
 * (poster, backdrop, synopsis, year, TMDB id). Each category mixes its rows' cards in turn, at most PER_CATEGORY, and is left out
 * under MIN_PER_CATEGORY. The slides: the drawn cards with a backdrop, a synopsis first, one plugin after another. Pure.
 */
export function buildContent(sources) {
  const chosen = new Map(); // title key -> card
  const cardOf = (item, src, n) => {
    if (!item || typeof item.ref !== "string" || typeof item.title !== "string" || !item.title.trim() || item.adult === true) return null;
    const key = fold(item.title) + "|" + kindOf(item);
    const have = chosen.get(key);
    if (have) {
      for (const f of ["poster", "backdrop", "overview", "rating"]) if (have[f] == null && item[f] != null) have[f] = item[f];
      if (!have.year && year4(item.year)) have.year = year4(item.year);
      if (!(have.ids && have.ids.tmdb) && item.ids && item.ids.tmdb) have.ids = { ...(have.ids || {}), tmdb: item.ids.tmdb };
      return have;
    }
    const card = {
      id: (n + "~" + String(item.id || item.ref)).slice(0, 128), ref: item.ref, title: item.title.trim(), kind: kindOf(item),
      ...(year4(item.year) ? { year: year4(item.year) } : {}),
      ...(item.poster ? { poster: item.poster } : {}), ...(item.backdrop ? { backdrop: item.backdrop } : {}),
      ...(item.overview ? { overview: String(item.overview) } : {}), ...(typeof item.rating === "number" ? { rating: item.rating } : {}),
      ...(item.ids && item.ids.tmdb ? { ids: { tmdb: item.ids.tmdb } } : {}),
      origin: src.repo,
    };
    chosen.set(key, card);
    return card;
  };
  const byCategory = new Map(); // category -> [[cards of one row], ...]
  sources.forEach((src, n) => {
    for (const row of src.rows || []) {
      if (!row || !Array.isArray(row.items)) continue;
      const cards = row.items.map((i) => cardOf(i, src, n)).filter(Boolean);
      if (row.hidden || cards.length === 0) continue; // a plugin's own slider row only lends its pictures
      const cat = categoryOf(row, src.kind);
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(cards);
    }
  });
  const rails = [];
  for (const id of DRAW_ORDER) {
    const queues = (byCategory.get(id) || []).map((q) => q.slice());
    const out = [];
    const seen = new Set();
    while (out.length < PER_CATEGORY && queues.some((q) => q.length)) {
      for (const q of queues) {
        const c = q.shift();
        if (c && !seen.has(c.id) && out.length < PER_CATEGORY) { seen.add(c.id); out.push(c); }
      }
    }
    if (out.length < MIN_PER_CATEGORY) continue;
    const cat = CATEGORIES.find((c) => c.id === id) || MORE;
    rails.push({ id, title: cat.es, titleEn: cat.en, items: out });
  }
  // The slider: cards that are drawn (Kino finds a slide's card on the screen and opens it in its origin), one plugin after another.
  const drawn = [...new Map(rails.flatMap((r) => r.items).map((c) => [c.id, c])).values()].filter((c) => /^https:\/\//.test(c.backdrop || ""));
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
  // Rails draw posters: a backdrop on only some cards would turn a rail wide (Kino draws a card with one wide).
  return { slides, rails: rails.map((r) => ({ ...r, items: r.items.map(({ backdrop, overview, ...rest }) => rest) })) };
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

async function getJson(url) {
  try {
    const r = await k().fetch(url, { timeoutMs: FETCH_MS });
    if (!r || !r.ok) return null;
    return JSON.parse(await r.text());
  } catch (_) { return null; }
}

async function inBatches(list, fn) {
  const out = [];
  for (let i = 0; i < list.length; i += BATCH) out.push(...(await Promise.all(list.slice(i, i + BATCH).map(fn))));
  return out;
}

/** Fetches the files of [plugins] (their index, then their first TABS_PER_PLUGIN tabs), builds the Home and keeps it. */
export async function loadContent(plugins, now = Date.now()) {
  const indexes = await inBatches(plugins, (p) => getJson(fileUrl(p.repo, "index")));
  const wanted = [];
  plugins.forEach((p, i) => {
    const tabs = indexes[i] && Array.isArray(indexes[i].tabs) ? indexes[i].tabs.map((t) => t && t.id).filter((x) => typeof x === "string") : [];
    for (const id of tabs.slice(0, TABS_PER_PLUGIN)) wanted.push({ p, id });
  });
  const files = await inBatches(wanted, (w) => getJson(fileUrl(w.p.repo, w.id)));
  const rowsOf = new Map(plugins.map((p) => [p.repo, []]));
  wanted.forEach((w, i) => {
    const f = files[i];
    if (!f || f.tab !== w.id || !Array.isArray(f.rows) || now - Number(f.at) > FILE_MAX_AGE_MS) return;
    rowsOf.get(w.p.repo).push(...f.rows);
  });
  const built = buildContent(plugins.map((p) => ({ repo: p.repo, kind: p.kind, rows: rowsOf.get(p.repo) })));
  memo = { at: now, repos: plugins.map((p) => p.repo), ...built };
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
