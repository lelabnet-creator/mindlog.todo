# Build stage: install core+server deps and compile TypeScript.
FROM node:24-bookworm AS build
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/server/package.json ./packages/server/package.json
COPY packages/web/package.json ./packages/web/package.json

# Install only the core + server workspaces (skip the web app's React/Vite deps).
RUN npm install -w @mindlog/core -w @mindlog/server --include-workspace-root

COPY packages/core ./packages/core
COPY packages/server ./packages/server
RUN npm run build:server

# Runtime stage: slim image with compiled output and node_modules.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/server/package.json ./packages/server/package.json
COPY --from=build /app/packages/server/dist ./packages/server/dist

EXPOSE 8080

# The image carries its own liveness probe so it is self-describing wherever it
# runs — a compose file that forgets to define one still gets a meaningful
# health status. The prod compose declares an equivalent check with a tighter
# interval for first-boot; a compose-level healthcheck overrides this one.
# PORT is honoured so the probe follows the app if the port is remapped.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "packages/server/dist/index.js"]
