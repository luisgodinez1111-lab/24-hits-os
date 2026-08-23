#!/usr/bin/env bash
# Genera tus tiles vectoriales propios (.pmtiles) desde OpenStreetMap con
# planetiler. Un solo archivo, sin servidor de tiles. Requiere Java 21+.
#
# Uso:
#   ./generate.sh                 # Chihuahua (por defecto)
#   AREA=mexico ./generate.sh     # todo México (pesa más, tarda más)
#   AREA=north-america/mexico/jalisco ./generate.sh
#
# Salida: ./data/<AREA>.pmtiles
set -euo pipefail
cd "$(dirname "$0")"

AREA="${AREA:-chihuahua}"
PLANETILER_VERSION="${PLANETILER_VERSION:-0.8.3}"
JAR="planetiler.jar"
MEM="${MEM:-4g}"   # sube a 8g/16g para áreas grandes
mkdir -p data

# Requiere Java.
if ! command -v java >/dev/null 2>&1; then
  echo "❌ Falta Java 21+. Instálalo (macOS: 'brew install openjdk@21')."
  exit 1
fi

if [ ! -f "$JAR" ]; then
  echo "==> Descargando planetiler ${PLANETILER_VERSION}…"
  curl -fL "https://github.com/onthegomap/planetiler/releases/download/v${PLANETILER_VERSION}/planetiler.jar" -o "$JAR"
fi

OUT="data/$(basename "$AREA").pmtiles"
echo "==> Generando tiles de '${AREA}' → ${OUT} (RAM ${MEM})…"
# --download baja el extracto de Geofabrik automáticamente por nombre de área.
java "-Xmx${MEM}" -jar "$JAR" --download --area="$AREA" --output="$OUT" --force

echo ""
echo "✅ Listo: ${OUT}"
echo "   Pruébalo local:   ./serve-dev.sh"
echo "   Publícalo (estático, con range requests) y apunta tu style.json a él."
