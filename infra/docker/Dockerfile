# syntax=docker/dockerfile:1
#
# Las imágenes de L2 Control (T-8a, ADR-028). Una receta, tres imágenes:
#
#   docker build -f infra/docker/Dockerfile --target web     -t l2control-web .
#   docker build -f infra/docker/Dockerfile --target worker  -t l2control-worker .
#   docker build -f infra/docker/Dockerfile --target migrar  -t l2control-migrar .
#
#   web     Next en modo standalone: solo lo que el servidor usa (unos 40 MB de código).
#   worker  el canal en vivo, el outbox y los trabajos programados, con Node sin compilar como en
#           desarrollo (--experimental-strip-types) y solo sus dependencias de producción.
#   migrar  la CLI de Prisma con el esquema y las migraciones: corre una vez por despliegue, como
#           l2_migrator, y se va. La web y el worker no pueden migrar (se conectan como l2_app).
#
# Ninguna lleva secretos: llegan del entorno del servidor. Todas corren como el usuario `node`.
# La versión es la del package.json raíz: la publica la etiqueta vX.Y.Z que la iguala.

ARG NODE=node:24.11.0-bookworm-slim

# ── Base: Node y pnpm, fijados ─────────────────────────────────────────────────
FROM ${NODE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
# Prisma elige su motor de migraciones según el OpenSSL que encuentra AL INSTALAR: tiene que estar ya.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN npm install --global --no-fund --no-audit pnpm@12.3.4
WORKDIR /repo

# ── Construcción: todo el workspace, el cliente de Prisma y la web ─────────────
FROM base AS construccion
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --offline --frozen-lockfile
RUN pnpm --filter @l2/database generate
RUN pnpm --filter @l2/web build
# Si el agente no se empaquetó (se empaqueta en Windows, en la publicación), la carpeta existe vacía y
# Ajustes → Impresoras dice que no está en este servidor.
RUN mkdir -p apps/printer-agent/dist

# ── web ────────────────────────────────────────────────────────────────────────
FROM ${NODE} AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 \
    L2_AGENTE_EXE=/app/agente/l2-impresion.exe
WORKDIR /app
COPY --from=construccion --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=construccion --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=construccion --chown=node:node /repo/apps/web/public ./apps/web/public
COPY --from=construccion --chown=node:node /repo/apps/printer-agent/dist ./agente
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/salud').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]

# ── Recortes: cada imagen de Node lleva solo su parte del workspace ───────────
# `turbo prune` deja los package.json, el lockfile y el código de lo que una app usa, sin lo demás
# (`pnpm install --filter` enlaza bien, pero llena el almacén con todo el lockfile: Next incluido).
FROM construccion AS recortes
RUN pnpm exec turbo prune @l2/worker --docker --out-dir /recortes/worker  && pnpm exec turbo prune @l2/database --docker --out-dir /recortes/database

# ── worker: el workspace con solo sus dependencias de producción ───────────────
FROM base AS dependencias-worker
COPY --from=recortes /recortes/worker/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod
COPY --from=recortes /recortes/worker/full/ ./
COPY --from=construccion /repo/packages/database/src/generated ./packages/database/src/generated

FROM ${NODE} AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencias-worker /repo ./
WORKDIR /app/apps/worker
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3   CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.L2_TIEMPO_REAL_PUERTO||3001)+'/salud').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "--experimental-strip-types", "src/main.ts"]

# ── migrar: la CLI de Prisma, el esquema y las migraciones ─────────────────────
FROM base AS migrar
COPY --from=recortes /recortes/database/json/ ./
# Sin la caché de efectos de pnpm: guardaría el motor que Prisma descargó en otra construcción, quizá
# para otro OpenSSL, y en marcha querría bajar el bueno sin permiso para escribir.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store     pnpm install --frozen-lockfile --filter @l2/database --config.side-effects-cache=false
COPY --from=recortes /recortes/database/full/ ./
WORKDIR /repo/packages/database
USER node
# Necesita L2_DB_MIGRATOR_URL. Solo expande (ADR-028): la versión anterior sigue funcionando con la base.
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
