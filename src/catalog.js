// The plugins Da-Video knows how to offer: each is a repository of xuper-plugin. Kino says which of them still needs setting up
// (kino.manage.updates), so Da-Video can show Configurar. Kino Resolver is the heart: most of them play
// through it.

export const OWNER = "xuper-plugin";

export const RESOLVER = { repo: "xuper-plugin/kino-plugin-kino-resolver", name: "Kino Resolver" };

// needsResolver: the plugin plays nothing without Kino Resolver (it refuses at resolve() and shows its own install gate);
// Da-Video's sheet offers the resolver first while it is missing (owner, 2026-11-23). snapshot: its repository keeps a ready Home
// (home/index.json and home/<tab>.json, refreshed every 6 hours): Da-Video's Contenido tab is made of them.
export const PLUGINS = [
  // Preferred first (owner, 2026-11-23): Xuper, Movie+, ZappTV, HDFull; then the rest.
  { repo: "xuper-plugin/kino-plugin-xuper", name: "Xuper", kind: "live" },
  { repo: "xuper-plugin/kino-plugin-movieplus", name: "Movie+", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-zapptv", name: "ZappTV", kind: "live" },
  { repo: "xuper-plugin/kino-plugin-hdfull", name: "HDFull", kind: "movies", needsResolver: true },
  { repo: "xuper-plugin/kino-plugin-animes-es", name: "AnimES", kind: "anime" },
  { repo: "xuper-plugin/kino-plugin-cinehdplus", name: "CineHD Plus", kind: "movies", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-cinemitas", name: "Cinemitas", kind: "movies", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-cuevanapro", name: "Cuevana Pro", kind: "movies", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-doramasyt", name: "DoramasYT", kind: "series", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-embed69", name: "Embed 69", kind: "movies", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-lacartoons", name: "LA Cartoons Plus", kind: "kids", needsResolver: true, snapshot: true },
  { repo: "xuper-plugin/kino-plugin-latino", name: "Latino", kind: "movies", needsResolver: true, snapshot: true },
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

/** The icon a card shows: the plugin's own icon.png on its default branch (a public https picture needs no host). */
export const iconOf = (entry) => `https://raw.githubusercontent.com/${entry.repo}/HEAD/icon.png`;

/** The catalog entry of [repo] (any case), or null. */
export function entryOf(repo) {
  const key = String(repo || "").toLowerCase();
  if (key === RESOLVER.repo) return RESOLVER;
  return PLUGINS.find((p) => p.repo === key) || null;
}
