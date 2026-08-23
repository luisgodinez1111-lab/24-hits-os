#!/usr/bin/env bash
# Sirve LOCALMENTE los archivos de mapa (pmtiles + estilo + glyphs/sprites) con
# soporte de HTTP range requests (obligatorio para PMTiles) y CORS abierto, para
# probar antes de publicar. NO es para producción.
#
# Uso:  ./serve-dev.sh           (sirve esta carpeta en http://localhost:8080)
# Requiere: npx (Node). Usa el paquete "http-server" que soporta range + CORS.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8080}"
echo "==> Sirviendo $(pwd) en http://localhost:${PORT}  (range requests + CORS)"
echo "    pmtiles de prueba: http://localhost:${PORT}/data/chihuahua.pmtiles"
echo "    estilo de prueba:  http://localhost:${PORT}/style.dark.json"
echo ""
echo "    Para verlo en la app, en apps/web/.env.local:"
echo "      NEXT_PUBLIC_MAP_STYLE_URL=http://localhost:${PORT}/style.dark.json"
echo ""
# -c-1 sin caché, --cors abre CORS, soporta range por defecto.
exec npx --yes http-server . -p "$PORT" --cors -c-1
