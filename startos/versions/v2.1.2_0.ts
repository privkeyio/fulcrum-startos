import { VersionInfo } from '@start9labs/start-sdk'

/**
 * The upstream marketplace release. Declared only so that installing over it resolves a path; this
 * package never produces it. No migration, since the volume it leaves behind is unchanged.
 */
export const v_2_1_2_0 = VersionInfo.of({
  version: '2.1.2:0',
  releaseNotes: {
    en_US: `Upstream Fulcrum 2.1.2, without BLAKE2b support.`,
  },
  migrations: {},
})
