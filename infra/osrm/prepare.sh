#!/usr/bin/env bash
# Prepara los datos de OSRM para una región (pipeline MLD). Ejecutar UNA vez, y
# de nuevo solo cuando quieras actualizar el mapa. Requiere Docker.
#
# Región por defecto: Chihuahua (México). Cámbiala con REGION_URL:
#   REGION_URL=https://download.geofabrik.de/north-america/mexico-latest.osm.pbf ./prepare.sh
set -euo pipefail

REGION_URL="${REGION_URL:-https://download.geofabrik.de/north-america/mexico/chihuahua-latest.osm.pbf}"
IMG="ghcr.io/project-osrm/osrm-backend:latest"

cd "$(dirname "$0")"
mkdir -p data
cd data

echo "==> Descargando extracto OSM:"
echo "    $REGION_URL"
curl -fL "$REGION_URL" -o region.osm.pbf

echo "==> osrm-extract (perfil car)…"
docker run --rm -t -v "$PWD:/data" "$IMG" osrm-extract -p /opt/car.lua /data/region.osm.pbf

echo "==> osrm-partition…"
docker run --rm -t -v "$PWD:/data" "$IMG" osrm-partition /data/region.osrm

echo "==> osrm-customize…"
docker run --rm -t -v "$PWD:/data" "$IMG" osrm-customize /data/region.osrm

echo ""
echo "✅ Datos listos. Levanta el servidor con:  docker compose up -d"
echo "   Prueba:  curl 'http://localhost:5000/route/v1/driving/-106.07,28.63;-106.09,28.66?overview=false'"
