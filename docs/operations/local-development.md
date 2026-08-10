# Desarrollo local

## Requisitos
- Node.js 20+ (`nvm use` lee `.nvmrc`)
- pnpm 9+ (`corepack enable`)
- Docker + Docker Compose

## Primer arranque
```bash
pnpm install
pnpm infra:up            # PostgreSQL + Redis + MinIO (crea bucket privado)
cp .env.example .env
pnpm db:migrate          # aplica migraciones
pnpm db:seed             # organización/sucursal/almacén/owner de desarrollo
pnpm dev                 # api + web + worker
```

## Infraestructura (Docker Compose)
`infrastructure/docker/docker-compose.yml` levanta:

| Servicio   | Puerto(s)        | Notas                                  |
|------------|------------------|----------------------------------------|
| postgres   | 5432             | usuario `hits` / db `hits_os`          |
| redis      | 6379             | AOF activado                           |
| minio      | 9000 (API), 9001 (consola) | root `minioadmin`            |
| minio-init | —                | crea bucket privado `hits-private`     |

```bash
pnpm infra:up      # levantar
pnpm infra:down    # detener
docker compose -f infrastructure/docker/docker-compose.yml logs -f postgres
```

Los datos persisten en volúmenes Docker; para empezar de cero:
`docker compose -f infrastructure/docker/docker-compose.yml down -v`.

## Base de datos
```bash
pnpm db:migrate    # crear/aplicar migración (dev)
pnpm db:studio     # explorar datos (Prisma Studio)
pnpm db:seed       # datos de desarrollo idempotentes
pnpm --filter @24hits/database db:reset   # reset total (¡borra datos!)
```

## Verificación de calidad
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Problemas comunes
- **`P1001` no conecta a Postgres**: ¿corrió `pnpm infra:up`? ¿el puerto 5432 libre?
- **MinIO sin bucket**: revisa el contenedor `hits-minio-init` en los logs.
- **Prisma Client desactualizado**: `pnpm db:generate` tras cambiar el schema.
