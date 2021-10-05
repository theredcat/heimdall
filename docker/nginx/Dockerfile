FROM nginx:1.21.3 AS base
HEALTHCHECK --interval=5s --timeout=20s --retries=1 CMD bash -c 'curl --fail localhost/docker/_ping'
WORKDIR /srv/heimdall/current
RUN apt-get update && apt-get install make && rm -rf /var/lib/apt/lists/*

FROM heimdall-node:latest AS release-build
COPY --chown=app:app ./ /tmp/build
RUN cd /tmp/build && make install && make build

FROM base AS release
COPY --from=release-build /tmp/build/dist/ /tmp/build/config.json.tpl /tmp/build/Makefile /srv/heimdall/current/
COPY ./docker/nginx/nginx.conf.release.tpl /etc/nginx/nginx.conf.tpl
CMD [ "/bin/bash", "-c", "envsubst < /etc/nginx/nginx.conf.tpl > /etc/nginx/nginx.conf && make config && nginx -g 'daemon off;'" ]

FROM base AS dev
COPY ./docker/nginx/nginx.conf.dev.tpl /etc/nginx/nginx.conf.tpl
CMD [ "/bin/bash", "-c", "envsubst < /etc/nginx/nginx.conf.tpl > /etc/nginx/nginx.conf && nginx -g 'daemon off;'" ]
