import { VersionInfo } from '@start9labs/start-sdk'

export const v_2_1_1_17 = VersionInfo.of({
  version: '2.1.1:17',
  releaseNotes: {
    en_US: `Rebuilds Fulcrum with support for the BLAKE2b proof-of-work hard fork.

The hard fork replaces the 80-byte SHA256d block header with a 164-byte header hashed with BLAKE2b, which stock Fulcrum cannot parse: it stops at the activation block rather than serving wrong data. This build reads both header forms, hashes each with the right algorithm, and serves them unchanged over the Electrum protocol, so a server following the forked chain keeps indexing across the activation height.

Because header records changed size, the address index is rebuilt from scratch on first start. Expect a full resync; nothing else about Fulcrum's behaviour has changed, and a server on the SHA256d chain is unaffected.`,
  },
  migrations: {},
})
