#!/usr/bin/env bash
# Genera tus tiles vectoriales propios (.pmtiles) desde OpenStreetMap con
# planetiler. Un solo archivo, sin servidor de tiles. Requiere Java 21+.
#
# Por defecto usa el extracto de CHIHUAHUA (estado) de OSM-France (~45 MB).
# Uso:
#   ./generate.sh
#   OSM_URL=https://download.openstreetmap.fr/extracts/north-america/mexico-latest.osm.pbf ./generate.sh
#
# Salida: ./data/chihuahua.pmtiles
set -euo pipefail
cd "$(dirname "$0")"

OSM_URL="${OSM_URL:-https://download.openstreetmap.fr/extracts/north-america/mexico/chihuahua-latest.osm.pbf}"
PLANETILER_VERSION="${PLANETILER_VERSION:-0.8.3}"
JAR="planetiler.jar"
MEM="${MEM:-4g}"
mkdir -p data
PBF="data/region.osm.pbf"
OUT="data/chihuahua.pmtiles"

if ! command -v java >/dev/null 2>&1; then
  echo "❌ Falta Java 21+. macOS: 'brew install openjdk@21' y añade su bin al PATH."
  exit 1
fi

if [ ! -f "$JAR" ]; then
  echo "==> Descargando planetiler ${PLANETILER_VERSION}…"
  curl -fL "https://github.com/onthegomap/planetiler/releases/download/v${PLANETILER_VERSION}/planetiler.jar" -o "$JAR"
fi

if [ ! -f "$PBF" ]; then
  echo "==> Descargando extracto OSM (Chihuahua)…"
  echo "    $OSM_URL"
  curl -fL "$OSM_URL" -o "$PBF"
fi

echo "==> Generando tiles → ${OUT} (RAM ${MEM})…"
# --download baja SOLO las fuentes auxiliares (agua, natural earth); el OSM es el
# archivo local que ya bajamos (--osm-path). Primera vez pesa por esas fuentes.
java "-Xmx${MEM}" -jar "$JAR" --download --osm-path="$PBF" --output="$OUT" --force

echo ""
echo "✅ Listo: ${OUT}"
echo "   Pruébalo local:   ./serve-dev.sh   (y abre http://localhost:8080/preview.html)"
