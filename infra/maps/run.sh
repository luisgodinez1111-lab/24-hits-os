#!/usr/bin/env bash
# Levanta los 2 servidores locales para ver el mapa y los MANTIENE vivos.
# Córrelo en TU terminal y déjalo abierto (Ctrl+C para detener).
#   cd ~/Documents/GitHub/24-hits-os/infra/maps
#   ./run.sh
# Luego abre:  http://localhost:8080/preview.html
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:$PATH"

command -v pmtiles >/dev/null || { echo "❌ Falta pmtiles: brew install pmtiles"; exit 1; }
[ -f data/chihuahua-city.pmtiles ] || { echo "❌ Falta data/chihuahua-city.pmtiles — corre ./generate.sh y ./buildings.sh"; exit 1; }

# Tiles vectoriales (z/x/y) desde el pmtiles combinado.
pmtiles serve data --port 8082 --cors "*" >/dev/null 2>&1 &
PM=$!
# Estático: preview.html, style, etc.
npx --yes http-server . -p 8080 --cors -c-1 >/dev/null 2>&1 &
HS=$!
trap 'kill "$PM" "$HS" 2>/dev/null || true' EXIT INT TERM
sleep 1
echo "✅ Servidores arriba."
echo "   Abre:  http://localhost:8080/preview.html"
echo "   (deja esta terminal abierta; Ctrl+C para detener)"
wait
