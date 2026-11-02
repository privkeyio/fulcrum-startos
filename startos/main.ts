import { existsSync } from 'fs'
import { rm, writeFile } from 'fs/promises'
import { T } from '@start9labs/start-sdk'
import { StringDecoder } from 'string_decoder'
import { sdk } from './sdk'
import { i18n } from './i18n'
import { electrumPort, reindexRequest } from './utils'
import { manifest as bitcoinManifest } from 'bitcoin-core-startos/startos/manifest'
import { rpcHostId, rpcPort } from 'bitcoin-core-startos/startos/utils'
import { storeJson } from './fileModels/store.json'
import {
  defaultDbMem,
  fulcrumConf,
  syncedDbMem,
} from './fileModels/fulcrum.conf'

// The marker goes last, so an interrupted discard repeats on the next start.
async function discardIndex(effects: T.Effects) {
  for (const entry of ['fulc2_db', 'latch']) {
    await rm(sdk.volumes.main.subpath(entry), {
      recursive: true,
      force: true,
    })
  }
  if (
    (await fulcrumConf.read((c) => c.db_mem).once()) === syncedDbMem() &&
    syncedDbMem() < defaultDbMem()
  ) {
    await fulcrumConf.merge(
      effects,
      { db_mem: defaultDbMem() },
      { allowWriteAfterConst: true },
    )
  }
  await storeJson.merge(effects, { syncNotified: false })
}

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Fulcrum'))

  if (existsSync(reindexRequest)) {
    await discardIndex(effects)
    await rm(reindexRequest, { force: true })
  }

  const store = await storeJson.read().once()
  if (!store) throw new Error('No store')

  // bitcoind's RPC is reached over the LXC bridge, not the deprecated
  // `bitcoind.startos` DNS name. The bridge address only changes when
  // bitcoind's binding does, so this .const() restarts Fulcrum exactly on
  // bitcoind install/uninstall/port-change and never on bitcoind updates.
  // While bitcoind is absent the address resolves null and we omit the
  // `bitcoind` line; the .const() heals (one restart), writing the real
  // address, when bitcoind appears.
  const bitcoindRpc = await sdk.host
    .getBridgeAddress(effects, {
      packageId: 'bitcoind',
      hostId: rpcHostId,
      internalPort: rpcPort,
      ssl: false,
    })
    .const()
  await fulcrumConf.merge(effects, { bitcoind: bitcoindRpc ?? undefined })

  // Consted *after* the merge above so that write is already part of the
  // captured value — consting first would see its own `bitcoind` write as a
  // change. Fulcrum reads fulcrum.conf only at startup, so every later change
  // (a Configure save, the post-sync db_mem drop below) has to restart the
  // daemon to take effect, which is exactly what this const does.
  const conf = await fulcrumConf.read().const(effects)

  let lastSyncLog: string | null = null
  let missingBlockAt = 0
  // Survives the respawn, which performs the discard before Fulcrum runs again.
  let unreadableIndex = false
  // Set while the block headers are being converted, which is the one startup path that keeps the
  // Electrum port shut for a noticeable stretch without any sync progress to report yet.
  let converting = false
  // Clients can put text in the log once Fulcrum listens, and the index checks all run before that.
  let listening = false

  return sdk.Daemons.of(effects)
    .addDaemon('primary', {
      subcontainer: sdk.SubContainer.of(
        effects,
        { imageId: 'main' },
        sdk.Mounts.of()
          .mountVolume({
            volumeId: 'main',
            subpath: null,
            mountpoint: '/data',
            readonly: false,
          })
          .mountDependency<typeof bitcoinManifest>({
            dependencyId: 'bitcoind',
            volumeId: 'main',
            subpath: null,
            mountpoint: '/mnt/bitcoind',
            readonly: true,
          }),
        'primary-sub',
      ),
      exec: {
        // The SDK calls fn on every respawn, so a restarted Fulcrum inherits no partial line or progress.
        fn: async () => {
          lastSyncLog = null
          missingBlockAt = 0
          converting = false
          listening = false
          if (unreadableIndex) {
            unreadableIndex = false
            await writeFile(reindexRequest, '')
            await discardIndex(effects)
            store.syncNotified = false
            await rm(reindexRequest, { force: true })
          }
          let pending = ''
          const decoder = new StringDecoder('utf8')
          return {
            command: ['Fulcrum', '--ts-format', 'none', '/data/fulcrum.conf'],
            onStdout: (chunk) => {
              const lines = (pending + decoder.write(chunk)).split('\n')
              pending = lines.pop() ?? ''
              for (const line of lines) {
                console.log(line)

                if (
                  line.includes('Service started, listening for connections')
                ) {
                  listening = true
                }

                // This build and the marketplace build can write incompatible header records, and neither
                // can open the other's index. Fulcrum reports this and exits rather than misreading the
                // data. Discard the index so the restart rebuilds it, instead of crash-looping with no way
                // out from the UI. Keyed on the message, so a readable index is never touched.
                if (
                  !listening &&
                  !unreadableIndex &&
                  (line.includes('Magic bytes mismatch for DB fulc2_db') ||
                    line.includes('header format stopped partway'))
                ) {
                  unreadableIndex = true
                  console.warn(
                    'Fulcrum cannot read the existing address index, which was written by a build using a different header format. Discarding it; it will be rebuilt from scratch.',
                  )
                }

                if (
                  !listening &&
                  line.includes('block headers to the current format')
                )
                  converting = true
                // Clear on anything that means the conversion is no longer under way. Reporting it as still
                // running when it has died would dress a permanently broken service up as a busy one.
                if (
                  line.includes('block headers in ') || // finished
                  line.includes('Caught exception:') || // died, including any failure inside the conversion
                  line.includes('<Controller>') // got far enough to start indexing, so it is long done
                ) {
                  converting = false
                }

                if (line.startsWith('<Controller>')) {
                  lastSyncLog = line.slice('<Controller>'.length).trim()
                }
                // Bitcoin's answer for a block it has not downloaded yet (29.x and later, then 28.x); Fulcrum retries every 2 s.
                if (
                  line.includes('getblock: error response') &&
                  /Block not available \(not fully downloaded\)|Block not found on disk/.test(
                    line,
                  )
                ) {
                  missingBlockAt = Date.now()
                }
              }
            },
          }
        },
      },
      ready: {
        display: i18n('Electrum (SSL)'),
        fn: async () => {
          const result = await sdk.healthCheck.checkPortListening(
            effects,
            electrumPort,
            {
              successMessage: i18n('The Electrum interface is ready'),
              errorMessage: i18n('The Electrum interface is not ready'),
            },
          )

          if (result.result === 'success') return result

          if (converting) {
            return {
              result: 'loading',
              message: i18n(
                'Converting the block headers to the current format...',
              ),
            }
          }

          if (lastSyncLog) {
            return {
              result: 'loading',
              message: i18n('Electrum interface not ready while syncing...'),
            }
          }

          return result
        },
      },
      requires: [],
    })
    .addHealthCheck('sync-progress', {
      ready: {
        display: i18n('Sync Progress'),
        fn: async () => {
          const fulcrumReady = await sdk.healthCheck.checkPortListening(
            effects,
            electrumPort,
            {
              successMessage: i18n('Fulcrum is synced'),
              errorMessage: '',
            },
          )

          if (fulcrumReady.result === 'success') return fulcrumReady

          if (Date.now() - missingBlockAt < 30_000)
            return {
              message: i18n('Waiting for Bitcoin to provide historical blocks'),
              result: 'loading',
            }

          if (!lastSyncLog) {
            return {
              message: i18n('Unknown status'),
              result: 'loading',
            }
          }

          return {
            message: lastSyncLog,
            result: 'loading',
          }
        },
      },
      requires: [],
    })
    .addOneshot('synced-true', {
      subcontainer: null,
      exec: {
        fn: async () => {
          if (!store.syncNotified) {
            // Only reclaim what we ourselves seeded — a value the user picked
            // in Configure is theirs to keep.
            const lowerDbMem =
              conf?.db_mem === defaultDbMem() && syncedDbMem() < defaultDbMem()

            await sdk.notification.create(effects, {
              level: 'success',
              title: i18n('Sync Complete'),
              message: lowerDbMem
                ? i18n(
                    'Fulcrum has finished building its address index. It is restarting once to apply a lower database memory setting, after which the Electrum server is ready.',
                  )
                : i18n(
                    'Fulcrum has finished building its address index. The Electrum server is ready.',
                  ),
            })
            await storeJson.merge(effects, { syncNotified: true })
            // Keep the in-memory guard in sync so a sync-progress dip and
            // recovery within this run doesn't re-fire the notification.
            store.syncNotified = true

            // Restarts main via the const above. syncNotified is already
            // persisted, so the rerun skips this block rather than looping.
            if (lowerDbMem) {
              await fulcrumConf.merge(
                effects,
                { db_mem: syncedDbMem() },
                { allowWriteAfterConst: true },
              )
            }
          }
          return null
        },
      },
      requires: ['sync-progress'],
    })
})
