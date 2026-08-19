#!/usr/bin/env bash
# Verifica que OSRM responde: (1) dentro del contenedor y (2) a través del túnel
# de Cloudflare con el Service Token (tal cual lo llamará la API en Vercel).
#
# Uso:
#   ./verify.sh                              # solo prueba local (dentro de Docker)
#   OSRM_URL=https://osrm.tudominio.com \
#   CF_ID=xxxxx.access CF_SECRET=yyyyy \
#   ./verify.sh                              # además prueba el túnel + Access
set -euo pipefail
cd "$(dirname "$0")"

# Chihuahua: un par de coords reales para una ruta corta de prueba.
Q="-106.07,28.63;-106.09,28.66"

echo "==> 1) OSRM local (dentro del contenedor)…"
if docker compose exec -T osrm wget -qO- "http://localhost:5000/route/v1/driving/${Q}?overview=false" | grep -q '"code":"Ok"'; then
  echo "    ✅ OSRM responde en la red interna."
else
  echo "    ❌ OSRM NO responde. Revisa 'docker compose logs osrm' y que ./prepare.sh terminó bien."
  exit 1
fi

if [[ -n "${OSRM_URL:-}" ]]; then
  echo "==> 2) Túnel + Cloudflare Access (${OSRM_URL})…"
  if [[ -z "${CF_ID:-}" || -z "${CF_SECRET:-}" ]]; then
    echo "    ⚠️  Define CF_ID y CF_SECRET (el Service Token) para probar con Access."
    exit 1
  fi
  code=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "CF-Access-Client-Id: ${CF_ID}" \
    -H "CF-Access-Client-Secret: ${CF_SECRET}" \
    "${OSRM_URL%/}/route/v1/driving/${Q}?overview=false")
  if [[ "$code" == "200" ]]; then
    echo "    ✅ La API podrá consultar OSRM por el túnel (200 OK con Service Token)."
    echo "       Pon en Vercel: OSRM_URL=${OSRM_URL}  + OSRM_CF_ACCESS_CLIENT_ID / _SECRET."
  else
    echo "    ❌ Respuesta HTTP ${code}. Revisa la política de Access (Service Auth) y el token."
    exit 1
  fi
else
  echo "==> 2) (Omitido) Define OSRM_URL, CF_ID y CF_SECRET para probar el túnel."
fi
