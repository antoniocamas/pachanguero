# One image serves the app and the API on one port. Everything is configured by environment
# (see .env.example); the data and the backups live on two volumes.
FROM node:26-slim AS build
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

FROM node:26-slim
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
