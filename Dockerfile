FROM node:24-bookworm-slim AS builder

ENV NODE_ENV=development
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ./package.json ./package.json
COPY ./yarn.lock ./yarn.lock
COPY ./vendor ./vendor
RUN corepack enable && yarn install --no-progress

COPY ./src ./src
COPY ./public ./public
COPY ./tsconfig.json ./tsconfig.json
RUN yarn build

FROM node:24-bookworm-slim

LABEL \
  maintainer="Clairton Rodrigo Heinzen <clairton.rodrigo@gmail.com>" \
  org.opencontainers.image.title="Unoapi Cloud" \
  org.opencontainers.image.description="Unoapi Cloud" \
  org.opencontainers.image.authors="Clairton Rodrigo Heinzen <clairton.rodrigo@gmail.com>" \
  org.opencontainers.image.url="https://github.com/clairton/unoapi-cloud" \
  org.opencontainers.image.vendor="https://uno.ltd" \
  org.opencontainers.image.licenses="GPLv3"

ENV NODE_ENV=production
 
RUN groupadd -r u && useradd -r -g u u
WORKDIR /home/u/app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/yarn.lock ./yarn.lock
COPY --from=builder /app/vendor ./vendor
COPY --from=builder /app/node_modules ./node_modules


RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["node", "dist/src/index.js"]
