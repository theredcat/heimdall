.PHONY: all build config pre-symlink post-symlink

all: build install config pre-symlink post-symlink

install:
ifeq ($(APP_MODE),dev)
	npm ci
else
	npm ci --only-production
endif

build: install
	npm run build

config:
ifeq ($(APP_MODE),dev)
	# Dev: served statically by webpack-dev-server from ./dist
	mkdir -p ./dist
	envsubst < ./config.json.tpl > ./dist/config.json
else
	# Release: nginx serves the (flattened) build dir as web root
	envsubst < ./config.json.tpl > ./config.json
endif

pre-symlink:
post-symlink:

release:
	export USER_UID=$$(id -u) && \
	export USER_GID=$$(id -g) && \
	export BUILDX_BUILDER=default && \
	docker compose -f docker-compose.yml -f docker-compose.release.yml build heimdall-node && \
	docker compose -f docker-compose.yml -f docker-compose.release.yml build heimdall-proxy && \
	[ y = "$$(echo "Publish (y to confirm) ? :" 1>&2; read confirm; echo -n $$confirm)" ] && \
	docker compose -f docker-compose.yml -f docker-compose.release.yml push heimdall-proxy
