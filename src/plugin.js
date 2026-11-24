// Da-Video: all of xuper-plugin's video plugins in one place. Its search asks every one the person installed (Kino's
// plugin federation: a consumes entry by author, kino.plugins.callAll) and shows one row per plugin as each answers; a card
// opens and plays in the plugin that found it, with that plugin's own resolve (the card's `origin`). Its page lists the
// person's plugins with what each needs (an update, its setup) and the ones still to install, and its job keeps them up to
// date (kino.manage, every 4 hours by default; the person picks 4, 5 or 6 in Kino's own row of the job).
import { makeStandardScreen } from "./std/index.js";
import { LOGO, LOGO_ASPECT } from "./logo.js";
import { PLUGINS, SEARCH_FIRST, useKeptCatalog, refreshCatalog } from "./catalog.js";
import { loadStatus, pageView, pageEvery, pageActions, PAGE_EVENTS, jobIsOn, contentWanted } from "./page.js";

/** The consumes entry by author (kino-plugin.json): every installed xuper-plugin plugin that opens the catalog door. */
const MINE = "mine";

export { SEARCH_FIRST };

/** Where [repo] goes in the search: SEARCH_FIRST, then the catalog's order, then anything else. */
export function searchRank(repo) {
  const key = String(repo || "").toLowerCase();
  const first = SEARCH_FIRST.indexOf(key);
  if (first >= 0) return first;
  const i = PLUGINS.findIndex((p) => p.repo.toLowerCase() === key);
  return SEARCH_FIRST.length + (i >= 0 ? i : PLUGINS.length);
}

async function sources() {
  const kino = globalThis.kino;
  if (!kino || !kino.plugins || typeof kino.plugins.providers !== "function") return [];
  const all = (await kino.plugins.providers(MINE)).map((p) => ({ repo: p.repo, name: p.name }));
  return all.sort((a, b) => searchRank(a.repo) - searchRank(b.repo));
}

async function searchIn(q, repos) {
  const all = await globalThis.kino.plugins.callAll(MINE, "search", { q }, { only: repos });
  return all.map((e) => ({ repo: e.repo, name: e.name, ok: !!e.ok, items: e.ok && Array.isArray(e.value) ? e.value : [] }));
}

let std = null;
const standard = () => (std ??= makeStandardScreen({
  kino: globalThis.kino, name: "Da-Video", logo: LOGO, logoAspect: LOGO_ASPECT, needsResolver: false, hasSettings: false, barSearch: false, backArrow: true,
  tabs: [{ id: "mine", label: "Mis plugins", labelEn: "My plugins" }],
  loadTab: async () => ({ rows: [] }),
  searchHere: { sources, searchIn },
  page: {
    open: async () => {
      // catalog.json first (owner, 2026-11-24): the list below is drawn from it.
      await refreshCatalog();
      const mp = await loadStatus();
      // The Contenido Home is fetched behind the first drawing (the page's timer) when nothing fresh is kept.
      return { mp, jobOn: jobIsOn(), busy: mp.running, notice: null, contentLoading: contentWanted(mp) };
    },
    view: pageView,
    actions: pageActions,
    every: pageEvery,
    events: PAGE_EVENTS,
  },
}));

export async function screen(ctx) {
  await null;
  useKeptCatalog();
  return standard().screen(ctx && typeof ctx === "object" ? ctx : {});
}

export async function screenEvent(ev) {
  await null;
  useKeptCatalog();
  return standard().screenEvent(ev && typeof ev === "object" ? ev : {});
}

/** The scheduled job: one pass over the person's xuper-plugin plugins, on Kino's side (it outlives this short run). */
export async function job(ctx) {
  await null;
  if (!ctx || ctx.id !== "update") return null;
  const kino = globalThis.kino;
  if (!kino || typeof kino.manage !== "object") return null;
  try {
    await kino.manage.updateAll();
  } catch (e) {
    // rate_limited (a pass a moment ago), auto_update_off (the person's switch): the next run tries again.
    if (typeof kino.log === "function") kino.log(`update job: ${(e && e.code) || "error"}`);
  }
  return null;
}
