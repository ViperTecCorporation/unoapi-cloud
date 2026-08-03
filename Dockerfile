# TypeScript and frontend artifacts are architecture-independent. Build them on
# the runner architecture so arm64 images do not repeat this stage under QEMU.
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS builder

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

# The telephony source is checked out into _build/voip-service by CI. It is
# compiled into the same artifact so every process role uses one image/tag.
FROM node:24-bookworm-slim AS voip-builder
ENV NODE_ENV=development
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates openssh-client python3 make g++ \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ./_build/voip-service/package.json ./package.json
COPY ./_build/voip-service/package-lock.json ./package-lock.json
RUN npm ci
COPY ./_build/voip-service/src ./src
COPY ./_build/voip-service/assets ./assets
COPY ./_build/voip-service/public ./public
COPY ./_build/voip-service/scripts ./scripts
COPY ./_build/voip-service/tsconfig.json ./tsconfig.json
COPY ./_build/voip-service/.env.example ./.env.example
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS voip-updater
ARG TARGETARCH
WORKDIR /src
COPY ./_build/voip-service/tools/ViperConnect.Voip.Updater ./tools/ViperConnect.Voip.Updater
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64|"") rid="linux-x64" ;; \
      arm64) rid="linux-arm64" ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    dotnet publish ./tools/ViperConnect.Voip.Updater/ViperConnect.Voip.Updater.csproj \
      -c Release -r "${rid}" --self-contained true -p:PublishSingleFile=true \
      -p:PublishTrimmed=false -o /out

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
COPY --from=voip-builder /app/dist ./voip/dist
COPY --from=voip-builder /app/node_modules ./voip/node_modules
COPY --from=voip-builder /app/package.json ./voip/package.json
COPY --from=voip-builder /app/package-lock.json ./voip/package-lock.json
COPY --from=voip-updater /out ./voip/updater
COPY ./scripts/container-entrypoint.sh ./container-entrypoint.sh

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg wget \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p data/medias data/sessions data/stores data/logs voip/data \
    && chmod 0755 container-entrypoint.sh voip/updater/viperconnect-voip-updater \
    && chown -R u:u /home/u/app

EXPOSE 9876 3097

# Optional target kept solely for an intentional Baileys reactivation.
# It is not the default/final Docker target.
FROM runtime-base AS legacy-runtime
COPY --from=legacy-builder /app/dist ./dist
COPY --from=legacy-builder /app/node_modules ./node_modules
RUN chown -R u:u /home/u/app
USER u
ENTRYPOINT ["./container-entrypoint.sh"]

# Default production target: Zapo-only compiled graph and production packages.
FROM runtime-base AS runtime
COPY --from=builder /app/dist ./dist
COPY --from=production-dependencies /app/node_modules ./node_modules
RUN chown -R u:u /home/u/app
USER u
ENTRYPOINT ["./container-entrypoint.sh"]
