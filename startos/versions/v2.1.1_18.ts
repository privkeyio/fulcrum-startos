import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'
import { rm } from 'fs/promises'

export const v_2_1_1_18 = VersionInfo.of({
  version: '2.1.1:18',
  releaseNotes: {
    en_US: `Rebuilds Fulcrum with support for the BLAKE2b proof-of-work hard fork, and clears the old index so it can start.

The hard fork changes the proof of work at an activation height: from that block on, headers are 164 bytes and hashed with BLAKE2b instead of 80 bytes and SHA256d. This is one chain with continuous history, so blocks below that height keep their original headers and both forms coexist in the same index. Stock Fulcrum cannot parse the new form and stops at the activation block rather than serving wrong data. This build reads both, hashes each with the right algorithm, and serves them unchanged over the Electrum protocol, so it keeps indexing straight through the activation.

Header records changed size on disk, so an index written by an earlier version cannot be read and Fulcrum refuses to open it. This version deletes that index on upgrade and rebuilds it from scratch. That is a local rebuild forced by the storage layout, not a re-download of a different chain, but expect a full resync during which wallets cannot query the server. Nothing else about Fulcrum's behaviour has changed, and below the activation height there is no difference in what it serves.`,
  },
  migrations: {
    // Header records grew from 80 to 164 bytes for BLAKE2b support, so the headers table's magic
    // was bumped and Fulcrum refuses to open an index written by an earlier version. Drop it here
    // so the daemon starts and resyncs, rather than crash-looping on the mismatch.
    up: async () => {
      await rm('/media/startos/volumes/main/fulc2_db', {
        recursive: true,
        force: true,
      }).catch(console.error)
    },
    down: IMPOSSIBLE,
  },
})
