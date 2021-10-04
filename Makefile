.PHONY: all build config pre-symlink post-symlink

all: build install config pre-symlink post-symlink

install:
ifeq ($(APP_MODE),dev)
	npm ci
else
	npm ci --only-production
endif

build: install
config:
	envsubst < ./config.json.tpl > ./config.json

pre-symlink:
post-symlink:
