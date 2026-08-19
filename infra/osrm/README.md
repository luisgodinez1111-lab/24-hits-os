# OSRM self-host + Cloudflare Tunnel — rutas por carretera para la Ruta de hoy

Motor de rutas propio (gratis, sin depender de Google/Mapbox). La API lo usa para
calcular distancias y tiempos reales de manejo (`/table`) y ordenar las entregas
de forma óptima, y para dibujar el trazo por calles (`/route`). Si `OSRM_URL` no
está definido, el sistema cae a línea recta (haversine) sin costo — todo funciona
igual, solo con menos precisión.

Exposición elegida: **Cloudflare Tunnel + Access (Service Token)**. OSRM nunca se
abre a internet; cloudflared abre una conexión **saliente** hacia Cloudflare y
Access exige un token de servicio, así que **solo la API con las credenciales
correctas** puede consultarlo. No abres puertos ni necesitas IP pública/fija.

```
Vercel (API) ──HTTPS──▶ Cloudflare (Access) ──túnel saliente──▶ cloudflared ──▶ osrm:5000
```

## Requisitos
- Un servidor propio con **Docker** y ~2–4 GB de RAM libres (Chihuahua es ligero;
  todo México pide más).
- Una cuenta de **Cloudflare** con un dominio gestionado ahí (el plan gratis basta)
  y **Zero Trust** habilitado (también gratis para este uso).

---

## Paso 1 — Preparar los datos del mapa (una vez)
```bash
cd infra/osrm
./prepare.sh                 # descarga Chihuahua y preprocesa (MLD, ~minutos)
```
Para otra región: `REGION_URL=... ./prepare.sh` (ver comentarios del script).

## Paso 2 — Crear el túnel en Cloudflare
1. Panel **Cloudflare → Zero Trust → Networks → Tunnels → Create a tunnel**
   (tipo *Cloudflared*). Ponle un nombre, p. ej. `osrm-24hits`.
2. En **Install and run a connector** copia el **token** del comando
   (`cloudflared ... run --token <TOKEN>`). No corras ese comando; solo el token.
3. Crea el archivo de entorno con ese token:
   ```bash
   cp .env.example .env      # y pega TUNNEL_TOKEN=<TOKEN>
   ```
4. En **Public Hostnames** del túnel añade:
   - **Subdomain**: `osrm`  ·  **Domain**: `tudominio.com`
   - **Service**: `HTTP` → `osrm:5000`  (así se llama el contenedor en la red del compose)

## Paso 3 — Levantar todo
```bash
docker compose up -d
./verify.sh                  # comprueba que OSRM responde dentro del contenedor
```

## Paso 4 — Proteger con Access + Service Token
1. **Zero Trust → Access → Applications → Add an application → Self-hosted**.
   - **Application domain**: `osrm.tudominio.com`
2. **Zero Trust → Access → Service Auth → Service Tokens → Create**. Guarda el
   **Client ID** y **Client Secret** (el secret solo se muestra una vez).
3. En la aplicación de Access crea una **policy**:
   - **Action**: `Service Auth`
   - **Include** → *Service Token* → selecciona el token recién creado.
   (Esto hace que solo peticiones con ese token pasen; todo lo demás se rechaza.)

## Paso 5 — Conectarlo a la API en Vercel
Proyecto de la **API** → *Settings → Environment Variables* (Production):
```
OSRM_URL                       = https://osrm.tudominio.com
OSRM_CF_ACCESS_CLIENT_ID       = <Client ID del Service Token>
OSRM_CF_ACCESS_CLIENT_SECRET   = <Client Secret del Service Token>
```
Redeploy. La API enviará los headers `CF-Access-Client-Id/Secret` en cada llamada.

Verifica el túnel + Access de punta a punta antes del redeploy:
```bash
OSRM_URL=https://osrm.tudominio.com \
CF_ID=<Client ID> CF_SECRET=<Client Secret> \
./verify.sh
```
Si responde `200 OK`, listo: **Ruta de hoy** pasará de “línea recta” a
“ruta por calles · ~X min” con orden óptimo real. El propio subtítulo de la
página te lo confirma.

---

## Operación
- **Actualizar el mapa**: `./prepare.sh` de nuevo y `docker compose up -d`.
- **Logs**: `docker compose logs -f osrm` · `docker compose logs -f cloudflared`.
- **Rotar el token**: crea uno nuevo en Service Auth, actualiza las 2 vars en
  Vercel, borra el viejo.

## Escalar
- Región más grande → más RAM (todo México: 8–16 GB).
- Mucho tráfico → varias réplicas de `osrm` detrás del mismo túnel.

## Sin Cloudflare (solo dev/local)
Si corres OSRM en tu máquina sin túnel, deja las dos vars `OSRM_CF_*` sin definir
y usa `OSRM_URL=http://localhost:5000`; la API no enviará headers. **No** dejes
OSRM abierto a internet sin Access.
