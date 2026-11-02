<p align="center">
  <img src="icon.png" alt="Fulcrum Logo" width="21%">
</p>

# Fulcrum on StartOS

> Everything not listed in this document should behave the same as upstream
> Fulcrum. If a feature, setting, or behavior is not mentioned here, the
> upstream documentation is accurate and fully applicable — see the
> Documentation section of `instructions.md` for links.

[Fulcrum](https://github.com/cculianu/Fulcrum) is an Electrum server: it builds an address index over your Bitcoin node's chain so wallets can query balances and histories. On StartOS it authenticates to the node through a mounted cookie, requires the node to be configured a particular way, and sizes its index cache to the machine.

- **Upstream repo:** <https://github.com/privkeyio/Fulcrum> (a fork of <https://github.com/cculianu/Fulcrum>)
- **Wrapper repo:** <https://github.com/privkeyio/fulcrum-startos>

This package builds Fulcrum from a fork that follows Bitcoin's change of proof-of-work algorithm to BLAKE2b. See [BLAKE2b Proof of Work](#blake2b-proof-of-work).

---

## Table of Contents

- [Image and Container Runtime](#image-and-container-runtime)
- [Volume and Data Layout](#volume-and-data-layout)
- [File Models](#file-models)
- [Dependencies](#dependencies)
- [Network Access and Interfaces](#network-access-and-interfaces)
- [Installation and First-Run Flow](#installation-and-first-run-flow)
- [Actions](#actions)
- [Tasks](#tasks)
- [Health Checks](#health-checks)
- [Backups and Restore](#backups-and-restore)
- [BLAKE2b Proof of Work](#blake2b-proof-of-work)
- [Limitations and Differences](#limitations-and-differences)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)

---

## Image and Container Runtime

The image is built from source out of the `fulcrum` submodule at pack time, using that repo's `contrib/docker/Dockerfile`. One subcontainer runs the service.

| Property      | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Image         | built from `fulcrum/` submodule (privkeyio/Fulcrum, `master`)     |
| Architectures | x86_64, aarch64                                                   |
| Command       | `Fulcrum` against the config file, with log timestamps suppressed |
| Subcontainer  | `primary-sub` — the `primary` daemon, and the one to `attach` to  |

Log timestamps are turned off because StartOS adds its own; leaving both produces two on every line.

## Volume and Data Layout

One volume, plus a read-only view of the Bitcoin node's.

| Volume | Mount Point | Purpose                                                                   |
| ------ | ----------- | ------------------------------------------------------------------------- |
| `main` | `/data`     | `fulcrum.conf`, `banner.txt`, `store.json`, and the RocksDB address index |

Bitcoin's data directory is mounted **read-only** at `/mnt/bitcoind`, which is how Fulcrum reads the RPC cookie — no credential is stored here.

A pending Reindex is an empty `reindex.request` file beside them. `main` removes it before Fulcrum starts, once the index is gone — see [Actions](#actions).

The address index is the large item: it is rebuilt from the chain rather than backed up, as described under [Backups and Restore](#backups-and-restore).

## File Models

Three models. One is Fulcrum's configuration, one is the banner it serves to clients, and one is StartOS-side state.

| File           | Format | Modelled                  | Written by                                            |
| -------------- | ------ | ------------------------- | ----------------------------------------------------- |
| `fulcrum.conf` | INI    | Yes — `FileHelper.ini`    | Install, every init, `main`, and the Configure action |
| `banner.txt`   | text   | Yes — `FileHelper.string` | The Configure action                                  |
| `store.json`   | JSON   | Yes — `FileHelper.json`   | Every init, and `main`                                |

### fulcrum.conf

**Enforced** — rewritten to a fixed value whenever the package writes the file: `datadir`, `tcp`, `rpccookie`, `banner`, `peering`, `announce`, and empty `rpcuser` / `rpcpassword`. The credential pair is pinned empty because authentication is the mounted cookie.

Two of those are overrides rather than wiring: **`peering` and `announce` are both forced off**, where Fulcrum would otherwise participate in the public Electrum server network and advertise itself. A server behind StartOS is not intended to be a public one.

**Derived:** `bitcoind` is the node's RPC address, written by `main` from the node's own binding on every start. When Bitcoin is absent the key is omitted rather than filled with a dead address.

**Yours, through the Configure action:** the RPC timeout and client count, worker threads, `db_max_open_files`, and `max_history`.

**Seeded, then reclaimed once:** `db_mem` is set at install to a quarter of system RAM, capped — a large cache makes the initial index build much faster. When the index finishes, the package lowers it, **but only if the value is still exactly what it seeded.** A value you chose in Configure is left alone, with two exceptions after a reindex, because the package decides by value rather than by who set it: a value equal to the lowered one is put back to the seeded value for the rebuild, and a value equal to the seeded one is lowered when the rebuild finishes, as after the first build.

Fulcrum reads this file only at startup, so every change to it restarts the daemon.

### banner.txt

The text served to connecting Electrum clients. The Configure action writes it, and clearing the field **deletes the file** rather than writing it empty — Fulcrum falls back to its built-in banner when the file is absent, and an empty file would serve an empty banner.

### store.json

`syncNotified` alone: whether the one-time sync-complete notification has been sent.

## Dependencies

One, and it is required — along with a particular configuration of it.

| Dependency | Kind      | Health check | Mount                      | Why                                     |
| ---------- | --------- | ------------ | -------------------------- | --------------------------------------- |
| Bitcoin    | `running` | `bitcoind`   | `/mnt/bitcoind`, read-only | Chain data over RPC, and the RPC cookie |

**Only the Knots flavor satisfies it**, from `#knots:29.4.1:4` on. Knots schedules the change of proof of work, so only Knots serves the extended headers this build indexes. A standard Bitcoin node does not satisfy the dependency.

**Fulcrum also needs Bitcoin configured a specific way, and asks for it as a task on Bitcoin's own page** — pruning off, `txindex` on, and ZeroMQ on. See [Tasks](#tasks).

The RPC address is resolved from Bitcoin's own binding over the service bridge, so a Bitcoin update does not move it and nothing is configured by hand.

## Network Access and Interfaces

One interface, and what it publishes is worth reading closely.

| Interface      | Id     | Type | Port                   | Description                    |
| -------------- | ------ | ---- | ---------------------- | ------------------------------ |
| Electrum (SSL) | `main` | api  | 50002 TLS, 50001 plain | The Electrum protocol endpoint |

StartOS terminates TLS at the edge and forwards plaintext to Fulcrum, so the TLS address is the one to give a wallet. The plaintext port is still allocated, but no LAN or WAN gateway forwards it: it is reachable over the local service bridge — which is how a dependent on this box connects — and, indirectly, over a Tor address added with its SSL toggle off, since the Tor service points an onion at whichever bridge address that toggle selects. Every LAN, `.local` and domain address is the TLS one. Clients that accept or pin an unrecognised certificate connect as-is; the Electrum desktop wallet rejects the device's CA chain on every address and needs the client-side step documented at <https://docs.start9.com/bitcoin-guides/connecting-wallets>.

A server carried over from StartOS 0.3.5 also had an `electrum` host from the old package. Updating to `#blake:2.1.4:0` or later, or switching to it from the standard build, retires it; its addresses, including any `.onion`, are not moved to `main`.

The interface overrides its scheme to `ssl` or `tcp` so each address renders as something a wallet can consume; left alone, both would appear as a bare host and port with nothing marking which is which.

## Installation and First-Run Flow

Install writes the config with `db_mem` sized to the machine. Start Fulcrum after installation to begin indexing. No credential is generated and no local task is raised — but the service cannot do its job until two things are true.

1. **Bitcoin must be configured for it.** Pruning off, `txindex` on, ZeroMQ on. This is raised as a `critical` task on Bitcoin, not here.
2. **The index has to be built.** Fulcrum reads the chain and builds its own address index, which takes hours and is the bulk of first-run time. The Electrum port does not open until it finishes, so the service legitimately looks unready throughout.

When the index completes, a Sync Complete notification is posted; if `db_mem` is still the seeded value, the notification says the service is restarting once to lower it.

## Actions

Two actions: the settings, and the recovery for a corrupted index.

### Configure

Sets the banner and Fulcrum's performance parameters.

- **What it changes:** `banner.txt`, and the tunable keys in `fulcrum.conf`.
- **Cost:** seconds, then a restart — Fulcrum only reads its config at startup.
- **Repeat safety:** idempotent; the form is pre-filled from the current files.
- **Worth knowing about `db_mem`:** setting it here takes it out of the package's hands. The post-sync reduction only applies to the value install seeded, so a value you choose persists — including through the index build, where a large one is a real speed-up and a small one is a real slow-down. The exceptions come with a reindex, which cannot tell two values from the package's own: one equal to the lowered value is raised for the rebuild, and one equal to the seeded value is lowered when the rebuild finishes.
- **Worth knowing about `max_history`:** an address with more transactions than this returns an empty or partial history rather than an error, so a wallet holding such an address shows the funds as missing. Raise it if that happens.

### Reindex

Deletes the address index so Fulcrum rebuilds it from Bitcoin — the in-place replacement for uninstalling and reinstalling, which is what Fulcrum's own corruption errors ("delete the datadir and resynch") otherwise leave the user with.

- **When to run it:** Fulcrum keeps exiting and its logs report a corrupted database — a RocksDB `Corruption:` error, or Fulcrum's own message to delete the datadir and resynch — or say it was killed in the middle of committing a block. Not while Bitcoin is still syncing: Fulcrum waits silently at Bitcoin's tip, which looks like a fault and is not one. A RocksDB error that clears on a restart does not need it either. Input/output errors point at the drive: a rebuild on failing storage fails the same way.
- **What it changes:** creates an empty `reindex.request` in the volume root and restarts Fulcrum if it is running. On the next start, before anything else, `main` deletes `fulc2_db` and `latch`, puts `db_mem` back to the seeded value if it is still exactly the lowered one, clears `syncNotified`, and removes the marker last, so the rebuild runs, is reported, and is notified as a first run, and an interrupted delete repeats. `fulcrum.conf`, `banner.txt` and `store.json` are kept.
- **Cost:** as long as the first build took — hours to days — with the Electrum port closed throughout, so dependents and wallets have no server.
- **Repeat safety:** a second run before the next start changes nothing; a run after the rebuild has started starts it over.
- **What happens next:** if Fulcrum is stopped, nothing happens until it is started. Progress shows in Sync Progress, as on a first run.

## Tasks

One task, and it is raised on Bitcoin rather than here.

| Task           | Raised on | Severity   | Raised when                                        | Cleared when                                          |
| -------------- | --------- | ---------- | -------------------------------------------------- | ----------------------------------------------------- |
| Auto-Configure | Bitcoin   | `critical` | Bitcoin has pruning on, or `txindex` or ZeroMQ off | Bitcoin's config matches; it returns if changed again |

`critical` on Bitcoin, because Fulcrum cannot build an index against a pruned node and cannot follow the chain without the other two. The task carries the exact settings, so accepting it applies them. It re-raises whenever they drift, rather than being a one-time prompt.

Note where the prompt appears: on **Bitcoin's** page, with nothing there explaining that Fulcrum asked for it.

## Health Checks

Two checks, and they differ in what they mean during the index build.

| Check                           | Method                                                          |
| ------------------------------- | --------------------------------------------------------------- |
| `primary` "Electrum (SSL)"      | The Electrum port is listening; reports `loading` while syncing |
| `sync-progress` "Sync Progress" | Fulcrum's own progress output, read from its logs               |

**Neither failing during the initial index build is a fault.** The Electrum port genuinely does not open until the index is complete, so `primary` reports `loading` rather than failure for as long as Fulcrum is logging progress. `sync-progress` shows Fulcrum's latest `<Controller>` line, so it is the one to read for how far along the build is; it reports success once the port opens.

A `primary` failure with no sync progress being logged is the real fault case — the daemon is not running. A Fulcrum that cannot reach Bitcoin keeps running and logs `<Controller> Waiting for bitcoind...`, so during the index build that is what Sync Progress shows.

**A Bitcoin bootstrapped from a UTXO snapshot cannot serve the blocks beneath the snapshot until its background validation downloads them.** Fulcrum indexes from genesis, so it requests one, gets `Block not available (not fully downloaded)` (`Block not found on disk` on Bitcoin Core 28), abandons that sync attempt, and retries from its own tip every 2 seconds, following Bitcoin's download up. While such an error has been logged in the last 30 seconds, Sync Progress reports **Waiting for Bitcoin to provide historical blocks** instead of the failure lines. The same message on a node that never loaded a snapshot means Bitcoin's block files are damaged; its Reindex Blockchain action repairs them.

## Backups and Restore

The `main` volume is copied wholesale — `sdk.Backups.ofVolumes('main')` — with the address index excluded.

- **Excluded:** the RocksDB index directories and the lock file. These are derived from the chain and can be very large.
- **Included:** `fulcrum.conf`, `banner.txt`, and `store.json`.

**A restore therefore rebuilds the index from scratch**, which takes as long as the original build did and needs Bitcoin present and synced first. What comes back is the configuration, not the work.

## BLAKE2b Proof of Work

Stock Fulcrum assumes every block header is 80 bytes and hashes it with SHA256d. The proof of work changes at an activation height: from that block on, headers are 164 bytes and hashed with BLAKE2b, signaled by the top bit of the version field.

This is one chain with continuous history, not a second chain. Every block below the activation height keeps its original 80-byte SHA256d header permanently, so both header forms coexist in the same index and each must be hashed with its own algorithm. Stock Fulcrum stops at the activation block rather than serving wrong data.

This build reads both forms, hashes each with the right algorithm, and serves them unchanged over the Electrum protocol. Below the activation height there is no behavioral difference.

Two consequences worth knowing:

- **Switching from the standard build keeps the existing index, with no resync.** The headers table keeps the same record size and magic, and only the 84-byte tail of an extended header is stored separately. An index written by an early release of this package, which stored headers in a form neither build reads, is converted in place on the first start, which takes seconds. If that conversion cannot complete, the index is rebuilt from scratch, which takes as long as the original sync did.
- **Wallets need their own support.** `blockchain.block.header` and `blockchain.block.headers` return whatever size the header actually is. A wallet that splits the concatenated `block.headers` blob at a fixed 80-byte stride, or that checks proof of work as SHA256d, will not follow the chain past the activation height no matter what this server returns.

## Limitations and Differences

1. **Peering and announcement are disabled.** Fulcrum will not join the public Electrum server network or advertise itself.
2. **The index is not backed up**, and a restore rebuilds it.
3. **Bitcoin must run unpruned with `txindex` and ZeroMQ enabled**, which is a change to Bitcoin's configuration, requested as a task on that service.
4. **`db_mem` is managed until you set it**, after which it is yours — including the post-sync reduction, which no longer applies. A reindex makes two exceptions, because it cannot tell them from the package's own values: a value equal to the lowered one is raised for the rebuild, and one equal to the seeded one is lowered when the rebuild finishes.
5. **The plaintext Electrum port gets no LAN or WAN forward.** Every LAN, `.local` and domain address is the TLS one; a Tor address added with SSL off is the one way to reach the plaintext port from elsewhere.
6. **No riscv64 build.** x86_64 and aarch64 only.

---

## Quick Reference for AI Consumers

```yaml
package_id: fulcrum
image: built from the fulcrum submodule (privkeyio/Fulcrum)
architectures:
  - x86_64
  - aarch64
subcontainers:
  - primary-sub
volumes:
  main: /data
file_models:
  - /data/fulcrum.conf
  - /data/banner.txt
  - /data/store.json
startos_managed_env_vars: []
dependencies:
  - bitcoind # required; mounted read-only at /mnt/bitcoind
interfaces:
  main: { type: api, port: 50002 } # TLS at the edge; 50001 plaintext is bridge-only
actions:
  - configure
  - reindex # deletes fulc2_db and latch on the next start
tasks:
  - { action: autoconfig, severity: critical } # on bitcoind: unpruned, txindex, ZMQ
health_checks:
  - primary # displayed "Electrum (SSL)"
  - sync-progress # displayed "Sync Progress"
```
