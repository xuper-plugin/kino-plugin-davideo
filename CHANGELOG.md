# Changelog

## 0.4.11

- MegaPlay's titles appear in Contenido (std 1.9.3)

## 0.4.10

- MegaPlay can be installed from Da-Video, and MegaPlay and HentaiMama answer its search (std 1.9.3)

## 0.4.9

- HentaiMama (+18) can be installed and kept updated from Da-Video (std 1.9.3)

## 0.4.8

- Search: HDFull, Movie+, Xuper and ZappTV come first when you have them on, then the rest in the catalog's order.

## 0.4.7

- After Desinstalar the plugin's sheet closes by itself and says «Se desinstaló …».

## 0.4.6

- The update pass's line («Ya revisamos hace poco…») shows on Mis plugins only, under the tabs, and goes when you switch tab.

## 0.4.5

- The reload button sits in the bar beside the gear: on Contenido it fetches the content again, on Mis plugins it checks for updates. No «Tus plugins» title (the tab says it).
- Contenido's slider runs edge to edge (std 1.9.1 page blocks).

## 0.4.4

- Contenido is the first tab and opens by default when one of your plugins keeps a ready Home.

## 0.4.3

- A Contenido Home kept without a slider (a lagging copy of the shared file) is asked again after 2 minutes.

## 0.4.2

- The shared Home keeps a backdrop and a synopsis only on the slider's candidates (4 per plugin): the title page takes the description from TMDB. About 93 KB on the wire.

## 0.4.1

- Contenido opens from one shared file: this repository's Action merges every plugin's ready Home into home/content.json every 6 hours; the device makes one request and keeps the titles of the plugins you installed.

## 0.4.0

- Contenido: a second tab, shown once one of your plugins with a ready Home is installed: a slider and rows by category (new releases, popular, series, anime, dramas, kids, genres) from the ready copies of your installed plugins, one card per title; each card opens and plays in its own plugin.

## 0.3.5

- A plugin that needs Kino Resolver, while the resolver is missing: its sheet says so and offers Instalar resolver instead of Abrir.

## 0.3.4

- std 1.7.1: the search field hides the bar's back arrow while open.

## 0.3.3

- A plugin that still needs setting up (Kino says so) shows Configurar instead of Abrir, opening its own screen
- Movie+ joins the list; Xuper, Movie+, ZappTV and HDFull come first

## 0.3.2

- The plugin sheet: its name as the title with the close X at the top, Desinstalar and Abrir side by side, no icons

## 0.3.1

- A tap on one of your plugins opens a sheet: Abrir, Actualizar when a new version waits, Configurar when it needs it, and Desinstalar below (no Editar mode)

## 0.3.0

- New look: your plugins as home-screen icons, three per row, then the ones to install (dimmed, a download button each); Nueva on an update; Editar shows the delete buttons

## 0.2.4

- Every card the same size, filling its cell, the buttons at the bottom

## 0.2.3

- No open button: a tap on the card opens the plugin

## 0.2.2

- Two cards per row on a phone; the search field's button is a search icon

## 0.2.1

- Compact cards: a tap opens the plugin, icon-only buttons (uninstall left, open right, download, update); Kino Resolver is one more card
- A search field on top (Buscar película o serie) instead of the bar's icon, and the back arrow instead of the X

## 0.2.0

- Your plugins as cards in a grid: the icon on top, Instalar below, or Abrir and Desinstalar with a green edge when installed; an update badge; a filter (Todos, Instalados, No instalados), installed first
- Xuper and ZappTV join the list

## 0.1.6

- The list refreshes by itself: a plugin installed from here shows under Tus plugins when you come back

## 0.1.5

- Abrir Da-Video from its card and its Ajustes page (screen opens from settings too)

## 0.1.4

- Installing Da-Video also installs Kino Resolver, on the same sheet (bundles, Kino 0.9.93)

## 0.1.3

- Cards span the page; the search says nothing matched only when some plugin answered; a failed search logs why

## 0.1.2

- Card spacing on Kino's scale and a Kino icon on Actualizar (nothing dropped)

## 0.1.1

- The plugin cards show their name, version and buttons (a Card takes children, not child)

## 0.1.0

- First version: one search across your installed xuper-plugin plugins (one row per plugin, each card opens in the plugin that found it), your plugins with their updates and setup, the ones still to install, and a job that keeps them up to date every 4 hours (5 or 6 if you prefer). Needs Kino 0.9.93.
