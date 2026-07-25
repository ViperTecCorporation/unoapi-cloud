FROM node:24-bookworm-slim AS builder

ENV NODE_ENV=development
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ./package.json ./package.json
COPY ./yarn.lock ./yarn.lock
COPY ./vendor ./vendor
COPY ./scripts ./scripts
RUN corepack enable \
    && corepack use yarn@1.22.22 \
    && yarn --version \
    && yarn config set network-timeout 600000 \
    && yarn config set npmRegistryServer https://registry.npmjs.org \
    && i=0; \
       until [ "$i" -ge 3 ]; do \
         YARN_ENABLE_IMMUTABLE_INSTALLS=0 yarn install --no-progress --network-timeout 600000 && break; \
         i=$((i+1)); echo "yarn install failed ($i/3), retrying in 5s..."; \
         sleep 5; \
       done

COPY ./src ./src
COPY ./frontend ./frontend
COPY ./public ./public
COPY ./docs ./docs
COPY ./logos ./logos
COPY ./tsconfig.json ./tsconfig.json
COPY ./tsconfig.frontend.json ./tsconfig.frontend.json
COPY ./tsconfig.runtime.json ./tsconfig.runtime.json
RUN yarn build && yarn build:docs

# Preserves the complete legacy build for a deliberate future reactivation.
# The standard image below never copies this stage.
FROM builder AS legacy-builder
RUN yarn build:all

FROM node:24-bookworm-slim AS production-dependencies

ENV NODE_ENV=production
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY ./package.json ./package.json
COPY ./yarn.lock ./yarn.lock
COPY ./vendor ./vendor
COPY ./scripts ./scripts
RUN corepack enable \
    && corepack use yarn@1.22.22 \
    && yarn config set network-timeout 600000 \
    && yarn config set npmRegistryServer https://registry.npmjs.org \
    && YARN_ENABLE_IMMUTABLE_INSTALLS=0 yarn install --production --frozen-lockfile --no-progress --network-timeout 600000

FROM node:24-bookworm-slim AS runtime-base

LABEL \
  maintainer="ViperTec Corporation <suporte@vipertec.com.br>" \
  org.opencontainers.image.title="ViperConnect" \
  org.opencontainers.image.description="ViperConnect by ViperTec Corporation, based on the original Unoapi Cloud project" \
  org.opencontainers.image.authors="ViperTec Corporation <suporte@vipertec.com.br>; Rodrigo Caitano <caitano28@gmail.com>; original Unoapi Cloud project by Clairton Rodrigo" \
  org.opencontainers.image.url="https://github.com/ViperTecCorporation/ViperConnect" \
  org.opencontainers.image.vendor="https://uno.ltd" \
  org.opencontainers.image.licenses="GPLv3"

ENV NODE_ENV=production
 
RUN groupadd -r u && useradd -r -g u u
WORKDIR /home/u/app

COPY --from=builder /app/public ./public
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/logos ./logos
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/yarn.lock ./yarn.lock
COPY --from=builder /app/vendor ./vendor

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg wget \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p data/medias data/sessions data/stores data/logs \
    && chown -R u:u /home/u/app

# Optional target kept solely for an intentional Baileys reactivation.
# It is not the default/final Docker target.
FROM runtime-base AS legacy-runtime
COPY --from=legacy-builder /app/dist ./dist
COPY --from=legacy-builder /app/node_modules ./node_modules
RUN chown -R u:u /home/u/app
USER u
ENTRYPOINT ["node", "dist/src/cloud.js"]

# Default production target: Zapo-only compiled graph and production packages.
FROM runtime-base AS runtime
COPY --from=builder /app/dist ./dist
COPY --from=production-dependencies /app/node_modules ./node_modules
RUN chown -R u:u /home/u/app
USER u
ENTRYPOINT ["node", "dist/src/cloud.js"]
