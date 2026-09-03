import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '2.1.2:0',
  releaseNotes: {
    en_US: `Fulcrum with support for the BLAKE2b proof-of-work hardfork, as a separate package.

The hardfork changes the proof of work at an activation height: from that block on, block headers are 164 bytes and hashed with BLAKE2b rather than 80 bytes and SHA256d. History is continuous, so blocks below that height keep their original headers and both forms coexist in one index. The Fulcrum in the marketplace cannot parse the new form and stops at the activation block rather than serving wrong data. This build reads both.

## Why this is a separate package

Earlier releases of this work carried the same package id as the marketplace Fulcrum, so its version outranked them and replaced them, after which Fulcrum would not start because the two wrote incompatible indexes. A distinct id removes that: the two packages coexist, neither replaces the other, and each keeps its own index.

Installing this alongside the marketplace Fulcrum is supported and is the safe way to try it. It builds its own index from scratch, which takes as long as the original sync, and the Electrum port stays closed until that finishes.

## On-disk format

The extended header's first 80 bytes are exactly the legacy field layout, so the headers table keeps the same record size and magic the marketplace build uses, and only the 84-byte tail is stored separately, in a table created the first time an extended header is seen. A chain that has not activated the hardfork therefore writes an index the marketplace build can also read.`,
  },
  migrations: {},
})
