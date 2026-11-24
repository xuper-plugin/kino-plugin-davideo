# Da-Video (Kino plugin)

Todos tus plugins de video de **xuper-plugin** en un solo lugar, para [Kino](https://github.com/kinotvapp/kino-light) 0.9.93 o más nuevo.

- **Un buscador para todos:** busca en cada plugin que tengas instalado y muestra una fila por plugin a medida que contesta.
  Cada tarjeta se abre y se reproduce en el plugin que la encontró, con su propio resolve.
- **Tus plugins:** versión, si hay una nueva, si necesita configurarse (HDFull y su catálogo), y botones para actualizar,
  configurar o abrir cada uno. Los que faltan, con su botón de Instalar.
- **El corazón:** Kino Resolver, que abre los servidores de casi todos tus plugins, siempre al día.
- **Al día solos:** un trabajo en segundo plano revisa tus plugins de xuper-plugin cada 4 horas (puedes elegir 5 o 6 en
  Ajustes ▸ Plugins ▸ Da-Video) y los actualiza sin pedirte permiso cada vez. Lo apruebas una sola vez al instalar Da-Video
  (la línea en rojo) y solo vale para plugins firmados con la misma llave de autor que Da-Video.

Usa la federación de plugins de Kino (apiVersion 31): una entrada `consumes` por autor (`kino.plugins.callAll`), la capacidad
`manage` (`kino.manage.updates / updateAll`) y el `origin` de cada tarjeta.

## Desarrollo

El código está en `src/` (`page.js`, `catalog.js` y la pantalla estándar en `src/std`) y se empaqueta en `plugin.js`:

```
npm install
npm run build
npm test
npm run validate
```

## El catálogo: `catalog.json`

La lista de plugins que muestra Da-Video (para instalar, en «Mis plugins» y el orden de la búsqueda) sale de
[`catalog.json`](catalog.json), en la raíz de la rama `main` de este repositorio. Da-Video lo descarga de
raw.githubusercontent.com cada vez que se abre (como mucho una vez cada 10 minutos) y guarda la última copia buena. Si no
puede descargarlo o el archivo no es válido, sigue con la última copia buena y, si nunca tuvo una, con la lista que trae
dentro (`src/catalog.js`). Nunca se queda sin catálogo.

Para cambiar el catálogo basta con editar `catalog.json` en `main` y hacer commit: no hace falta una versión nueva del plugin.
Los aparatos lo ven la próxima vez que abren Da-Video (raw.githubusercontent.com puede tardar unos minutos en servir el
cambio).

```json
{
  "v": 1,
  "searchFirst": ["xuper-plugin/kino-plugin-hdfull", "xuper-plugin/kino-plugin-ultrahd"],
  "plugins": [
    { "repo": "xuper-plugin/kino-plugin-hdfull", "name": "HDFull", "kind": "movies", "needsResolver": true },
    { "repo": "xuper-plugin/kino-plugin-ultrahd", "name": "Ultra Hd", "kind": "movies" },
    { "repo": "xuper-plugin/kino-plugin-latino", "name": "Latino", "kind": "movies", "needsResolver": true, "snapshot": true, "hidden": true }
  ]
}
```

- **Orden:** el de la lista `plugins` es el orden en pantalla. `searchFirst` (opcional, hasta 10) son las primeras filas de
  la búsqueda; después van las demás en el orden de `plugins`. Si falta `searchFirst`, se usa el que trae el plugin.
- **Ocultar o quitar:** `"hidden": true` deja la entrada en el archivo pero no la muestra; borrar la entrada la quita del todo.
- **Cambiar:** `name` (hasta 40 caracteres), `kind` (`movies`, `series`, `anime`, `live`, `docs`, `kids` o `adult`),
  `needsResolver` (el plugin no reproduce sin Kino Resolver: Da-Video ofrece instalar el resolver primero) y `snapshot` (el
  repositorio guarda un Inicio listo en `home/index.json`: entra en la pestaña Contenido). Los indicadores van como `true` o
  `false`.
- **Agregar:** una entrada nueva con `repo`, `name` y `kind`. **Solo repositorios de `xuper-plugin/`.**
- Kino Resolver (el corazón) no va en la lista: siempre está primero.

Da-Video revisa el archivo con rigor y, ante **cualquier** error, lo descarta entero (se queda con la copia anterior): JSON
mal formado, `v` distinto de 1, un repositorio de otro dueño o repetido, un `kind` desconocido, un nombre vacío, un indicador
que no sea `true`/`false`, más de 100 entradas, más de 64 KB, o que no quede ningún plugin visible. Los campos que no conoce se
ignoran. Antes de hacer commit puedes comprobarlo con:

```
node -e "import('./src/catalog.js').then(c => console.log(c.parseCatalog(require('fs').readFileSync('catalog.json', 'utf8')) ? 'válido' : 'NO válido'))"
```

El Contenido compartido (`scripts/content-snapshot.mjs`) también lee este `catalog.json`. La lista de `src/catalog.js` es la
que viene dentro del plugin; `catalog.json` empezó igual a ella (lo comprueba `test/catalog-json.test.mjs`): si cambias el
archivo en `main`, ese test avisará en la próxima versión, y entonces conviene copiar el cambio también a `src/catalog.js`.
