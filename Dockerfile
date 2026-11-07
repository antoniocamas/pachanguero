# One image serves the app and the API on one port. Everything is configured by environment
# (see .env.example); the data lives on one volume and the backups in one folder (on erebor,
# the staging folder of the backup shipper).
# The one place that pins the Node base image: exact tag, no digest. Both stages use it.
ARG NODE_IMAGE=node:26.13.0-trixie-slim
# OS packages: each stage upgrades them in a layer keyed by OS_REFRESH, a date that build.sh sets
# (UTC day), so the layer re-runs on a new day and is cached within one. Without the argument
# (a plain `docker build`) the layer is cached until the base image changes.

FROM ${NODE_IMAGE} AS build
ARG OS_REFRESH=unset
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# The workspaces must all be present for `npm ci` to resolve the lockfile. No install scripts:
# the git hook installer has no repository here and better-sqlite3 ships prebuilt binaries.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
COPY e2e/package.json e2e/
RUN npm ci --ignore-scripts
COPY server server
COPY web web
RUN npm run build && npm prune --omit=dev

FROM ${NODE_IMAGE}
ARG OS_REFRESH=unset
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    PACHANGUERO_DB=/data/pachanguero.db \
    PACHANGUERO_BACKUPS=/backups
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/package.json web/
COPY --from=build /app/web/dist web/dist
RUN mkdir -p /data /backups \
 && chown node:node /data /backups \
 && printf '#!/bin/sh\nexec node /app/server/dist/cli/main.js "$@"\n' > /usr/local/bin/pachanguero-admin \
 && chmod +x /usr/local/bin/pachanguero-admin
USER node
VOLUME ["/data", "/backups"]
EXPOSE 8787
CMD ["node", "server/dist/index.js"]
