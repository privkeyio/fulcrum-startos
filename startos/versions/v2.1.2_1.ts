import { VersionInfo } from '@start9labs/start-sdk'

export const v_2_1_2_1 = VersionInfo.of({
  version: '2.1.2:1',
  releaseNotes: {
    en_US: `Rebuilds on Fulcrum 2.1.2, keeping BLAKE2b hard fork support.

Upstream 2.1.2 replaced this package on machines that took it from the marketplace, and stock Fulcrum cannot read an index written with BLAKE2b headers: it stops with a magic bytes mismatch rather than misreading it. This version is upstream 2.1.2 with the hard fork support applied on top, so it reads that index again.

The index is kept. Upstream 2.1.2 left the database version and the record layout alone, so there is nothing to migrate and no resync.

Note that the marketplace build of Fulcrum will replace this one whenever its version sorts higher, and Fulcrum will then refuse to start until this package is installed again.`,
  },
  // No migration: upstream 2.1.2 did not change the database version or the record layout, and the
  // index on disk is the one this package wrote.
  migrations: {},
})
