// The catalog door every std plugin offers (Kino's plugin protocol): Da-Video and any other plugin of the same author finds
// titles through it (kino.plugins.callAll over a consumes entry by author, Kino apiVersion 31), and Kino opens and plays what it
// finds in this plugin, with this plugin's own resolve. A plugin adds CATALOG_PROVIDES to its manifest's "provides" and exports
//   export const proto_catalog_search = async (arg) => catalogItems(await search({ q: arg.q, type: arg.type }));

/** At most this many titles per answer (the protocol's 64 KB answer limit stays far away). */
export const CATALOG_MAX = 40;

/** The manifest's "provides" block of the door (copy it into kino-plugin.json). */
export const CATALOG_PROVIDES = {
  catalog: {
    summary: "Titles this plugin finds, for the author's other plugins",
    calls: { search: { in: { q: "string", type: "string?" }, out: "Item[]" } },
    types: {
      Item: {
        id: "string", ref: "string", title: "string", kind: "string",
        poster: "string?", backdrop: "string?", year: "string?", overview: "string?", tmdb: "number?",
      },
    },
  },
};

const OVERVIEW_MAX = 300;
const HTTPS = /^https:\/\//;

/** A plugin's own search results as the door's `Item`s: only what a card needs, the empty fields left out, at most CATALOG_MAX. */
export function catalogItems(found) {
  const out = [];
  for (const it of Array.isArray(found) ? found : []) {
    if (out.length >= CATALOG_MAX) break;
    if (!it || typeof it.id !== "string" || !it.id || typeof it.ref !== "string" || !it.ref || typeof it.title !== "string" || !it.title) continue;
    const item = { id: it.id, ref: it.ref, title: it.title, kind: typeof it.kind === "string" && it.kind ? it.kind : "movie" };
    if (typeof it.poster === "string" && HTTPS.test(it.poster)) item.poster = it.poster;
    if (typeof it.backdrop === "string" && HTTPS.test(it.backdrop)) item.backdrop = it.backdrop;
    if (it.year !== undefined && it.year !== null && String(it.year)) item.year = String(it.year);
    if (typeof it.overview === "string" && it.overview.trim()) item.overview = it.overview.trim().slice(0, OVERVIEW_MAX);
    const tmdb = it.ids && Number.isInteger(it.ids.tmdb) ? it.ids.tmdb : Number.isInteger(it.tmdb) ? it.tmdb : 0;
    if (tmdb > 0) item.tmdb = tmdb;
    out.push(item);
  }
  return out;
}
