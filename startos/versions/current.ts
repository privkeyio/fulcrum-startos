import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '2.1.1:19',
  releaseNotes: {
    en_US: `Fixes a crash when a reorg unwinds a block from before the BLAKE2b activation height.

Rewinding a block checks the size of the header being undone. That check compared against the on-disk record size, 164 bytes, rather than the header's real size, so unwinding any block mined before the activation height, whose header is still 80 bytes, aborted with "No header to undo" and stopped the daemon. A chain reorg spanning the activation height hit this on every restart.

Your address index is not affected and is kept: this version only replaces the binary, and Fulcrum resumes from where it left off.`,
  },
  // No migration: the index written by 2.1.1:18 is still valid, only the binary changes.
  migrations: {},
})
