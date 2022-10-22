ARG NODE_VERSION=16.10.0
ARG GOSU_VERSION=1.11

FROM node:$NODE_VERSION-bullseye-slim AS base
ARG GOSU_VERSION

# Switch to root for setup
USER root
RUN apt-get update && apt-get install --no-install-recommends -y \
    python3 build-essential procps curl ca-certificates gettext-base \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
RUN mkdir -p /srv/heimdall/current

# Create user
RUN userdel node
RUN useradd -ms /bin/bash app

# Install gosu
RUN curl -Lo /usr/local/bin/gosu "https://github.com/tianon/gosu/releases/download/$GOSU_VERSION/gosu-$(dpkg --print-architecture)"
RUN chmod +x /usr/local/bin/gosu && chmod +s /usr/local/bin/gosu

# Copy and chmod scripts
COPY ./run ./entrypoint ./healthcheck /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint /usr/local/bin/run /usr/local/bin/healthcheck

HEALTHCHECK --interval=5s --timeout=20s --retries=1 CMD healthcheck.sh

# Switch back to app user
USER app

WORKDIR /srv/heimdall/current
ENTRYPOINT [ "entrypoint" ]
CMD [ "run" ]

FROM base AS dev
# Add npm wrapper
USER root
RUN mv /usr/local/bin/npm /usr/local/bin/npm_original
COPY ./npm_wrapper /usr/local/bin/npm
RUN chmod +x /usr/local/bin/npm
USER app

