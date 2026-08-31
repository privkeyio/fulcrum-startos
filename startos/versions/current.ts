import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '2.1.2:2',
  releaseNotes: {
    en_US: `Recovers automatically from an index this build cannot read.

Fulcrum writes a different header record format here than the marketplace build does, and neither can open the other's index: it stops with a magic bytes mismatch instead of misreading the data. Installing this package over a working stock Fulcrum therefore left it crash-looping, with nothing a user could do from the interface to clear it.

The daemon now watches for that specific error, discards the index once, and lets Fulcrum restart and rebuild. It only fires on that message, so an index this build can read is never touched and no resync happens on an ordinary upgrade.

Where the index is discarded, the address index is rebuilt from scratch and takes as long as the original sync.`,
  },
  // No migration: the index is cleared at runtime only when Fulcrum reports it cannot read it,
  // which is the actual condition. A version range cannot express it, since both this package's
  // earlier releases and the marketplace build occupy the same unflavored version space.
  migrations: {},
})
