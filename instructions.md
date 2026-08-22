# Fulcrum

## Documentation

- [Connecting a wallet](https://docs.start9.com/bitcoin-guides/connecting-wallets) — the Start9 guide to pointing a wallet at your own Electrum server: the certificate, SSL, Tor, and where the setting lives in each wallet.
- [Bitcoin wallets](https://docs.start9.com/bitcoin-guides/bitcoin-wallets) — which wallets work with an Electrum server, on which platforms.
- [Fulcrum documentation](https://github.com/cculianu/Fulcrum/tree/master/doc) — the upstream documentation covering configuration, operation, and tuning.

## Requirements

- **Fulcrum is resource-intensive.** It reserves up to a quarter of the memory StartOS shares out among your services (never more than 2 GB) while building its address index, drops to 512 MB once the index is complete, and needs more on top of that for its own working memory — all while sharing the machine with the Bitcoin node it depends on. The indexes need 180 GB+; combined with a full Bitcoin node (~800 GB), total storage requirements exceed 1 TB, so a 2 TB drive is strongly recommended. Insufficient resources may cause system instability or failure.

## What you get on StartOS

- A high-performance **Electrum server** indexing your own Bitcoin node, exposed as the **Electrum (SSL)** interface for wallets to connect to.
- Automatic wiring to Bitcoin: the RPC endpoint and cookie authentication are configured for you, so no manual node setup is required.

## Getting set up

Fulcrum requires Bitcoin with `prune=0`, `txindex=true`, and ZMQ enabled. StartOS posts a critical task on Bitcoin to apply these settings if they are not already in place.

1. Install Bitcoin if you have not already.
2. Install Fulcrum. Resolve any critical task that appears on Bitcoin to enforce the required settings.
3. Start Fulcrum. The initial index build takes many hours and pulls roughly 180 GB of data on top of the Bitcoin volume — plan for at least 1 TB of disk, ideally 2 TB.
4. Watch the **Sync Progress** health check on the service dashboard. It reports live progress from Fulcrum's controller and switches to **Synced** once the Electrum interface is ready to serve clients.

## Using Fulcrum

### Connecting a wallet

Open the **Electrum (SSL)** interface and copy an address into your wallet. It is shown as an `ssl://` URL, and the host and port in it are what your wallet needs — **take the port from that address rather than assuming one**, since StartOS assigns it and it is not always the same number on every server.

Only the encrypted endpoint is reachable from off this server — there is no plaintext port on any address — so your wallet's SSL option has to be on, and it has to be told to trust the certificate StartOS serves. Both steps, and where the settings live in each wallet, are in the [Start9 guide to connecting a wallet](https://docs.start9.com/bitcoin-guides/connecting-wallets). The Electrum desktop wallet needs a file placed by hand and is covered there too.

### Configure

Run the **Configure** action to set:

- **Server Banner** — custom text shown to connecting Electrum clients.
- **Bitcoin RPC Timeout**, **Bitcoin RPC Clients** — how Fulcrum talks to Bitcoin.
- **Worker Threads** — leave at `0` to let Fulcrum auto-detect, or pin a specific number.
- **Database Memory** — the RocksDB cache size in MiB. StartOS sets this for you at install and lowers it to 512 once the index is built, so you should not need to touch it; raise it to trade RAM for faster queries. Once you set it yourself, StartOS stops adjusting it.
- **Database Max Open Files** — raise this if the logs complain about too many open files.
- **Max Address History** — the most transactions Fulcrum will report for one address. An address busier than the limit comes back with an empty or partial history, balance and coin list instead of an error, so a wallet holding that address shows the funds as missing even though they are still on chain. Raise this if you use an address with a very long history; the limit is there to cap what a single request can cost in memory and time.

Saving Configure restarts Fulcrum, because it only reads its configuration at startup. Changing only the banner is the exception — it applies right away, with no restart. Leave the banner field empty to go back to Fulcrum's own default banner.

## Limitations

- Peer discovery and network announcement are disabled; this server does not advertise itself to the Electrum peer-to-peer network.
- The administrative RPC interface is not exposed.

## BLAKE2b hard fork

This build of Fulcrum understands the BLAKE2b proof-of-work hard fork's 164-byte block headers as well as the original 80-byte ones, so it keeps indexing across the activation height instead of stopping there. The chain's history is continuous: blocks mined before the activation keep their original 80-byte headers, and both forms sit in the same index. Until your node reaches that height, nothing changes for you.

Because the header format on disk changed, Fulcrum rebuilds its address index from scratch the first time it starts on this version. That is a local rebuild forced by the storage layout, not a re-download of a different chain, but it takes as long as the original sync did and wallets cannot query it until it finishes.

Note that your wallet needs its own support for the new header format. This server will hand it the post-activation headers correctly, but a wallet that has not been updated will reject them.
