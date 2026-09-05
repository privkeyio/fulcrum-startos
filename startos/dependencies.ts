import { autoconfig } from 'bitcoin-core-startos/startos/actions/config/autoconfig'
import { i18n } from './i18n'
import { sdk } from './sdk'

export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  await sdk.action.createTask(effects, 'bitcoind', autoconfig, 'critical', {
    input: {
      kind: 'partial',
      accept: [{ prune: 0, txindex: true, zmqEnabled: true }],
      set: { prune: 0, txindex: true, zmqEnabled: true },
    },
    reason: i18n(
      'Pruning must be disabled, txindex and ZMQ must be enabled for Fulcrum to function properly.',
    ),
    when: { condition: 'input-not-matches', once: false },
  })

  return {
    bitcoind: {
      kind: 'running',
      // Only Knots schedules the hard fork, so only Knots serves the extended headers this build exists to
      // index. Requiring the flavor keeps it from being pointed at a node that will never produce them.
      versionRange: '>=#knots:29.4.1:4',
      healthChecks: ['bitcoind'],
    },
  }
})
