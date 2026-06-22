ARG NODE_VERSION=20.14.0
ARG GOSU_VERSION=1.11

###############################
## Base
###############################
FROM node:${NODE_VERSION}-bookworm-slim AS base
USER root
RUN apt-get update && apt-get install --no-install-recommends -y \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Replace the stock `node` user with `app` (uid/gid remapped at runtime in dev)
RUN userdel -r node 2>/dev/null || true && useradd -ms /bin/bash app
RUN mkdir -p /srv/heimdall/current && chown app:app /srv/heimdall/current
WORKDIR /srv/heimdall/current
ENV PORT=1337
EXPOSE 1337
HEALTHCHECK --interval=5s --timeout=20s --retries=3 \
    CMD curl --fail "http://localhost:${PORT}/docker/_ping" || exit 1

###############################
## Build (compiles client bundle + server)
###############################
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

###############################
## Release (single container: serves built front + proxy + exec bridge)
###############################
FROM base AS release
ENV APP_MODE=release
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /srv/heimdall/current/dist ./dist
COPY --from=build /srv/heimdall/current/dist-server ./dist-server
# Runs as root so it can read the bind-mounted /var/run/docker.sock.
CMD ["node", "dist-server/index.js"]

###############################
## Dev (source bind-mounted, HMR, uid/gid remap)
###############################
FROM base AS dev
ARG GOSU_VERSION
ENV APP_MODE=dev
RUN curl -Lo /usr/local/bin/gosu "https://github.com/tianon/gosu/releases/download/${GOSU_VERSION}/gosu-$(dpkg --print-architecture)" \
    && chmod +x /usr/local/bin/gosu && chmod +s /usr/local/bin/gosu
COPY ./docker/node/entrypoint ./docker/node/run ./docker/node/healthcheck /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint /usr/local/bin/run /usr/local/bin/healthcheck
ENTRYPOINT [ "entrypoint" ]
CMD [ "run" ]
