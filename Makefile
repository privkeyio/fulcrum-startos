ARCHES := x86 arm
# The image build cannot read the submodule's commit itself; see startos/manifest/index.ts
export FULCRUM_GIT_COMMIT := $(shell git -C fulcrum describe --always --dirty --match 'NOT A TAG' 2>/dev/null)
# Empty would ship a binary that cannot say what it is, and nothing else would fail, so stop here.
ifeq ($(strip $(FULCRUM_GIT_COMMIT)),)
ifeq ($(filter clean,$(MAKECMDGOALS)),)
$(error Could not read the Fulcrum submodule's commit. Run `git submodule update --init`.)
endif
endif
# overrides to s9pk.mk must precede the include statement
include node_modules/@start9labs/start-sdk/s9pk.mk
