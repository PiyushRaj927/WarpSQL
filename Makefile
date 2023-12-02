NAME=postgres
# Default is to timescaledev to avoid unexpected push to the main repo
# Set ORG to timescale in the caller
ORG=samagragovernance
PG_VER=pg15
CITUS_VERSION="11.2.0"
POSTGIS_VERSION=3.4.1
PG_REPACK_VERSION = 1.4.8
PG_AUTO_FAILOVER_VERSION = 2.0
POSTGRES_HLL_VERSION = 2.17
PG_JOBMON_VERSION=v1.4.1
PG_PARTMAN_VERSION=v4.7.1
POSTGIS_SHA256=473c09cbeb68c6e39c882c35e716994d2f8c1e614611162ef3d2a54716cbb74c
PG_VER_NUMBER=$(shell echo $(PG_VER) | cut -c3-)
TS_VERSION=main
PREV_TS_VERSION=$(shell wget --quiet -O - https://raw.githubusercontent.com/timescale/timescaledb/${TS_VERSION}/version.config | grep update_from_version | sed -e 's!update_from_version = !!')
PREV_TS_IMAGE="samagragovernance/postgres:$(PREV_TS_VERSION)-pg$(PG_VER_NUMBER)$(PREV_EXTRA)"
PREV_IMAGE=$(shell if docker pull "$(PREV_TS_IMAGE)" >/dev/null 2>&1; then echo "$(PREV_TS_IMAGE)"; else echo "timescale/timescaledb:$(PREV_TS_VERSION)-pg$(PG_VER_NUMBER)$(PREV_EXTRA)"; fi )
# Beta releases should not be tagged as latest, so BETA is used to track.
BETA=$(findstring rc,$(TS_VERSION))
PLATFORM=linux/amd64,linux/arm64

# PUSH_MULTI can be set to nothing for dry-run without pushing during multi-arch build
PUSH_MULTI=--push
TAG_VERSION=$(ORG)/$(NAME):$(TS_VERSION)-$(PG_VER)
TAG_LATEST=$(ORG)/$(NAME):latest-$(PG_VER)
TAG=-t $(TAG_VERSION) $(if $(BETA),,-t $(TAG_LATEST))
TAG_OSS=-t $(TAG_VERSION)-oss $(if $(BETA),,-t $(TAG_LATEST)-oss)

DOCKER_BUILD_ARGS = --build-arg PG_VERSION=$(PG_VER_NUMBER) \
		    --build-arg TS_VERSION=$(TS_VERSION) \
		    --build-arg PREV_IMAGE=$(PREV_IMAGE) \
		    --build-arg CITUS_VERSION=$(CITUS_VERSION) \
		    --build-arg PG_VER=$(PG_VER) \
		    --build-arg PG_REPACK_VERSION=$(PG_REPACK_VERSION) \
		    --build-arg POSTGIS_VERSION=$(POSTGIS_VERSION) \
		    --build-arg PG_AUTO_FAILOVER_VERSION=$(PG_AUTO_FAILOVER_VERSION) \
		    --build-arg POSTGIS_VERSION=$(POSTGIS_VERSION) \
	            --build-arg POSTGIS_SHA256=$(POSTGIS_SHA256)  \
		    --build-arg POSTGRES_HLL_VERSION=$(POSTGRES_HLL_VERSION) \
		    --build-arg PG_JOBMON_VERSION=$(PG_JOBMON_VERSION) \
		    --build-arg PG_PARTMAN_VERSION=$(PG_PARTMAN_VERSION)

default: image

.multi_$(TS_VERSION)_$(PG_VER)_oss: Dockerfile
	test -n "$(TS_VERSION)"  # TS_VERSION
	test -n "$(PREV_TS_VERSION)"  # PREV_TS_VERSION
	docker buildx create --platform $(PLATFORM) --name multibuild --use
	docker buildx inspect multibuild --bootstrap
	docker buildx build --platform $(PLATFORM) \
		--build-arg TS_VERSION=$(TS_VERSION) \
		--build-arg PG_VERSION=$(PG_VER_NUMBER) \
		--build-arg PREV_IMAGE=$(PREV_IMAGE) \
		--build-arg OSS_ONLY=" -DAPACHE_ONLY=1" \
		$(TAG_OSS) $(PUSH_MULTI) .
	touch .multi_$(TS_VERSION)_$(PG_VER)_oss
	docker buildx rm multibuild

.multi_$(TS_VERSION)_$(PG_VER): Dockerfile
	test -n "$(TS_VERSION)"  # TS_VERSION
	test -n "$(PREV_TS_VERSION)"  # PREV_TS_VERSION
	test -n "$(PREV_IMAGE)"  # PREV_IMAGE
	docker buildx create --platform $(PLATFORM) --name multibuild --use
	docker buildx inspect multibuild --bootstrap
	docker buildx build --platform $(PLATFORM) \
		--build-arg TS_VERSION=$(TS_VERSION) \
		--build-arg PREV_IMAGE=$(PREV_IMAGE) \
		--build-arg PG_VERSION=$(PG_VER_NUMBER) \
		$(TAG) $(PUSH_MULTI) .
	touch .multi_$(TS_VERSION)_$(PG_VER)
	docker buildx rm multibuild

.build_$(TS_VERSION)_$(PG_VER)_oss: Dockerfile
	docker build --build-arg OSS_ONLY=" -DAPACHE_ONLY=1" --build-arg PG_VERSION=$(PG_VER_NUMBER) $(TAG_OSS) .
	touch .build_$(TS_VERSION)_$(PG_VER)_oss

.build_$(TS_VERSION)_$(PG_VER): Dockerfile
	docker build $(DOCKER_BUILD_ARGS) $(TAG) .
	touch .build_$(TS_VERSION)_$(PG_VER)

build-docker-cache: Dockerfile
	docker buildx create --use --driver=docker-container
	docker buildx  build  --progress=plain --load --cache-to "type=gha,mode=max" --cache-from type=gha  $(DOCKER_BUILD_ARGS) $(TAG) .
	touch .build_$(TS_VERSION)_$(PG_VER)

image: .build_$(TS_VERSION)_$(PG_VER)

oss: .build_$(TS_VERSION)_$(PG_VER)_oss

push: image
	docker push $(TAG_VERSION)
	if [ -z "$(BETA)" ]; then \
		docker push $(TAG_LATEST); \
	fi

push-oss: oss
	docker push $(TAG_VERSION)-oss
	if [ -z "$(BETA)" ]; then \
		docker push $(TAG_LATEST)-oss; \
	fi

multi: .multi_$(TS_VERSION)_$(PG_VER)

multi-oss: .multi_$(TS_VERSION)_$(PG_VER)_oss

all: multi multi-oss

clean:
	rm -f *~ .build_* .multi_*
	-docker buildx rm multibuild

.PHONY: default image push push-oss oss multi multi-oss clean all build-docker-cache
