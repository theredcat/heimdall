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
	envsubst < ./config.json.tpl > ./config.json

pre-symlink:
post-symlink:

release:
	export USER_UID=$(id -u) && \
	export USER_GID=$(id -g) && \
	docker-compose -f docker-compose.yml -f docker-compose.release.yml build heimdall-proxy && \
	[ y = "$$(echo "Publish (y to confirm) ? :" 1>&2; read confirm; echo -n $$confirm)" ] && \
	docker-compose -f docker-compose.yml -f docker-compose.release.yml push heimdall-proxy
