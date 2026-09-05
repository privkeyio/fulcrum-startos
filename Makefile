ARCHES := x86 arm
# The image build cannot read the submodule's commit itself; see startos/manifest/index.ts
export FULCRUM_GIT_COMMIT := $(shell git -C fulcrum describe --always --dirty --match 'NOT A TAG' 2>/dev/null)
# overrides to s9pk.mk must precede the include statement
include node_modules/@start9labs/start-sdk/s9pk.mk
