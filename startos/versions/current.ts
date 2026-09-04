import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '#blake:2.1.2:0',
  releaseNotes: {
    en_US: `Fulcrum with support for the BLAKE2b proof-of-work hardfork.

The hardfork changes the proof of work at an activation height: from that block on, block headers are 164 bytes and hashed with BLAKE2b rather than 80 bytes and SHA256d. History is continuous, so blocks below that height keep their original headers and both forms coexist in one index. The standard build cannot parse the new form and stops at the activation block rather than serving wrong data. This one reads both.

## Switching to this build

This is a flavor of the same package rather than a separate one, so it replaces the standard build in place and keeps its index. The on-disk format is unchanged below the activation height: the headers table keeps the same record size and magic, and only the extended header's 84-byte tail is stored separately, in a table created the first time such a header is seen. Switching therefore does not resync.

## Coming from an earlier release of this package

Releases before this one padded every header out to 164 bytes and stamped the headers table with their own magic, which neither the standard build nor this one can read. Only that table differed, so such an index is converted on the first start rather than being rebuilt: a chain the length of mainnet converts in a second or two, and the address index, the utxo set and everything else are kept untouched. Should the conversion not complete, the index is discarded and rebuilt rather than leaving the service unable to start.

## Switching back is not offered

Once the chain has activated the hardfork, the index contains extended headers that the standard build cannot read; it would stop on startup with a magic bytes mismatch and could not be recovered from the interface. Returning to the standard build is therefore blocked. To go back, remove this and reinstall the standard build, which rebuilds its index from scratch.`,
  },
  migrations: {
    up: async () => {},
    //Refuse the reverse switch. Past the activation height the index holds extended headers the
    //unflavored build cannot read, so it would fail to start with no way to recover from the UI.
    down: IMPOSSIBLE,
    other: {
      //Arriving from the unflavored build. Its index is readable as-is below the activation height,
      //so there is nothing to migrate and no resync.
      //No `down`: omitting it leaves the reverse switch unavailable, which is what the index requires
      //past the activation height.
      ['^2']: {
        up: async () => {},
      },
    },
  },
})
