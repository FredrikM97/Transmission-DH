# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# Prune dev dependencies and non-production modules
RUN npm prune --omit=dev

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    TRANSMISSION_URL=http://localhost:9091/transmission/rpc \
    ALLOWED_LABELS="" \
    EXCLUDED_TRACKERS="" \
    MAX_RATIO=2.0 \
    DEAD_RETENTION_HOURS=12 \
    MAX_AGE_HOURS=120 \
    LOG_LEVEL=info \
    DRY_RUN=false \
    SCHEDULE=""

WORKDIR /app

COPY --from=build /app/dist/bundle.js ./
COPY --from=build /app/node_modules ./node_modules

USER node

ENTRYPOINT ["node", "bundle.js"]
