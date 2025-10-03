FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ffmpeg wget \
    && rm -rf /var/lib/apt/lists/* \
    && wget -O /usr/local/bin/wait-for https://raw.githubusercontent.com/eficode/wait-for/v2.2.3/wait-for \
    && chmod +x /usr/local/bin/wait-for

WORKDIR /app

COPY ./src ./src
COPY ./package.json ./package.json
COPY ./tsconfig.json ./tsconfig.json
COPY ./nodemon.json ./nodemon.json
COPY ./yarn.lock ./yarn.lock

RUN corepack enable && yarn install --no-progress
