// Da-Video's own page under the standard bar: Kino Resolver (the heart) first, then the person's plugins of xuper-plugin with
// what each needs (an update, its setup), then the ones still to install. Everything it knows comes from Kino:
// kino.manage.updates() (installed, versions, the update the last check found), kino.plugins.setupStatus (a plugin's setup).
import { OWNER, RESOLVER, PLUGINS, entryOf } from "./catalog.js";

const POLL_MS = 3_000;

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

function pluginCard(entry, row, last, i) {
  const lines = [text(`name-${i}`, entry.name, entry.name, { style: "h5" })];
  if (row) {
    const sub = row.available ? [`Versión ${row.version} · hay una nueva: ${row.available}`, `Version ${row.version} · a new one: ${row.available}`]
      : [`Versión ${row.version}`, `Version ${row.version}`];
    lines.push(text(`ver-${i}`, sub[0], sub[1], { color: row.available ? "primary" : "muted" }));
    if (!row.enabled) lines.push(text(`off-${i}`, "Está apagado en Plugins.", "It is switched off in Plugins.", { color: "muted" }));
    if (entry.setup && row.setupRunning) lines.push(text(`setupRun-${i}`, "Configurándose…", "Setting up…", { color: "muted" }));
    else if (entry.setup && row.setupReady === false) lines.push(text(`setupNeed-${i}`, "Necesita configurarse.", "Needs to be set up.", { color: "error" }));
    const l = resultLine(last);
    if (l) lines.push(text(`last-${i}`, l[0], l[1], { color: "muted" }));
  }
  const buttons = [];
  if (!row) {
    buttons.push({ type: "ElevatedButton", key: `install-${i}`, icon: "download", ...label("Instalar", "Install"), onPressed: { go: { installPlugin: { repo: entry.repo } } } });
  } else {
    if (row.available) buttons.push({ type: "ElevatedButton", key: `update-${i}`, icon: "refresh", ...label("Actualizar", "Update"), onPressed: { event: "updateOne", arg: entry.repo } });
    if (entry.setup && row.setupReady === false && !row.setupRunning) buttons.push({ type: "ElevatedButton", key: `setup-${i}`, icon: "settings", ...label("Configurar", "Set up"), onPressed: { event: "setupPlugin", arg: entry.repo } });
    buttons.push({ type: "TextButton", key: `open-${i}`, ...label("Abrir", "Open"), onPressed: { go: { plugin: { repo: entry.repo } } } });
  }
  return { type: "Card", key: `card-${i}`, children: [{ type: "Column", padding: 12, gap: 8, children: [...lines, { type: "Row", key: `actions-${i}`, gap: 8, children: buttons }] }] };
}

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
  const lastOf = (repo) => (st.lastResult || []).find((r) => r && r.repo === repo);
  // The heart first.
  nodes.push(text("heartTitle", "El corazón", "The heart", { style: "h4" }));
  nodes.push(text("heartText", "Kino Resolver abre los servidores de casi todos tus plugins.", "Kino Resolver opens the servers of almost all your plugins.", { color: "muted" }));
  nodes.push(pluginCard(RESOLVER, st.plugins[RESOLVER.repo], lastOf(RESOLVER.repo), 0));
  // What the person has, then what is missing.
  const mine = PLUGINS.filter((p) => st.plugins[p.repo]);
  const missing = PLUGINS.filter((p) => !st.plugins[p.repo]);
  nodes.push(text("mineTitle", "Tus plugins", "Your plugins", { style: "h4" }));
  nodes.push(
    { type: "TextButton", key: "checkNow", icon: "refresh", ...label(st.running ? "Actualizando…" : "Buscar actualizaciones", st.running ? "Updating…" : "Check for updates"), onPressed: { event: "checkNow" } },
  );
  if (!mine.length) nodes.push(text("mineEmpty", "Todavía no tienes ninguno. Instala uno de abajo.", "You don't have any yet. Install one below.", { color: "muted" }));
  mine.forEach((p, i) => nodes.push(pluginCard(p, st.plugins[p.repo], lastOf(p.repo), i + 1)));
  if (missing.length) {
    nodes.push(text("missingTitle", "Para instalar", "To install", { style: "h4" }));
    missing.forEach((p, i) => nodes.push(pluginCard(p, null, null, 100 + i)));
  }
  nodes.push(text("autoText", `Da-Video revisa tus plugins de ${OWNER} cada 4 horas. Cámbialo en Ajustes ▸ Plugins ▸ Da-Video.`,
    `Da-Video checks your ${OWNER} plugins every 4 hours. Change it in Settings ▸ Plugins ▸ Da-Video.`, { color: "muted" }));
  return [{ type: "Column", key: "dvPage", crossAxisAlignment: "stretch", padding: { compact: 12, expanded: 24 }, gap: 12, children: nodes }];
}

/** The page's timer: while a pass or a setup runs, refresh every few seconds. */
export const pageEvery = ({ state }) => (state && state.busy ? { ms: POLL_MS, event: "refresh" } : null);

export { entryOf };
