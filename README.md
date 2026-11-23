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
