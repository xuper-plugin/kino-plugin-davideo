# Da-Video: notices for new episodes of the series you watch

Date: 2026-11-24. Owner decisions are marked **(owner)**; everything else marked *(call)* is the designer's call, open to correction.

## Intent

Da-Video should have "something special": it notices, on the person's own device and with no server, when a **new episode**
comes out of a series the person has been watching **in any of their plugins**, and it tells them only once that episode is
already **available in one of the xuper-plugin plugins they have installed**. Tapping the notice **plays that episode in the
plugin that has it** **(owner: option A)**. The model is Mega Catálogo's "Capítulos nuevos de tus series" (its `episodes` job,
`src/episodeWatch.js` and `src/follows.js` in `kinotvapp/kino-plugin-mega-catalogo`), which follows series by hand and checks
TMDB; Da-Video follows by itself, from what the person actually watched, and checks that a plugin really has the episode.

## Goals

- Know what the person watches without any plugin recording it: Kino's library (`kino.library.watched`, apiVersion 14; the
  `season`/`episode` of the latest chapter played since Kino 0.9.77) lists every series the active profile watched, from any
  source, with its TMDB id **(owner: use the stats Kino already keeps instead of a new entry in every plugin)**.
- Know a new episode aired: TMDB's `last_episode_to_air` for that series (through `kino.tmdb`, as Mega Catálogo does).
- Know which installed plugin has it: Da-Video already asks the person's xuper-plugin plugins through the federation door
  `catalog` (`kino.plugins.callAll`, call `search`); the door gains a second call, `episodes`.
- One bell notice per new episode (`kino.notifications`), whose tap plays it in that plugin.
- **The robust version at once (owner, 2026-11-24):** it needs a small Kino change (below), so it ships with the next Kino
  release; the plugin side is built now against that shape.

## Non-goals

- No server, no tracker: the `tracking` capability (red "le contará a un servicio qué ves") is not used.
- Movies, live channels, music: series only.
- Following series by hand (Mega Catálogo does that); Da-Video follows what was watched.
- Plugins of other authors: only the person's installed xuper-plugin plugins are asked (the federation is by author).

## Anti-goals (a failure even if it works)

- A notice for an episode no installed plugin can play.
- Spam: old episodes, several notices for one episode, a notice for a series the person dropped long ago.
- A tap that lands on an error or on the wrong episode.
- Any public text naming Xuper.
- Breaking the plugins' existing `catalog` door for Da-Video's search.

## Constraints (measured from the contract, docs/plugins/README.md and kino.d.ts in kinotvapp/kino-app)

- A job runs headless at most 20 s, **10 requests**, 2 MB of answers, 256 KB written to `kino.storage` per run, 96 runs a day.
- `kino.library`: 30 calls a minute, at most 100 titles a call; readable from a job; never says which plugin a title came from.
- `kino.notifications.post`: 20 posts an hour, 30 kept per plugin, 30 days; notices are per device, not synced; `go` may be
  `{ screen: { route, args } }`, `{ title }` (this plugin's own) or `{ titleByIds }`.
- New capabilities `library` (red consent line) and `notifications` (plain line): the person approves them on the update.
- Plugins are built from `src/` and bundled; std is copied per plugin; each plugin is versioned and signed with the
  xuper-plugin author key (E04E-EA25-1A34-290E).

## Approaches

1. **Da-Video does it all, plus an `episodes` call on the plugins' `catalog` door** — *chosen* **(owner)**. Kino's library says
   what was watched and up to which episode; TMDB says a new one aired; the door says which plugin has it and gives its ref.
   Ships as plugin updates only.
2. Kino does it natively (it has the history and calls plugins' `episodes()` itself): no plugin changes and a real "play"
   button, but it is not Da-Video's, and it needs a Kino release. Rejected: the owner wants it to be Da-Video's.
3. Da-Video alone, no plugin changes: the notice opens Kino's own page of the series (`go.titleByIds`) where the person picks
   a source. Cheapest, but it cannot know any plugin has the episode nor play it. Rejected: fails "available" and option A.

## Design

### The door call (std, every xuper-plugin plugin that provides `catalog`)
- `catalog` gains `episodes: { in: { ref: "string" }, out: "Episode[]" }` next to `search`, answered by the plugin's own
  `episodes()` export (same shape Kino gets: season, number, ref, title). A plugin without `episodes` does not declare it.
- `search` already accepts `q` and `type`; Da-Video passes the TMDB id too when the std search can match by it *(call: match
  by TMDB id when the plugin's items carry it, else by title + year, as Da-Video's search does today)*.
- Each plugin: std copy, manifest `provides` update, version bump, CHANGELOG, build, sign, validate.

### Da-Video's job `episodes` (new, beside `update`)
Per run, within 10 requests *(call: round-robin over the watched series, a few per run, the cursor kept in `kino.storage`)*:
1. `kino.library.watched({ kind: "series", limit: 100 })` (cached for the day) → series with `ids.tmdb` and, when known,
   `season`/`episode` of the latest chapter played. Series last played more than N days ago are skipped *(call: 60 days)*.
2. For the next series in turn, TMDB `/tv/{id}` → `last_episode_to_air`. If it is after what the person last played (or after
   the baseline stored the first time Da-Video saw the series: no notice for episodes that existed before), it is a candidate.
3. For a candidate, ask the installed plugins (`callAll` `search`, then `episodes` on the first plugin whose item matches)
   until one lists that season/episode. None → retry on a later run (*call: up to 7 days, then drop*).
4. Post one notice, id `ep-<tmdb>-s<season>e<episode>`, title "Nuevo capítulo de <serie>", text "T<s>·E<e> ya está en
   <plugin>", ES and EN; remember it so it is never posted twice.

### What Kino 0.9.93 cannot do (measured by the builder check on origin/main 4315f42b5)
- A job cannot use the federation: `kino.plugins.callAll`/`call`/`providers` answer `not_allowed` in a job
  (`data/plugin/PluginJobs.kt:202-207`), so step 3 cannot run in the background.
- There is no episode card: item kinds are movie, series, live, music, podcast (`PluginOutput.kt:524`); a series card with
  `origin` opens that plugin's series page (`ScreenGoHandler.kt:820-841`, `PluginOrigins.kt:10-18`) with no episode selected
  (the `ep` route arg is only a library episode id from "Continuar viendo", `TitleRoute.kt:137-166`).
- A notice's `go` has no `origin`; a screen's `open` answer cannot `go.title`/`go.play`. Every `kino.tmdb` call counts as one of
  the job's 10 requests, cached or not (`PluginJobs.kt:167`).

### The Kino change (next release, a new apiVersion — 35 unless another feature takes it first)
1. **Federation in jobs (read-only):** a job may `kino.plugins.call` / `callAll` the doors its manifest `consumes`; each call
   counts as one of the run's requests (as `kino.tmdb` does); the callee runs with its own limits, never its own `job` turn;
   still never `kino.manage` writes nor anything 18+.
2. **Play one episode in another plugin:** a new `go` shape `{ episode: { origin, ref, season, episode, title? } }` —
   `origin` a plugin repo the caller consumes (resolved by `PluginOrigins`, so it must be installed, usable, set up, not 18+),
   `ref` that plugin's series ref. Kino asks that plugin's `episodes(ref)`, plays the one with that season/number with the
   normal resolve/progress/library path (saved as the series' episode, never as a movie); if the plugin no longer lists it,
   Kino opens that plugin's series page instead (never an error screen). Allowed in a notification's `go` and from a screen
   node's tap. Kino's own catalog: ES+EN strings, contract.json, kino.d.ts, README, kit validator and shim, tests.
3. Older Kinos: Da-Video feature-detects (`kino.pluginApiVersion >= 35`); below it the job does nothing and the screen does not
   offer the switch. Da-Video's own `apiVersion` is raised only through `enhancements`, so it keeps installing on older Kinos.

### The tap
The notice's `go` is `{ episode: { origin: <repo>, ref, season, episode } }`: one tap plays it in that plugin.

### Settings and limits
- The job is off until the person switches it on, like every job; Da-Video's screen offers it ("Avísame de capítulos nuevos").
- *(call)* At most 5 notices a run, newest series first.
- *(call)* **Numbering:** an episode counts as present when the plugin lists that season and number; for a plugin that lists a
  single season (anime numbered straight through), the TMDB absolute number (episodes of earlier seasons + number) is matched
  instead; a plugin that matches neither is skipped for that notice (never a guess).
- *(call)* **Profiles:** the active profile only (Kino refuses notices in another profile's turn); baselines, the library cache
  and the notified ids are kept per profile.

## Left to the builder
- Exact round-robin size per run to stay within 10 requests (TMDB + door calls).
- Storage keys and pruning (baseline per series, notified ids, retry window).
- Where the matching of a plugin item to a TMDB id lives (std `catalog` vs Da-Video; the std `catalogQuery` passes
  `tmdbId: 0` today, Latino `src/std/catalog.js`).
- The Kino change is built in a kino-app worktree (Kotlin, i18n ES+EN, sync rules unaffected: nothing new is persisted).
- Tests with the kit's `KINO_LIBRARY_FIXTURE`, a fake TMDB, fake door answers, and `node sdk/run.mjs <folder> job episodes`.
