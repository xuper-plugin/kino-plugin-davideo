// The plugins Da-Video knows how to offer: each is a repository of xuper-plugin. Kino says which of them still needs setting up
// (kino.manage.updates), so Da-Video can show Configurar. Kino Resolver is the heart: most of them play
// through it.
//
// The list Da-Video shows comes from catalog.json at the root of this repository's main branch (owner, 2026-11-24): fetched when
// Da-Video opens, kept in the plugin's storage, and checked strictly (parseCatalog). It sets the order, the search's first rows,
// hides or removes plugins, changes their flags and adds new ones, only repositories of xuper-plugin. The lists below are the
// built-in default: used while nothing valid was ever fetched, and the first content of catalog.json (a test keeps them equal).

export const OWNER = "xuper-plugin";

export const RESOLVER = { repo: "xuper-plugin/kino-plugin-kino-resolver", name: "Kino Resolver" };

// needsResolver: the plugin plays nothing without Kino Resolver (it refuses at resolve() and shows its own install gate);
// Da-Video's sheet offers the resolver first while it is missing (owner, 2026-11-23). snapshot: its repository keeps a ready Home
// (home/index.json and home/<tab>.json, refreshed every 6 hours): Da-Video's Contenido tab is made of them.
export const BUILT_IN_PLUGINS = [
  // Preferred first (owner, 2026-11-23): Xuper, Movie+, ZappTV, HDFull, and Ultra Hd right after HDFull (owner, 2026-11-24);
  // then the rest.
  { repo: "xuper-plugin/kino-plugin-xuper", name: "Xuper", kind: "live" },
  { repo: "xuper-plugin/kino-plugin-movieplus", name: "Movie+", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-zapptv", name: "ZappTV", kind: "live" },
  { repo: "xuper-plugin/kino-plugin-hdfull", name: "HDFull", kind: "movies", needsResolver: true },
  // Movies, series and live TV from the service's own servers (no resolver, no setup: it picks a server by itself); its
  // catalog door (0.8.8) answers the search from its title index. Its Home is its own encrypted feed, not a ready std Home.
  { repo: "xuper-plugin/kino-plugin-ultrahd", name: "Ultra Hd", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-animes-es", name: "AnimES", kind: "anime" },
  // Documentaries in Spanish from their own site (no resolver); its catalog door (0.2.5) answers the search.
  { repo: "xuper-plugin/kino-plugin-areadocumental", name: "Área Documental", kind: "docs" },
  { repo: "xuper-plugin/kino-plugin-cinehdplus", name: "CineHD Plus", kind: "movies", needsResolver: true, snapshot: true },
  // Movies and series from TMDB, the video from Cinejoy's own public player in the hidden browser (no resolver); its catalog
  // door (1.1.1) answers the search.
  { repo: "xuper-plugin/kino-plugin-cinejoy", name: "Cinejoy", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-cinemitas", name: "Cinemitas", kind: "movies", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-cuevanapro", name: "Cuevana Pro", kind: "movies", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-doramasyt", name: "DoramasYT", kind: "series", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-embed69", name: "Embed 69", kind: "movies", needsResolver: true, snapshot: true },
  // +18: no ready Home, so never in Contenido; its catalog door (1.2.1) answers Da-Video's search.
  { repo: "xuper-plugin/kino-plugin-hentaimama", name: "HentaiMama (+18)", kind: "adult" },
  // Asian dramas, series, movies and anime with their own player (no resolver); its catalog door (0.1.1) answers the search.
  { repo: "xuper-plugin/kino-plugin-kisskh", name: "KissKH", kind: "series" },
  { repo: "xuper-plugin/kino-plugin-lacartoons", name: "LA Cartoons Plus", kind: "kids", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-latino", name: "Latino", kind: "movies", needsResolver: true, snapshot: true },
  // Japanese anime from its own server (no resolver), catalog from TMDB; its catalog door (1.1.2) answers the search and its
  // own Action keeps a ready Home (1.2.0), so it is part of Contenido.
  { repo: "xuper-plugin/kino-plugin-megaplay", name: "MegaPlay", kind: "anime", snapshot: true },
  { repo: "xuper-plugin/kino-plugin-mundodonghua", name: "MundoDonghua", kind: "anime", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/maraton", name: "PelisYSeries", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-peliculasflix", name: "PeliculasFlix", kind: "movies", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-pelisgo", name: "Pelisgo", kind: "movies", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-pelispedia", name: "Pelispedia", kind: "movies", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-seriesflix", name: "Seriesflix", kind: "series", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-serieskao", name: "SeriesKao", kind: "series", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-seriesmetro", name: "SeriesMetro", kind: "series", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-sololatino", name: "SoloLatino", kind: "movies", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-latanime", name: "TodoAnime", kind: "anime", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-verpelis", name: "VerPelis", kind: "movies", needsResolver: true, snapshot: true },
];

/** The search's first rows (owner, 2026-11-23; Ultra Hd right after HDFull, 2026-11-24), when the person has them on; the rest
 * follow in the catalog's order. */
export const BUILT_IN_SEARCH_FIRST = ["xuper-plugin/kino-plugin-hdfull", "xuper-plugin/kino-plugin-ultrahd", "xuper-plugin/kino-plugin-movieplus",
  "xuper-plugin/kino-plugin-xuper", "xuper-plugin/kino-plugin-zapptv"];

// ---- catalog.json ----------------------------------------------------------------------------------------------------------

export const CATALOG_URL = "https://raw.githubusercontent.com/xuper-plugin/kino-plugin-davideo/main/catalog.json";
export const CATALOG_CACHE_KEY = "dv:catalog:v1";
/** The largest catalog.json taken (characters of its text); a bigger one is refused whole. */
export const CATALOG_MAX_BYTES = 64 * 1024;
export const CATALOG_MAX_PLUGINS = 100;
export const SEARCH_FIRST_MAX = 10;
export const KINDS = ["movies", "series", "anime", "live", "docs", "kids", "adult"];
const NAME_MAX = 40;
const REPO = /^xuper-plugin\/[a-z0-9][a-z0-9._-]{0,99}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/;
const FLAGS = ["needsResolver", "snapshot", "hidden"];
/** catalog.json is fetched at most this often (once per opening, not once per screen event). */
const REFETCH_MS = 10 * 60 * 1000;
const FETCH_MS = 5000;

const repoOf = (v) => (typeof v === "string" && REPO.test(v.trim().toLowerCase()) ? v.trim().toLowerCase() : null);

/**
 * catalog.json (its text, or the parsed object) as { plugins, searchFirst }, or null when it is not a valid catalog. Pure.
 * Strict: a wrong top level, an entry with a repository outside xuper-plugin (or the heart's), a missing or too long name, an
 * unknown kind, a flag that is not true/false, a repeated repository, more than CATALOG_MAX_PLUGINS entries, a text over
 * CATALOG_MAX_BYTES or nothing left to show refuse the whole file (the person keeps the last good list). Unknown fields are
 * ignored. An entry with "hidden": true stays out of the list. searchFirst is optional (missing: the built-in one); its
 * repositories that are not in the list are dropped.
 */
export function parseCatalog(input) {
  let o = input;
  if (typeof input === "string") {
    if (input.length > CATALOG_MAX_BYTES) return null;
    try { o = JSON.parse(input); } catch (_) { return null; }
  } else {
    try { if (JSON.stringify(o).length > CATALOG_MAX_BYTES) return null; } catch (_) { return null; }
  }
  if (!o || typeof o !== "object" || Array.isArray(o) || o.v !== 1 || !Array.isArray(o.plugins)) return null;
  if (o.plugins.length > CATALOG_MAX_PLUGINS) return null;
  const seen = new Set();
  const plugins = [];
  for (const e of o.plugins) {
    if (!e || typeof e !== "object" || Array.isArray(e)) return null;
    const repo = repoOf(e.repo);
    if (!repo || repo === RESOLVER.repo || seen.has(repo)) return null;
    seen.add(repo);
    const name = typeof e.name === "string" ? e.name.trim() : "";
    if (!name || name.length > NAME_MAX || CONTROL.test(name)) return null;
    if (!KINDS.includes(e.kind)) return null;
    for (const f of FLAGS) if (e[f] !== undefined && typeof e[f] !== "boolean") return null;
    if (e.hidden === true) continue;
    const entry = { repo, name, kind: e.kind };
    if (e.needsResolver === true) entry.needsResolver = true;
    if (e.snapshot === true) entry.snapshot = true;
    plugins.push(entry);
  }
  if (!plugins.length) return null;
  let searchFirst = BUILT_IN_SEARCH_FIRST;
  if (o.searchFirst !== undefined) {
    if (!Array.isArray(o.searchFirst) || o.searchFirst.length > SEARCH_FIRST_MAX) return null;
    searchFirst = [];
    for (const r of o.searchFirst) {
      const repo = repoOf(r);
      if (!repo) return null;
      if (!searchFirst.includes(repo)) searchFirst.push(repo);
    }
  }
  const listed = new Set(plugins.map((p) => p.repo));
  return { plugins, searchFirst: searchFirst.filter((r) => listed.has(r)) };
}

/** The catalog in use: the built-in one until a valid catalog.json (kept or fetched) replaces it. */
export let PLUGINS = BUILT_IN_PLUGINS;
export let SEARCH_FIRST = BUILT_IN_SEARCH_FIRST;
/** Where the catalog in use came from: "built-in", "kept" or "fetched". */
export let catalogSource = "built-in";
let keptLoaded = false;
let fetchedAt = 0;

function apply(cat, source) {
  PLUGINS = cat.plugins;
  SEARCH_FIRST = cat.searchFirst;
  catalogSource = source;
}

/** Back to the built-in catalog with nothing remembered (tests). */
export function resetCatalog() {
  apply({ plugins: BUILT_IN_PLUGINS, searchFirst: BUILT_IN_SEARCH_FIRST }, "built-in");
  keptLoaded = false;
  fetchedAt = 0;
}

/** The kept catalog.json, applied once per run (synchronous: every screen call starts with it). A bad copy is ignored. */
export function useKeptCatalog(kino = globalThis.kino) {
  if (keptLoaded) return catalogSource;
  keptLoaded = true;
  try {
    const kept = kino && kino.storage ? kino.storage.get(CATALOG_CACHE_KEY) : null;
    const cat = kept ? parseCatalog(kept) : null;
    if (cat) apply(cat, "kept");
  } catch (_) { /* no storage: the built-in catalog */ }
  return catalogSource;
}

/**
 * catalog.json fetched again (when Da-Video opens, at most every REFETCH_MS): a valid one is used and kept; anything else
 * (offline, an error, a bad or too big file) leaves the catalog as it is: the kept copy, else the built-in one. Never throws.
 */
export async function refreshCatalog(kino = globalThis.kino, now = Date.now()) {
  useKeptCatalog(kino);
  if (!kino || typeof kino.fetch !== "function" || (fetchedAt && now - fetchedAt < REFETCH_MS)) return catalogSource;
  fetchedAt = now;
  try {
    const r = await kino.fetch(CATALOG_URL, { timeoutMs: FETCH_MS });
    if (!r || !r.ok) return catalogSource;
    const text = await r.text();
    const cat = parseCatalog(text);
    if (!cat) return catalogSource;
    apply(cat, "fetched");
    try { kino.storage.set(CATALOG_CACHE_KEY, text); } catch (_) { /* full storage: used for this run only */ }
  } catch (_) { /* offline: the catalog stays */ }
  return catalogSource;
}

/** catalog.json as this repository keeps it: the built-in catalog, in the file's format. */
export function builtInCatalogJson() {
  return { v: 1, searchFirst: BUILT_IN_SEARCH_FIRST, plugins: BUILT_IN_PLUGINS };
}

/** The icon a card shows: the plugin's own icon.png on its default branch (a public https picture needs no host). */
export const iconOf = (entry) => `https://raw.githubusercontent.com/${entry.repo}/HEAD/icon.png`;

/** The catalog entry of [repo] (any case), or null. */
export function entryOf(repo) {
  const key = String(repo || "").toLowerCase();
  if (key === RESOLVER.repo) return RESOLVER;
  return PLUGINS.find((p) => p.repo === key) || null;
}
