import { writeFile } from 'fs/promises'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { reindexRequest } from '../utils'

export const reindex = sdk.Action.withoutInput(
  'reindex',

  async () => ({
    name: i18n('Reindex'),
    description: i18n(
      'Delete the address index and rebuild it from Bitcoin. Use this only if the index is corrupted: Fulcrum keeps crashing and its logs report a corrupted database, either a "Corruption" error or a message to delete the datadir and resync. If Bitcoin is still syncing, or a restart has not been tried, do that first.',
    ),
    warning: i18n(
      'Fulcrum and every service that uses it are unavailable for as long as the first index build took, which can be several days. If the logs show input/output errors, check your drive first: a rebuild on a failing drive fails the same way.',
    ),
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  async ({ effects }) => {
    await writeFile(reindexRequest, '')

    let status = await sdk.getStatus(effects).once()
    for (
      let i = 0;
      i < 60 && status?.desired.main === 'running' && !status.started;
      i++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1_000))
      status = await sdk.getStatus(effects).once()
    }

    if (
      status?.desired.main === 'running' ||
      status?.desired.main === 'restarting'
    ) {
      await sdk.restart(effects)
      // A single restart requested mid-start is dropped; a second one is kept.
      if (!status.started) await sdk.restart(effects)
      return {
        version: '1',
        title: i18n('Reindex'),
        message: i18n(
          'Fulcrum is restarting. It deletes its index and rebuilds it from Bitcoin, which can take several days.',
        ),
        result: null,
      }
    }

    return {
      version: '1',
      title: i18n('Reindex'),
      message: i18n(
        'Fulcrum deletes its index and rebuilds it from Bitcoin the next time it starts.',
      ),
      result: null,
    }
  },
)
