ARG NODE_VERSION
ARG GOSU_VERSION

FROM node:$NODE_VERSION-bullseye-slim AS base
ARG GOSU_VERSION

# Switch to root for setup
USER root
RUN apt-get update && apt-get install --no-install-recommends -y \
    python3 curl build-essential ca-certificates gettext-base \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
RUN mkdir -p /srv/heimdall/current

# Create user
RUN userdel node
RUN useradd -ms /bin/bash app

# Switch back to app user
USER app

WORKDIR /srv/heimdall/current

###############################
## Release target
###############################
FROM base AS release-build
COPY tsconfig.json client/ /tmp/client
RUN cd /tmp/client && npm run build

COPY tsconfig.json proxy/ /tmp/proxy
RUN cd /tmp/proxy && npm run build

FROM node:$NODE_VERSION-bullseye-slim AS release
COPY --from=release-build /tmp/proxy/dist/* /srv/heimdall/current/
COPY --from=release-build /tmp/client/dist/* /srv/heimdall/current/dist

###############################
## Dev target
###############################
FROM base AS dev
USER root
# Install gosu
RUN curl -Lo /usr/local/bin/gosu "https://github.com/tianon/gosu/releases/download/$GOSU_VERSION/gosu-$(dpkg --print-architecture)"
RUN chmod +x /usr/local/bin/gosu && chmod +s /usr/local/bin/gosu

# Copy and chmod scripts
COPY ./docker/node/entrypoint /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint
ENTRYPOINT ["entrypoint"]

USER app

