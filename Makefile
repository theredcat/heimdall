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
	docker-compose -f docker-compose.yml -f docker-compose.release.yml build heimdall-proxy
	docker-compose -f docker-compose.yml -f docker-compose.release.yml push heimdall-proxy
