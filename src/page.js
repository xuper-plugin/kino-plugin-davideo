// Da-Video's own page under the standard bar: Kino Resolver (the heart) first, then the person's plugins of xuper-plugin with
// what each needs (an update, its setup), then the ones still to install. Everything it knows comes from Kino:
// kino.manage.updates() (installed, versions, the update the last check found), kino.plugins.setupStatus (a plugin's setup).
import { OWNER, RESOLVER, PLUGINS, entryOf, iconOf } from "./catalog.js";

const POLL_MS = 3_000;
const IDLE_POLL_MS = 5_000;

const k = () => globalThis.kino;
const say = (es, en) => ({ text: es, textEn: en });
const label = (es, en) => ({ labelText: es, labelTextEn: en });
const text = (key, es, en, extra = {}) => ({ type: "Text", key, ...say(es, en), ...extra });

/** What Kino says about the person's plugins of xuper-plugin: { ok, code?, plugins: { repo -> row }, running, lastResult }. */
export async function loadStatus() {
  const kino = k();
  const out = { ok: false, code: null, plugins: {}, running: false, lastResult: [] };
  if (!kino || typeof kino.manage !== "object") { out.code = "old_kino"; return out; }
  try {
    const u = await kino.manage.updates();
    out.ok = true;
    out.running = !!u.running;
    out.lastResult = Array.isArray(u.lastResult) ? u.lastResult.slice(0, 64) : [];
    for (const p of Array.isArray(u.plugins) ? u.plugins : []) {
      if (!p || typeof p.repo !== "string") continue;
      out.plugins[p.repo] = { name: String(p.name || p.repo), version: String(p.version || ""), available: p.available || null, enabled: p.enabled !== false };
    }
  } catch (e) {
    out.code = (e && e.code) || "error";
    return out;
  }
  // Setup: only for the installed plugins that have one, as Kino last heard it (no call to them).
  for (const p of PLUGINS) {
    const row = out.plugins[p.repo];
    if (!p.setup || !row) continue;
    try {
      const s = await kino.plugins.setupStatus(p.repo);
      row.setupReady = !!s.ready;
      row.setupRunning = !!s.running;
    } catch { /* no setup known: nothing to show */ }
  }
  return out;
}

/** Whether Kino's own row of the update job is on (kino.jobOn, a screen call only); null when this Kino cannot say. */
export function jobIsOn() {
  const kino = k();
  try { return typeof kino.jobOn === "function" ? !!kino.jobOn("update") : null; } catch { return null; }
}

const statusState = (st) => ({ mp: st, jobOn: jobIsOn(), busy: st.running || Object.values(st.plugins).some((r) => r.setupRunning) });

/** The page's events (std's `page.events`). */
export const PAGE_EVENTS = {
  async refresh() {
    return { state: statusState(await loadStatus()) };
  },
  // Kino starts every job off: the person's own tap turns the 4-hourly update on (enableJob; Kino drops it from a timer).
  filter({ value }) {
    const v = Array.isArray(value) ? value[0] : value;
    return { state: { filter: FILTERS.includes(v) ? v : "all" } };
  },
  enableAuto() {
    return { enableJob: "update", state: { jobOn: true } };
  },
  async checkNow() {
    return startPass(null);
  },
  async updateOne({ arg }) {
    return typeof arg === "string" ? startPass([arg]) : null;
  },
  async setupPlugin({ arg }) {
    if (typeof arg !== "string") return null;
    try {
      await k().plugins.setup(arg);
    } catch (e) {
      return { state: { notice: noticeOf((e && e.code) || "error") } };
    }
    return { state: { ...statusState(await loadStatus()), busy: true, notice: null } };
  },
};

async function startPass(only) {
  let notice = null;
  try {
    const r = await k().manage.updateAll(only ? { only } : undefined);
    if (r && r.started === false && r.running) notice = "running";
  } catch (e) {
    notice = (e && e.code) || "error";
  }
  return { state: { ...statusState(await loadStatus()), busy: true, notice: notice ? noticeOf(notice) : null } };
}

/** A short line for what Kino answered, ES and EN. */
function noticeOf(code) {
  switch (code) {
    case "rate_limited": return ["Ya revisamos hace poco. Intenta de nuevo en unos minutos.", "We checked a moment ago. Try again in a few minutes."];
    case "auto_update_off": return ["Activa «Actualizar plugins automáticamente» en Ajustes de Kino para actualizar desde aquí.", "Turn on “Update plugins automatically” in Kino's Settings to update from here."];
    case "running": return ["Ya estamos actualizando tus plugins.", "Your plugins are already updating."];
    case "refused": return ["No se configuró: lo cancelaste.", "Not set up: you cancelled it."];
    default: return ["Kino no pudo hacerlo esta vez.", "Kino couldn't do it this time."];
  }
}

const resultLine = (r) => {
  if (!r || typeof r.status !== "string") return null;
  switch (r.status) {
    case "updated": return [`Actualizado a ${r.to}`, `Updated to ${r.to}`];
    case "left": return [`La versión ${r.to} espera tu aprobación en Plugins`, `Version ${r.to} waits for your approval in Plugins`];
    case "later": return [`Se actualizará cuando termine el video`, `It will update when the video ends`];
    case "failed": return [`No se pudo actualizar esta vez`, `Couldn't update this time`];
    default: return null;
  }
};

/** An icon-only button: [es]/[en] are what a screen reader says and the tooltip. */
const iconBtn = (key, icon, es, en, onPressed) => ({ type: "IconButton", key, icon, labelText: es, labelTextEn: en, tooltip: es, tooltipEn: en, onPressed });

/**
 * One compact card of the grid: the icon on top (a tap on an installed card opens the plugin), the name, then icon-only buttons:
 * uninstall (and update or set up when it needs it) when installed, the heart (Kino Resolver) never uninstalled, download when not.
 */
function pluginCard(entry, row, last, i, { heart = false } = {}) {
  const installed = !!row;
  const lines = [
    { type: "Image", key: `icon-${i}`, url: iconOf(entry), w: 64, h: 64, radius: "large", fit: "cover",
      fallback: { type: "Icon", key: `iconFb-${i}`, name: "movie", color: "muted" } },
    text(`name-${i}`, entry.name, entry.name, { style: "label", textAlign: "center", maxLines: 1 }),
  ];
  if (installed && row.available) {
    lines.push({ type: "Badge", key: `updBadge-${i}`, text: `v${row.available}`, textEn: `v${row.available}`, color: "primary" });
  } else if (installed) {
    lines.push(text(`ver-${i}`, `v${row.version}`, `v${row.version}`, { style: "caption", color: "muted", textAlign: "center" }));
  }
  if (installed && entry.setup && row.setupReady === false && !row.setupRunning) {
    lines.push(text(`setupNeed-${i}`, "Configúralo", "Set it up", { style: "caption", color: "error", textAlign: "center" }));
  }
  const l = installed ? resultLine(last) : null;
  if (l && last.status !== "updated") lines.push(text(`last-${i}`, l[0], l[1], { style: "caption", color: "muted", textAlign: "center", maxLines: 2 }));
  const buttons = [];
  if (!installed) {
    buttons.push(iconBtn(`install-${i}`, "download", `Instalar ${entry.name}`, `Install ${entry.name}`, { go: { installPlugin: { repo: entry.repo } } }));
  } else {
    if (!heart) buttons.push(iconBtn(`uninstall-${i}`, "delete", `Desinstalar ${entry.name}`, `Uninstall ${entry.name}`, { go: { uninstallPlugin: { repo: entry.repo } } }));
    if (row.available) buttons.push(iconBtn(`update-${i}`, "refresh", `Actualizar ${entry.name}`, `Update ${entry.name}`, { event: "updateOne", arg: entry.repo }));
    if (entry.setup && row.setupReady === false && !row.setupRunning) buttons.push(iconBtn(`setup-${i}`, "settings", `Configurar ${entry.name}`, `Set up ${entry.name}`, { event: "setupPlugin", arg: entry.repo }));
  }
  return {
    type: "Card", key: `card-${i}`,
    // Installed: a green edge (Kino's success colour); a tap on it opens the plugin (never the heart: it has no screen to show).
    ...(installed ? { border: { width: 2, color: "success" } } : {}),
    ...(installed && !heart ? { onTap: { go: { plugin: { repo: entry.repo } } } } : {}),
    children: [{ type: "Column", padding: 8, gap: 4, crossAxisAlignment: "center", children: [
      ...lines,
      ...(buttons.length ? [{ type: "Row", key: `actions-${i}`, mainAxisAlignment: buttons.length > 1 ? "spaceBetween" : "center", children: buttons }] : []),
    ] }],
  };
}

/** The filter of the grid, a state of the page: all (installed first), installed, not installed. */
const FILTERS = ["all", "installed", "missing"];
const filterOf = (state) => (state && FILTERS.includes(state.filter) ? state.filter : "all");

const grid = (key, cards) => ({ type: "GridView", key, columns: { compact: 2, medium: 3, expanded: 4 }, gap: 8, children: cards });

/** The page's nodes (std's `page.view`). */
export function pageView({ state }) {
  const st = state && state.mp;
  const nodes = [];
  if (state && Array.isArray(state.notice)) nodes.push(text("notice", state.notice[0], state.notice[1], { color: "primary" }));
  if (!st) return [...nodes, { type: "Skeleton", key: "loading", shape: "block", height: 160 }];
  if (!st.ok) {
    const why = st.code === "old_kino"
      ? ["Actualiza Kino para que Da-Video pueda ver y mantener al día tus plugins.", "Update Kino so Da-Video can see your plugins and keep them up to date."]
      : ["Kino todavía no dejó a Da-Video revisar tus plugins. Revisa sus permisos en Plugins.", "Kino hasn't let Da-Video look at your plugins yet. Check its permissions in Plugins."];
    nodes.push(text("noManage", why[0], why[1], { color: "muted" }));
  }
  if (state.jobOn === false) {
    nodes.push({ type: "Card", key: "autoCard", children: [{ type: "Column", padding: 12, gap: 8, children: [
      text("autoOffTitle", "Actualizaciones automáticas: apagadas", "Automatic updates: off", { style: "h5" }),
      text("autoOffText", "Actívalas y Da-Video mantendrá al día tus plugins cada 4 horas, sin preguntarte cada vez.",
        "Turn them on and Da-Video keeps your plugins up to date every 4 hours, without asking each time.", { color: "muted" }),
      { type: "ElevatedButton", key: "enableAuto", icon: "sync", ...label("Activar", "Turn on"), onPressed: { event: "enableAuto" } },
    ] }] });
  }
  // The search, Google-like, on top of the grid: it asks every one of your plugins (std's searchHere).
  nodes.unshift({ type: "TextField", key: "dvSearch", kind: "search", maxLength: 200, hintText: "Buscar película o serie", hintTextEn: "Search a movie or a series",
    onSubmitted: "search", trailingIcon: "search", trailingLabel: "Buscar", trailingLabelEn: "Search", onTrailingTap: "search" });
  const lastOf = (repo) => (st.lastResult || []).find((r) => r && r.repo === repo);
  // The plugins: the filter, then the grid (installed first when it shows all).
  const filter = filterOf(state);
  nodes.push({ type: "Row", key: "pluginsHead", gap: 8, crossAxisAlignment: "center", children: [
    text("mineTitle", "Tus plugins", "Your plugins", { style: "h4" }),
    { type: "TextButton", key: "checkNow", icon: "refresh", ...label(st.running ? "Actualizando…" : "Buscar actualizaciones", st.running ? "Updating…" : "Check for updates"), onPressed: { event: "checkNow" } },
  ] });
  nodes.push({ type: "Chips", key: "filter", value: filter, onChange: { event: "filter" }, options: [
    { value: "all", label: "Todos", labelEn: "All" },
    { value: "installed", label: "Instalados", labelEn: "Installed" },
    { value: "missing", label: "No instalados", labelEn: "Not installed" },
  ] });
  // The heart (Kino Resolver) is one more card, always first of its group.
  const all = [RESOLVER, ...PLUGINS];
  const installed = all.filter((p) => st.plugins[p.repo]);
  const missing = all.filter((p) => !st.plugins[p.repo]);
  const shown = filter === "installed" ? installed : filter === "missing" ? missing : [...installed, ...missing];
  if (!shown.length) {
    nodes.push(text("emptyFilter", filter === "installed" ? "Todavía no tienes ninguno instalado." : "Ya los tienes todos.",
      filter === "installed" ? "You have none installed yet." : "You have them all.", { color: "muted" }));
  } else {
    nodes.push(grid("pluginsGrid", shown.map((p) => pluginCard(p, st.plugins[p.repo] || null, lastOf(p.repo), all.indexOf(p), { heart: p === RESOLVER }))));
  }
  nodes.push(text("autoText", `Da-Video revisa tus plugins de ${OWNER} cada 4 horas. Cámbialo en Ajustes ▸ Plugins ▸ Da-Video.`,
    `Da-Video checks your ${OWNER} plugins every 4 hours. Change it in Settings ▸ Plugins ▸ Da-Video.`, { color: "muted" }));
  return [{ type: "Column", key: "dvPage", crossAxisAlignment: "stretch", padding: { compact: 12, expanded: 24 }, gap: 12, children: nodes }];
}

/** The page's timer: while a pass or a setup runs, refresh every few seconds. */
// While a pass or a setup runs, every few seconds; otherwise a slower look, so a plugin installed from here (its own screen
// opens over this one) shows under «Tus plugins» once the person is back. Cheap: kino.manage.updates() never leaves the device.
export const pageEvery = ({ state }) => ({ ms: state && state.busy ? POLL_MS : IDLE_POLL_MS, event: "refresh" });

export { entryOf };
