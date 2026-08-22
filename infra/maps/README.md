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

## Paso 1 — Generar los tiles (una vez, en cualquier PC con Java)

[planetiler](https://github.com/onthegomap/planetiler) convierte un extracto de
OSM a un `.pmtiles`. Rápido y gratis.

```bash
# Requiere Java 21+. Descarga planetiler.jar de sus releases.
# Extracto de Chihuahua (o toda México si quieres):
java -Xmx4g -jar planetiler.jar \
  --download --area=chihuahua \
  --output=chihuahua.pmtiles
```
(El área usa los extractos de Geofabrik; para México: `--area=mexico`.)

## Paso 2 — Publicar el archivo (estático, tu infra)

Sube `chihuahua.pmtiles` a donde controles tú:
- Tu propio servidor detrás de nginx (con `Accept-Ranges: bytes` habilitado — es
  clave: PMTiles usa HTTP range requests).
- O un bucket S3/R2 con CORS + range requests.

También publica **glyphs** y **sprites** (se generan/copian una vez; ver la doc
de MapLibre / openmaptiles). Pueden vivir junto al pmtiles.

## Paso 3 — Estilo propio (el look premium)

Un estilo MapLibre es un JSON. Parte de una base oscura profesional y ajústala
(colores de calles, agua, edificios, tipografía) hasta el look que quieras.
Bases recomendadas para partir:
- **dark-matter** (la que usamos de respaldo) — clónala y edítala.
- Editor visual gratuito: **Maputnik** (https://maputnik.github.io) — abres tu
  pmtiles + tocas colores en vivo y exportas el `style.json`.

El `style.json` debe apuntar a TUS urls: el source `{ "type":"vector",
"url":"pmtiles://https://tu-dominio/chihuahua.pmtiles" }`, tus glyphs y sprite.

> Para leer `pmtiles://` en el navegador hay que registrar el protocolo pmtiles
> en MapLibre (librería `pmtiles`). Cuando tengas el archivo listo, se agrega en
> `apps/web/components/NavMap3D.tsx` (2 líneas) — pendiente hasta el paso 2.

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
