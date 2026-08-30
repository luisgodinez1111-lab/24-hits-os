#!/usr/bin/env bash
# Prepara el paquete de PRODUCCIÓN del mapa (carpeta dist/) para subir a tu
# almacenamiento de objetos (Cloudflare R2 / S3 / B2 — con range requests + CORS).
# NO necesita servidor: PMTiles se sirve como archivo estático.
#
# Uso:
#   ./publish.sh https://mapas.tudominio.com
#   ./publish.sh https://<bucket>.r2.dev
#
# Genera dist/ con: chihuahua-city.pmtiles + fonts/ + style.json (con tu URL).
set -euo pipefail
cd "$(dirname "$0")"

BASE="${1:-}"
if [ -z "$BASE" ]; then echo "Uso: ./publish.sh https://TU-URL-PUBLICA"; exit 1; fi
BASE="${BASE%/}"  # sin slash final
[ -f data/chihuahua-city.pmtiles ] || { echo "❌ Falta data/chihuahua-city.pmtiles — corre ./generate.sh y ./buildings.sh"; exit 1; }

mkdir -p dist/fonts
echo "==> Copiando tiles…"
cp -f data/chihuahua-city.pmtiles dist/chihuahua-city.pmtiles

# Fuentes (glyphs) para auto-hospedar (sin terceros). Se bajan una vez.
if [ ! -f "dist/fonts/Noto Sans Regular/0-255.pbf" ]; then
  echo "==> Descargando fuentes…"
  for FONT in "Noto Sans Regular" "Noto Sans Bold"; do
    FE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$FONT")
    mkdir -p "dist/fonts/$FONT"
    for R in 0-255 256-511 512-767 768-1023; do
      curl -sf --max-time 20 "https://tiles.openfreemap.org/fonts/${FE}/${R}.pbf" -o "dist/fonts/$FONT/${R}.pbf" || true
    done
  done
fi

echo "==> Generando dist/style.json con base ${BASE}…"
python3 - "$BASE" <<'PY'
import json, sys
base=sys.argv[1]
d=json.load(open("style.dark.json"))
d["glyphs"]=base+"/fonts/{fontstack}/{range}.pbf"
d["sources"]={"openmaptiles":{"type":"vector","url":"pmtiles://"+base+"/chihuahua-city.pmtiles"}}
json.dump(d, open("dist/style.json","w"), indent=2)
print("   style.json → source:", d["sources"]["openmaptiles"]["url"])
PY

echo ""
echo "✅ Paquete listo en dist/  (súbelo TAL CUAL a tu bucket):"
echo "   dist/chihuahua-city.pmtiles"
echo "   dist/style.json"
echo "   dist/fonts/…"
echo ""
echo "Luego:"
echo "  1) Habilita CORS en el bucket (GET + Range desde tu dominio o *)."
echo "  2) En Vercel (proyecto web) → Environment Variables:"
echo "       NEXT_PUBLIC_MAP_STYLE_URL = ${BASE}/style.json"
echo "  3) Redeploy. La navegación usará TU mapa."
