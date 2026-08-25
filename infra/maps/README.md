# Mapas self-hosted — nivel Uber, sin terceros

Para tener un mapa **nivel Uber sin depender de terceros** hay que ser dueño de
las 3 piezas del mapa (igual que OSRM para las rutas):

1. **Tiles vectoriales** (las calles/edificios en formato de datos) — generados
   de OpenStreetMap.
2. **Un estilo diseñado a medida** (los colores/el look premium).
3. **Fuentes (glyphs) y sprites** — para los textos e íconos.

Mientras no exista esto, el sistema usa un estilo oscuro de respaldo (gratuito).
En cuanto publiques TU estilo, se activa solo con una variable de entorno.

---

## Arquitectura (sin servidor de tiles: PMTiles)

La forma moderna y barata de auto-hospedar es **PMTiles**: un ÚNICO archivo con
todos los tiles vectoriales, servido como archivo estático (desde tu servidor,
un bucket S3/R2, o Vercel). MapLibre lo lee directo — **no necesitas un tile
server corriendo**.

```
OpenStreetMap (extracto)  ──planetiler──▶  chihuahua.pmtiles  ──(archivo estático)──▶  MapLibre
                                             + estilo propio (JSON) + glyphs + sprites
```

## Scaffolding ejecutable (en esta carpeta)

- `generate.sh` — genera `data/chihuahua.pmtiles` (calles/labels desde OSM).
- `buildings.sh` — genera `data/buildings.pmtiles` con **edificios 3D** de
  Microsoft Global Buildings (mejor cobertura que OSM; asigna alturas variadas
  porque el dato no trae altura para México). Requiere `tippecanoe`.
- `serve-dev.sh` — sirve local con range requests + CORS para probar.
- `preview.html` — abre el mapa (calles + edificios 3D) sin levantar la app.
- `style.dark.json` — estilo oscuro base (editable en Maputnik).
- `.gitignore` — ignora jar, .pmtiles y descargas pesadas.

### Ver el mapa completo (calles + edificios 3D) local
```bash
./generate.sh      # data/chihuahua.pmtiles (calles)
brew install tippecanoe
./buildings.sh     # data/buildings.pmtiles (edificios 3D)
./serve-dev.sh     # y abre http://localhost:8080/preview.html
```

## Paso 1 — Generar los tiles (una vez, en cualquier PC con Java 21+)

```bash
cd infra/maps
./generate.sh                 # Chihuahua (por defecto) → data/chihuahua.pmtiles
# AREA=mexico ./generate.sh   # todo México (más pesado)
```
[planetiler](https://github.com/onthegomap/planetiler) convierte el extracto de
OSM a un solo `.pmtiles`. Usa los extractos de Geofabrik por nombre de área.

## Paso 2 — Publicar el archivo (estático, tu infra)

Sube `chihuahua.pmtiles` a donde controles tú:
- Tu propio servidor detrás de nginx (con `Accept-Ranges: bytes` habilitado — es
  clave: PMTiles usa HTTP range requests).
- O un bucket S3/R2 con CORS + range requests.

También publica **glyphs** y **sprites** (se generan/copian una vez; ver la doc
de MapLibre / openmaptiles). Pueden vivir junto al pmtiles.

## Paso 3 — Estilo propio (el look premium)

Ya hay una base editable: **`style.dark.json`** (esquema OpenMapTiles, que es lo
que genera planetiler). Ábrela en **Maputnik** (https://maputnik.github.io) para
refinar colores/tipografía en vivo y exportar tu versión.

Reemplaza en el JSON `TU-DOMINIO` por donde publiques:
- el `.pmtiles` (source `pmtiles://https://TU-DOMINIO/chihuahua.pmtiles`),
- los **glyphs** (fuentes) `https://TU-DOMINIO/fonts/{fontstack}/{range}.pbf`
  — descárgalos una vez del repo `openmaptiles/fonts` y publícalos igual.

> El protocolo `pmtiles://` YA está cableado en el mapa
> (`apps/web/components/NavMap3D.tsx`): se registra automáticamente cuando
> defines `NEXT_PUBLIC_MAP_STYLE_URL`. No hay que tocar código.

### Probar local antes de publicar
```bash
./serve-dev.sh   # sirve esta carpeta en http://localhost:8080 (range + CORS)
# En apps/web/.env.local:
#   NEXT_PUBLIC_MAP_STYLE_URL=http://localhost:8080/style.dark.json
# (edita style.dark.json: usa http://localhost:8080/... en vez de TU-DOMINIO)
```

## Paso 4 — Conectarlo (1 variable)

En Vercel → proyecto web → Environment Variables:
```
NEXT_PUBLIC_MAP_STYLE_URL = https://tu-dominio/style.json
```
Redeploy. La navegación usa TU mapa. Sin token, sin terceros. Si algún día se
cae, el sistema regresa solo al respaldo.

---

## Realidad / esfuerzo

- Generar tiles: minutos–horas según el área (Chihuahua es rápido).
- Diseñar el estilo premium: es trabajo de **cartografía/diseño** (horas). Aquí
  está el techo real: el look "de Uber" es un estilo hecho por diseñadores; con
  Maputnik puedes acercarte mucho, pero requiere dedicarle tiempo o a alguien.
- Hosting: un archivo estático con range requests (tu servidor o R2 ~centavos).

Depende de tener dónde alojar el `.pmtiles` (mismo bloqueo que OSRM: aún no hay
servidor). Cuando lo tengas, este es el camino a nivel Uber siendo 100% dueño.
