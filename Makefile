SOURCES = $(shell find . -maxdepth 2 -mindepth 2 -name Dockerfile.in -print)
TARGETS = $(basename $(SOURCES))
DEPS = ./update-dockerfiles.sh ./lib.sh

all: $(TARGETS)

%/Dockerfile: %/Dockerfile.in $(DEPS)
	./update-dockerfiles.sh $< $@
