// The plugins Da-Video knows how to offer: each is a repository of xuper-plugin. `setup: true` marks one with a setup step
// Kino runs (its manifest's `setup` block), so Da-Video can show Configurar. Kino Resolver is the heart: most of them play
// through it.

export const OWNER = "xuper-plugin";

export const RESOLVER = { repo: "xuper-plugin/kino-plugin-kino-resolver", name: "Kino Resolver" };

export const PLUGINS = [
  { repo: "xuper-plugin/kino-plugin-animes-es", name: "AnimES", kind: "anime" },
  { repo: "xuper-plugin/kino-plugin-cinehdplus", name: "CineHD Plus", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-cinemitas", name: "Cinemitas", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-cuevanapro", name: "Cuevana Pro", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-doramasyt", name: "DoramasYT", kind: "series" },
  { repo: "xuper-plugin/kino-plugin-embed69", name: "Embed 69", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-hdfull", name: "HDFull", kind: "movies", setup: true },
  { repo: "xuper-plugin/kino-plugin-lacartoons", name: "LA Cartoons Plus", kind: "kids" },
  { repo: "xuper-plugin/kino-plugin-latino", name: "Latino", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-mundodonghua", name: "MundoDonghua", kind: "anime" },
  { repo: "xuper-plugin/maraton", name: "PelisYSeries", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-peliculasflix", name: "PeliculasFlix", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-pelisgo", name: "Pelisgo", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-pelispedia", name: "Pelispedia", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-seriesflix", name: "Seriesflix", kind: "series" },
  { repo: "xuper-plugin/kino-plugin-serieskao", name: "SeriesKao", kind: "series" },
  { repo: "xuper-plugin/kino-plugin-seriesmetro", name: "SeriesMetro", kind: "series" },
  { repo: "xuper-plugin/kino-plugin-sololatino", name: "SoloLatino", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-latanime", name: "TodoAnime", kind: "anime" },
  { repo: "xuper-plugin/kino-plugin-verpelis", name: "VerPelis", kind: "movies" },
  { repo: "xuper-plugin/kino-plugin-xuper", name: "Xuper", kind: "live" },
  { repo: "xuper-plugin/kino-plugin-zapptv", name: "ZappTV", kind: "live" },
];

/** The icon a card shows: the plugin's own icon.png on its default branch (a public https picture needs no host). */
export const iconOf = (entry) => `https://raw.githubusercontent.com/${entry.repo}/HEAD/icon.png`;

/** The catalog entry of [repo] (any case), or null. */
export function entryOf(repo) {
  const key = String(repo || "").toLowerCase();
  if (key === RESOLVER.repo) return RESOLVER;
  return PLUGINS.find((p) => p.repo === key) || null;
}
