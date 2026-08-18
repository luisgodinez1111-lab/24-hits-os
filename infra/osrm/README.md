# OSRM self-host — rutas por carretera para la Ruta de hoy

Motor de rutas propio (gratis, sin dependencia de Google/Mapbox). El API lo usa
para calcular distancias y tiempos reales de manejo (`/table`) y ordenar las
entregas de forma óptima. Si `OSRM_URL` no está definido, el sistema cae a línea
recta (haversine) sin costo.

## Requisitos
- Un servidor propio con **Docker** y ~2–4 GB de RAM libres (Chihuahua es ligero;
  todo México pide más memoria).
- Puerto **5000** accesible **por HTTPS desde internet** (la API en Vercel lo llama).

## Puesta en marcha
```bash
cd infra/osrm
./prepare.sh                 # descarga el mapa y prepara los datos (una vez, ~minutos)
docker compose up -d         # levanta el servidor OSRM
curl "http://localhost:5000/route/v1/driving/-106.07,28.63;-106.09,28.66?overview=false"
```

## Conectarlo al sistema
En el proyecto de la **API** en Vercel → Environment Variables:
```
OSRM_URL = https://<tu-dominio-o-ip>:5000
```
Redeploy. Listo: la Ruta mostrará "ruta por calles · ~X min" con orden óptimo real.

## Exponerlo seguro (recomendado)
OSRM no trae autenticación. No lo dejes abierto a internet sin protección:
- Ponlo detrás de un **reverse proxy con HTTPS** (Caddy/nginx) en tu servidor.
- Restringe el acceso: por firewall a orígenes conocidos, o exige un header/token
  en el proxy. (Nota: los rangos de IP de Vercel son dinámicos; lo más simple es
  un **Cloudflare Tunnel** que publique el 5000 por HTTPS con reglas de acceso.)

### Ejemplo mínimo con Caddy (HTTPS automático)
```
osrm.tudominio.com {
    reverse_proxy localhost:5000
}
```
Luego `OSRM_URL=https://osrm.tudominio.com`.

## Actualizar el mapa
Vuelve a correr `./prepare.sh` (descarga el extracto nuevo y reprocesa) y
`docker compose up -d` para recargar.

## Escalar
- Región más grande → más RAM. Para todo México usa un extracto mayor y un
  servidor con 8–16 GB.
- Alto volumen de peticiones → varias réplicas de OSRM detrás del proxy.
