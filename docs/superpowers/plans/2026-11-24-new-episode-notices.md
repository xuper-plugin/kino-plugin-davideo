# New-episode notices (Da-Video) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Da-Video posts one bell notice per new episode of a series the person watched, only once one of their installed xuper-plugin plugins has it, and one tap plays it there.

**Architecture:** Three parts, each testable on its own, built in order. Part 1 (Kino app) lets a job call the federation doors it consumes and adds a `go.episode` shape that plays one chapter of another plugin's series. Part 2 (std + plugins) adds an `episodes` call to the `catalog` door. Part 3 (Da-Video) adds the `episodes` job: Kino's library → TMDB → door → notice.

**Tech Stack:** Kotlin/Android (kino-app, JUnit), plugin JavaScript (ES modules, built to `plugin.js`, `node --test`, the kit's `sdk/run.mjs` and `sdk/validate.mjs`).

**Spec:** `C:\dev\xuper-plugin\kino-plugin-davideo\docs\superpowers\specs\2026-11-24-new-episode-notices-design.md` (owner-approved 2026-11-24). Part 1 file:line facts come from the builder check on kino-app `origin/main` 4315f42b5.

## Global Constraints

- Kino work in a NEW kino-app worktree from `origin/main` (`.claude/worktrees/episode-go`, branch `feat/episode-go`); never the main tree. Commits as `kinotvapp <332969319+kinotvapp@users.noreply.github.com>`; plugin repos as `xuper-plugin <335105665+xuper-plugin@users.noreply.github.com>`. No `Co-Authored-By` line, ever. Never `git add -A`.
- Code, comments, commits in English. Every user-visible Kino text in `i18n/StringsEs.kt` + `StringsEn.kt` (tuteo, never voseo); plugin texts ES + EN.
- Never write "Xuper" in public text (notices, CHANGELOGs, docs).
- Gradle: one build at a time on this PC (the hook enforces it); run only the test classes you touched; no release build; check `~/.claude/kino-deploy.lock` before any Gradle run and stop if it exists.
- Kino apiVersion **35** (Kino **0.9.94**), additive: `additiveFromApp` gets `"job.plugins": "0.9.94"` and `"go.episode": "0.9.94"`; plugins need NOT declare 35 to use them (Da-Video stays at apiVersion 31 and feature-detects `kino.pluginApiVersion >= 35`).
- Job limits unchanged: 20 s, 10 requests, 2 MB, 256 KB storage per run, 96 runs a day. Each `kino.plugins.call`/`callAll` in a job = 1 request (callAll counts once).
- Spec values: series last played > **60 days** ago skipped; at most **5** notices a run; retry a candidate for **7 days**; notice id `ep-<tmdb>-s<season>e<episode>`; active profile only.
- Plugins are built from `src/` and bundled, signed with the xuper-plugin key (E04E-EA25-1A34-290E) via the std scripts; nothing is published (pushed to a plugin's `main`) without the owner's order.

## Review Focus

1. A watched series with no TMDB id, or no `season`/`episode` (older Kino, unnumbered source) → skipped or baselined silently, never a notice (Task 7 test `skips titles without a TMDB id`, `baselines when the library has no episode`).
2. The origin plugin was uninstalled, disabled or made 18+ between notice and tap → Kino shows its usual "No se pudo abrir", never a crash or another plugin's content (Task 3 test `go.episode whose origin is no longer usable is refused`).
3. The plugin no longer lists that chapter at tap time → Kino opens that plugin's series page (Task 3 test `missing chapter opens the series page`).
4. A run after a reinstall or a storage wipe → no burst of old notices: a series first seen is baselined (Task 7 test `first sight of a series posts nothing`).
5. Library permission off, notifications off, or a Kino below 35 → the job returns `{ skipped: <reason> }`, never throws (Task 7 test `quiet when library is denied / Kino is older`).

---

## Part 1 — Kino app (kino-app worktree `feat/episode-go`)

### Task 1: A job may call the federation doors it consumes

**Files:**
- Modify: `app/src/main/java/com/arkiv/player/data/plugin/PluginJobs.kt:153-213` (`ALLOWED_NATIVES`, `FORBIDDEN_NATIVES`, `REFUSED_IN_FOREIGN_TURN`)
- Modify: `app/src/main/java/com/arkiv/player/data/plugin/PluginRuntime.kt:1347-1365` (the `plugins` / `pluginsAll` / `pluginsProviders` bindings: comments; request accounting where `tmdb` counts today, `PluginJobs.kt:167`)
- Test: `app/src/test/java/com/arkiv/player/data/plugin/PluginJobsTest.kt`

**Interfaces:**
- Produces: in a job, `kino.plugins.call(door, call, arg)`, `kino.plugins.callAll(entry, call, arg, opts)` and `kino.plugins.providers(entry)` work for the plugin's own `consumes` entries; `pluginsSetup`/`pluginsSetupStatus` stay forbidden.

- [ ] **Step 1: Write the failing tests** in `PluginJobsTest`:
  - `a job may call a door it consumes and it counts as one request` — run a job that calls `kino.plugins.call` 1× and `callAll` 1×; assert both answers arrive and the run's used requests == 2.
  - `the eleventh request in a run is refused even through the federation` — 10 `tmdb` + 1 `plugins.call` → the last rejects with the run's budget error.
  - `a foreign profile turn may not call the federation` — assert `not_allowed`.
  - `everyNativeBindingIsClassified` still passes.
- [ ] **Step 2: Run** `./gradlew :app:testDebugUnitTest --tests '*PluginJobsTest'` → the new tests FAIL with `not_allowed`.
- [ ] **Step 3: Implement**: move `plugins`, `pluginsAll`, `pluginsProviders` from `FORBIDDEN_NATIVES` to `ALLOWED_NATIVES` (comment: "apiVersion 35, Kino 0.9.94: read calls to the doors the job's plugin consumes, each one of the run's requests"); add the three to `REFUSED_IN_FOREIGN_TURN`; charge one request per call at the same spot `tmdb` is charged.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `git add <the three files> && git commit -m "Plugin jobs: a job may call the federation doors it consumes, each call one of the run's requests (apiVersion 35)"`

### Task 2: The `go.episode` shape (parse, validate, carry in notices)

**Files:**
- Modify: `app/src/main/java/com/arkiv/player/data/plugin/PluginScreenTree.kt:1286+` (`sealed interface ScreenGo`)
- Modify: `app/src/main/java/com/arkiv/player/data/plugin/PluginScreenOutput.kt:3075` (`goOf`) and `ScreenLimits` (new `GO_EPISODE = "episode"`)
- Modify: `app/src/main/java/com/arkiv/player/data/plugin/PluginNotifications.kt:31,95-137` (`GO_KEYS`, `goOf`, the go's JSON round trip)
- Test: `app/src/test/java/com/arkiv/player/data/plugin/ScreenGoEpisodeParseTest.kt` (new), `PluginNotificationsTest.kt`

**Interfaces:**
- Produces: `data class ScreenGo.Episode(val origin: String, val ref: String, val season: Int, val episode: Int, val title: String?) : ScreenGo`. Wire: `{ "episode": { "origin": "<owner>/<repo>", "ref": "<series ref>", "season": 0..999, "episode": 1..9999, "title"?: "≤200 chars" } }`.

- [ ] **Step 1: Write the failing tests** (`ScreenGoEpisodeParseTest`):
  - `parses a valid episode go` → `ScreenGo.Episode("xuper-plugin/kino-plugin-latino", "serie/x", 4, 3, null)`.
  - `drops a bad origin, ref, season or episode` — origin without `/`, ref > 4096, season 1000, episode 0, extra field `url` → null, each logged.
  - `allowed from a node tap and a notice, dropped from open, a timer and a playerEvent` (same rule as `titleByIds`).
  - `PluginNotificationsTest`: `a notice keeps an episode go through its JSON round trip`.
- [ ] **Step 2: Run** `./gradlew :app:testDebugUnitTest --tests '*ScreenGoEpisodeParseTest' --tests '*PluginNotificationsTest'` → FAIL (unknown key).
- [ ] **Step 3: Implement** the data class, `GO_EPISODE`, its parse in `PluginScreenOutput.goOf` (same tap-only gating as `titleByIds`), add it to `PluginNotifications.GO_KEYS` and its `toJson`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "Plugin screens and notices: the episode go, one chapter of another plugin's series (apiVersion 35)"`

### Task 3: Follow `go.episode`: play that chapter in the origin plugin

**Files:**
- Modify: `app/src/main/java/com/arkiv/player/ui/plugin/screen/ScreenGoHandler.kt:820-850` (`originOf`, `screenGoRoutes`, a new `playEpisode` route)
- Create: `app/src/main/java/com/arkiv/player/data/plugin/EpisodeGo.kt` (pure helpers)
- Modify: wherever the bell's tap follows a notice's `go` (it must reach the same handler; find it from `PluginNotifications.goOf`'s callers)
- Test: `app/src/test/java/com/arkiv/player/data/plugin/EpisodeGoTest.kt` (new)

**Interfaces:**
- Consumes: `ScreenGo.Episode` (Task 2); `PluginOrigins.resolve(consumer, origin, plugins, adultsUnlocked)`; `PluginContentSource.episodesWithSeries(ref): Pair<List<GatewayEpisode>, GatewaySeries?>`; `SearchPlayback.playPluginSeason(season, chapters, chosen, series): PlaybackResult`.
- Produces: `object EpisodeGo { fun chosen(chapters: List<GatewayEpisode>, season: Int, episode: Int): GatewayEpisode? }` — exact match on season (null season = 1) AND number; never number alone.

- [ ] **Step 1: Write the failing tests** (`EpisodeGoTest`):
  - `picks by season and number, never by number alone` — chapters S1E3 and S4E3; `chosen(…, 4, 3)` is S4E3.
  - `a chapter without season counts as season 1`.
  - `missing chapter answers null`.
  - Handler-level (Robolectric or the existing `ScreenGoHandler` test seam, whichever the file's tests use): `go.episode whose origin is no longer usable is refused` (toast `titleOpenError`, nothing plays); `missing chapter opens the series page`; `found chapter plays through playPluginSeason and is saved as the series' episode`.
- [ ] **Step 2: Run** `./gradlew :app:testDebugUnitTest --tests '*EpisodeGoTest'` → FAIL.
- [ ] **Step 3: Implement**: `originOf` → resolved plugin; build the series `GatewayResult` with that plugin's id and `ref`; `episodesWithSeries(ref)`; `EpisodeGo.chosen`; found → `playPluginSeason(...)` then `play(episodeId)`; not found → `opener(result)` (series page); unresolved origin → toast `titleOpenError`. Route the bell's notice tap through the same handler.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "Plugin screens and notices: an episode go plays that chapter in the plugin that has it, or opens its series page"`

### Task 4: Contract, docs and kit for apiVersion 35

**Files:**
- Modify: `PluginManifest.kt:415` (`SUPPORTED_API = 35`, new `EPISODE_GO_API_VERSION = 35` beside the others), `docs/plugins/contract.json` (`apiVersion`/`maxApiVersion` 35, `apiVersionFromApp["35"] = "0.9.94"`, `additiveFromApp` `job.plugins` and `go.episode` = `"0.9.94"`), `docs/plugins/README.md` (apiVersion row, jobs section "kino.plugins in a job", go table), `docs/plugins/kino.d.ts` (header line, `go.episode` type, job note), `docs/plugins/ui.md` go table, `plugins/sdk/validate.mjs` + the kit shim (accept `go.episode`; a job may call `kino.plugins`).
- Modify the tests that pin the maximum (the same set that pinned 34): `LyricsManifestTest`, `ApiVersion4Test`, `ApiVersion6Test`, `PluginContractParityTest`, `PluginManifestPlayerSlotTest`, `PluginManifestProtocolTest`, `PluginManifestSetupTest`, `QueueConsentTest`, `VisualBrowserTest`, `ScreenGoApplyImageThemeParseTest`, `plugins/sdk/test/{kino-library,kino-services,kit,player-slot,protocol,visual-browser,apply-image-theme}.test.mjs`.

- [ ] **Step 1:** Raise the pinned values to 35 in the tests and add `plugins/sdk/test/episode-go.test.mjs`: `validate accepts go.episode and refuses a bad one`; `the kit lets a job call kino.plugins.callAll`.
- [ ] **Step 2: Run** `cd plugins/sdk && node --test test/*.test.mjs` and `./gradlew :app:testDebugUnitTest --tests '*ApiVersion6Test' --tests '*PluginContractParityTest'` → FAIL.
- [ ] **Step 3: Implement** the constants, contract, docs, validator and shim.
- [ ] **Step 4: Run** both commands plus the other pinned Kotlin classes listed above → PASS; `--tests '*StringsCatalogTest' --tests '*NoHardcodedUserTextTest'` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Plugin contract: apiVersion 35 (Kino 0.9.94): kino.plugins in a job and the episode go"` — then STOP: merging to kino-app `main` is the owner's call.

## Part 2 — std and the plugins (`C:\dev\xuper-plugin`)

### Task 5: std's catalog door answers `episodes`

**Files:**
- Modify: `_standard/src/std/catalog.js`, `_standard/src/std/index.js` (std version line, minor bump), `_standard/test/std.test.mjs`

**Interfaces:**
- Produces: `CATALOG_PROVIDES.catalog.calls.episodes = { in: { ref: "string" }, out: "Episode[]" }`; `types.Episode = { season: "number", number: "number", ref: "string", title: "string?" }`; `search.in` gains `tmdb: "number?"`; `export const CATALOG_EPISODES_MAX = 500`; `export function catalogEpisodes(list): Episode[]`; `export function catalogEpisodesDoor(episodes): (arg) => Promise<Episode[]>`; `catalogQuery(arg)` sets `tmdbId` from `arg.tmdb` when it is a positive integer.

- [ ] **Step 1: Write the failing tests** in `std.test.mjs`: `catalogEpisodes keeps season, number, ref, title and drops bad rows`; `a row without season is season 1`; `at most 500`; `catalogEpisodesDoor answers [] for an empty ref without calling the site`; `catalogQuery carries tmdb into tmdbId`.
- [ ] **Step 2: Run** `cd _standard && node --test test/std.test.mjs` → FAIL.
- [ ] **Step 3: Implement** in `catalog.js`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** (in `_standard`'s repo or tracked location, as xuper-plugin) `"std: the catalog door answers episodes (Da-Video's new-episode notices)"`.

### Task 6: Every series plugin exports the door's `episodes`

**Files:**
- Create: `_standard/add-episodes-door.mjs` (codemod: in a plugin that exports `episodes` and already exports `proto_catalog_search`, add `export const proto_catalog_episodes = catalogEpisodesDoor(episodes);` next to it and its import, and set the manifest's `provides.catalog` to `CATALOG_PROVIDES.catalog`)
- Modify, per plugin with an `episodes` export (detected, not guessed): `src/plugin.js`, `kino-plugin.json`

- [ ] **Step 1:** Run the codemod dry (`node _standard/add-episodes-door.mjs --dry`) → lists the plugins it would touch; plugins without `episodes` (movie-only, live) are skipped and listed.
- [ ] **Step 2:** Run it for real, then `PRE="" sh _standard/sync-std.sh "The catalog door also lists a series' episodes" <the listed repos>` **with publish disabled** (comment out the `publish.sh` line in a local copy, or `PUBLISH=0` if added): each plugin builds, tests, validates green, and is committed locally on a branch `feat/catalog-episodes`.
- [ ] **Step 3:** For two plugins (one plain, Latino; one anime, Latanime) run `node sdk/run.mjs . proto catalog episodes '{"ref":"<a real series ref from its search>"}'` (or the kit's equivalent) → a non-empty Episode list with seasons.
- [ ] **Step 4:** STOP: publishing (push to each `main`) waits for the owner's order.

## Part 3 — Da-Video (`C:\dev\xuper-plugin\kino-plugin-davideo`, branch `feat/new-episode-notices`)

### Task 7: The new-episode logic (pure + job step)

**Files:**
- Create: `src/newEpisodes.js`
- Test: `test/newEpisodes.test.mjs`

**Interfaces:**
- Consumes: `kino.library.watched`, `kino.tmdb`, `kino.plugins.callAll("mine", "search", { q, type: "series", tmdb })`, `kino.plugins.call` on the door's `episodes` (Part 1, 2), `kino.notifications.post`, `kino.storage`.
- Produces:
  - `export const NEW_EP = { MAX_AGE_DAYS: 60, MAX_NOTICES: 5, RETRY_DAYS: 7, REQUESTS: 10 }`
  - `export function candidates(watched, state, nowMs): Array<{ tmdb, title, season?, episode? }>` — series with `ids.tmdb`, played within 60 days, rotated from `state.cursor`.
  - `export function isNewer(aired, seen): boolean` — `{season, episode}` order.
  - `export function absoluteNumber(seasons, season, episode): number` — TMDB episode counts of earlier seasons + episode.
  - `export function matchChapter(chapters, { season, episode, absolute }): Chapter | null` — season+number; else, when the plugin lists one season only, `absolute`; else null.
  - `export function noticeOf({ tmdb, title, season, episode, repo, ref, pluginName }): Notice` — id `ep-<tmdb>-s<season>e<episode>`, title ES "Nuevo capítulo de <title>" / EN "New episode of <title>", text ES "T<s>·E<e> ya está en <pluginName>" / EN "S<s>·E<e> is now on <pluginName>", `go: { episode: { origin: repo, ref, season: <plugin's>, episode: <plugin's> } }`.
  - `export async function runNewEpisodes(ctx, deps = defaultDeps): Promise<{ checked, posted, skipped? }>` — never throws.
- [ ] **Step 1: Write the failing tests** (kit fixtures: `KINO_LIBRARY_FIXTURE`, a fake `kino.tmdb`, fake door answers):
  - `skips titles without a TMDB id`; `skips series not played in 60 days`.
  - `first sight of a series posts nothing` (baseline stored).
  - `baselines when the library has no episode`.
  - `posts when TMDB has a newer episode and a plugin lists it`, asserting the exact notice above.
  - `retries for 7 days when no plugin has it yet, then drops it`.
  - `matches an anime by absolute number on a one-season plugin`; `skips a plugin that matches neither`.
  - `never posts the same id twice`; `at most 5 notices a run`; `stays within 10 requests` (counting tmdb + door calls).
  - `quiet when library is denied`, `quiet when notifications are denied`, `quiet when Kino is older` (`kino.pluginApiVersion < 35` → `{ skipped: "kino_too_old" }`).
- [ ] **Step 2: Run** `node --test test/newEpisodes.test.mjs` → FAIL.
- [ ] **Step 3: Implement** `src/newEpisodes.js`; state in `kino.storage` key `newEpisodes` (`{ cursor, baselines: { <tmdb>: {season, episode} }, pending: { <id>: firstSeenMs }, notified: [ids…] }`, pruned to the series still watched and the last 500 ids).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "New-episode notices: library, TMDB and the catalog door's episodes decide one notice per new chapter"`

### Task 8: Wire the job, manifest and screen; build, sign, validate

**Files:**
- Modify: `src/plugin.js:71` (`job(ctx)`: `ctx.id === "episodes"` → `runNewEpisodes`), `kino-plugin.json` (capabilities + `library`, `notifications`; `consumes.mine.calls` + `"episodes"`; `jobs` + `{ "id": "episodes", "label": { "es": "Avisarme de capítulos nuevos", "en": "Tell me about new episodes" }, "everyMin": 360, "everyOptions": [180, 360, 720] }`; version minor bump), `src/page.js` (a line on Da-Video's page that offers turning the job on, using the existing `jobIsOn` pattern, shown only when `kino.pluginApiVersion >= 35`), `CHANGELOG.md`
- Test: `test/plugin.test.mjs` (or the repo's existing suite)

- [ ] **Step 1: Write the failing tests**: `the episodes job runs runNewEpisodes`; `the manifest declares library, notifications, the episodes job and the door's episodes call`; `the page offers the switch only on Kino 35+`.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement**, then `npm run build`, sign (`node sdk/seal.mjs --sign --repo xuper-plugin/kino-plugin-davideo --key ~/.config/kino/xuper-plugin-author-key.pem`), never rebuild after signing.
- [ ] **Step 4: Run** `npm test` → PASS; `npm run validate` → "✓ Kino would accept this plugin"; `node sdk/run.mjs . job episodes` with fixtures → `{ checked, posted }`.
- [ ] **Step 5: Commit** `git commit -m "<version> — Da-Video tells you when a new episode of a series you watch is on one of your plugins. Signed with the xuper-plugin author key (E04E-EA25-1A34-290E)."` — then STOP: publishing and the device test on Kino 0.9.94 wait for the owner.
