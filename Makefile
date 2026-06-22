.PHONY: all install build release

all: build

install:
ifeq ($(APP_MODE),dev)
	npm ci
else
	npm ci --omit=dev
endif

build: install
	npm run build

release:
	export USER_UID=$$(id -u) && \
	export USER_GID=$$(id -g) && \
	export BUILDX_BUILDER=default && \
	docker compose -f docker-compose.yml -f docker-compose.release.yml build heimdall && \
	[ y = "$$(echo "Publish (y to confirm) ? :" 1>&2; read confirm; echo -n $$confirm)" ] && \
	docker compose -f docker-compose.yml -f docker-compose.release.yml push heimdall
