// The shared Home of Da-Video's Contenido tab: home/content.json from the ready copies (home/index.json and home/<tab>.json) of
// every plugin in Da-Video's catalog that keeps one, merged into one card per title with every plugin that has it, rows by
// category (src/content.js buildShared). Run by .github/workflows/content-snapshot.yml every 6 hours, after the plugins' own.
// A plugin whose files are missing or over 48 h old is left out; nothing is written when no plugin answered.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BUILT_IN_PLUGINS, parseCatalog } from "../src/catalog.js";
import { buildShared, pickForInstalled } from "../src/content.js";

const ROOT = new URL("../", import.meta.url);
// The same list the devices use: this checkout's catalog.json (the built-in one if it is missing or not valid).
const catalogFile = new URL("catalog.json", ROOT);
const PLUGINS = (existsSync(catalogFile) && parseCatalog(readFileSync(catalogFile, "utf8"))?.plugins) || BUILT_IN_PLUGINS;
const TABS_PER_PLUGIN = 3;
const FILE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const raw = (repo, name) => `https://raw.githubusercontent.com/${repo}/main/home/${encodeURIComponent(name)}.json`;

async function getJson(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "Cache-Control": "no-cache" } });
    return r.ok ? await r.json() : null;
  } catch (_) { return null; }
}

const now = Date.now();
const sources = [];
for (const p of PLUGINS.filter((x) => x.snapshot === true)) {
  const index = await getJson(raw(p.repo, "index"));
  const tabs = index && Array.isArray(index.tabs) ? index.tabs.map((t) => t && t.id).filter((x) => typeof x === "string").slice(0, TABS_PER_PLUGIN) : [];
  const files = await Promise.all(tabs.map((id) => getJson(raw(p.repo, id))));
  const rows = [];
  files.forEach((f, i) => { if (f && f.tab === tabs[i] && Array.isArray(f.rows) && now - Number(f.at) <= FILE_MAX_AGE_MS) rows.push(...f.rows); });
  console.log(`${p.name}: ${tabs.length} tabs, ${rows.length} rows`);
  if (rows.length) sources.push({ repo: p.repo, kind: p.kind, rows });
}
if (sources.length === 0) { console.log("no plugin answered: content.json left as it was"); process.exit(1); }

const shared = buildShared(sources, now);
const all = pickForInstalled(shared, sources.map((s) => s.repo));
console.log(`shared: ${shared.rails.length} rows, ${shared.rails.reduce((n, r) => n + r.items.length, 0)} cards; with every plugin: ${all.slides.length} slides, ${all.rails.map((r) => r.title + " " + r.items.length).join(" | ")}`);

const dir = new URL("home/", ROOT);
mkdirSync(dir, { recursive: true });
const file = new URL("content.json", dir);
// Unchanged rows under 12 h are not rewritten: a commit only when the Home changed (the device ignores a file over 48 h).
const old = existsSync(file) ? (() => { try { return JSON.parse(readFileSync(file, "utf8")); } catch (_) { return null; } })() : null;
if (old && JSON.stringify(old.rails) === JSON.stringify(shared.rails) && now - Number(old.at) < 12 * 60 * 60 * 1000) { console.log("unchanged"); process.exit(0); }
writeFileSync(file, JSON.stringify(shared) + "\n");
console.log(`written: ${JSON.stringify(shared).length} bytes`);
