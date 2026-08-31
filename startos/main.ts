import { rm } from 'fs/promises'
import { sdk } from './sdk'
import { i18n } from './i18n'
import { electrumPort } from './utils'
import { manifest as bitcoinManifest } from 'bitcoin-core-startos/startos/manifest'
import { rpcHostId, rpcPort } from 'bitcoin-core-startos/startos/utils'
import { storeJson } from './file-models/store.json'
import {
  defaultDbMem,
  fulcrumConf,
  syncedDbMem,
} from './file-models/fulcrum.conf'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Fulcrum'))

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

  // var to keep track of sync progress
  let lastSyncLog: string | null = null
  let clearedUnreadableIndex = false

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
        command: ['Fulcrum', '--ts-format', 'none', '/data/fulcrum.conf'],
        // capture stdout and keep track of sync progress logs
        onStdout: (chunk) => {
          const text = Buffer.isBuffer(chunk)
            ? chunk.toString('utf8')
            : String(chunk)

          console.log(text)

          //Fulcrum and the marketplace build write incompatible header records and neither can open
          //the other's index; it reports this and exits rather than misreading the data. Discard the
          //index so the restart rebuilds it, instead of crash-looping with no way out from the UI.
          //Guarded so it happens once per run, and keyed on the message so a readable index is never
          //touched.
          if (!clearedUnreadableIndex && text.includes('Magic bytes mismatch for DB fulc2_db')) {
            clearedUnreadableIndex = true
            console.warn(
              'Fulcrum cannot read the existing address index, which was written by a build using a different header format. Discarding it; it will be rebuilt from scratch.',
            )
            rm('/media/startos/volumes/main/fulc2_db', {
              recursive: true,
              force: true,
            }).catch(console.error)
          }

          const prefix = '<Controller>'
          if (text.startsWith(prefix)) {
            lastSyncLog = text.slice(prefix.length).trim()
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
