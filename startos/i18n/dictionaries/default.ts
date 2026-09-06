export const DEFAULT_LANG = 'en_US'

const dict = {
  // main.ts
  'Starting Fulcrum': 0,
  'Electrum (SSL)': 1,
  'The Electrum interface is ready': 2,
  'The Electrum interface is not ready': 3,
  'Electrum interface not ready while syncing...': 4,
  'Converting the block headers to the current format...': 32,
  'Sync Progress': 5,
  'Fulcrum is synced': 6,
  'Unknown status': 7,
  'Sync Complete': 27,
  'Fulcrum has finished building its address index. The Electrum server is ready.': 28,
  'Fulcrum has finished building its address index. It is restarting once to apply a lower database memory setting, after which the Electrum server is ready.': 29,
  // interfaces.ts
  'The main interface for accessing Fulcrum via Electrum protocol through SSL': 8,
  // actions/configure.ts
  Configure: 9,
  'Configure Fulcrum banner and performance settings.': 10,
  'Server Banner': 11,
  'Custom banner text displayed to connecting Electrum clients. Leave empty to use the Fulcrum default banner.': 12,
  'ASCII art welcome! Variables like $SERVER_VERSION are supported.': 13,
  'Bitcoin RPC Timeout (seconds)': 14,
  'Controls how long Fulcrum waits for responses from Bitcoin RPC before failing a request.': 15,
  'Bitcoin RPC Clients': 16,
  'Number of concurrent RPC client connections to Bitcoin.': 17,
  'Worker Threads (0 for auto)': 18,
  'Set the number of Fulcrum worker threads. Use 0 to allow Fulcrum to choose automatically.': 19,
  'Database Memory (MB)': 20,
  'Upper bound on memory used by the RocksDB cache. Set at install for the index build and lowered automatically once the index is complete. Raise it for faster queries at the cost of RAM.': 21,
  'Database Max Open Files': 22,
  'Raise this if Fulcrum logs complaints about too many open files.': 23,
  'Max Address History': 30,
  'Largest number of transactions Fulcrum will report for a single address. An address busier than this returns an empty or partial history, balance and coin list rather than an error, so a wallet holding one shows the funds as missing. Raise this if an address you use has a very long history; the limit exists to bound the memory and time a single request can cost.': 31,
  Configuration: 24,
  // dependencies.ts
  'Pruning must be disabled, txindex and ZMQ must be enabled for Fulcrum to function properly.': 25,
  Default: 26,
} as const

export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
