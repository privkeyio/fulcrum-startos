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

This package builds Fulcrum from a fork carrying BLAKE2b proof-of-work hard fork support. See [BLAKE2b Hard Fork Support](#blake2b-hard-fork-support).

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
- [BLAKE2b Hard Fork Support](#blake2b-hard-fork-support)
- [Limitations and Differences](#limitations-and-differences)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)

---

## Image and Container Runtime

The image is built from source out of the `fulcrum` submodule at pack time, using that repo's `contrib/docker/Dockerfile`. One subcontainer runs the service.

| Property      | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Image         | built from `fulcrum/` submodule (privkeyio/Fulcrum, `blake2b-pow`) |
| Architectures | x86_64                                                            |
| Command       | `Fulcrum` against the config file, with log timestamps suppressed |
| Subcontainer  | `primary-sub` — the `primary` daemon, and the one to `attach` to  |

Log timestamps are turned off because StartOS adds its own; leaving both produces two on every line.

## Volume and Data Layout

One volume, plus a read-only view of the Bitcoin node's.

| Volume | Mount Point | Purpose                                                                   |
| ------ | ----------- | ------------------------------------------------------------------------- |
| `main` | `/data`     | `fulcrum.conf`, `banner.txt`, `store.json`, and the RocksDB address index |

Bitcoin's data directory is mounted **read-only** at `/mnt/bitcoind`, which is how Fulcrum reads the RPC cookie — no credential is stored here.

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

**Seeded, then reclaimed once:** `db_mem` is set at install to a quarter of system RAM, capped — a large cache makes the initial index build much faster. When the index finishes, the package lowers it, **but only if the value is still exactly what it seeded.** A value you chose in Configure is left alone.

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

**Fulcrum also needs Bitcoin configured a specific way, and asks for it as a task on Bitcoin's own page** — pruning off, `txindex` on, and ZeroMQ on. See [Tasks](#tasks).

The RPC address is resolved from Bitcoin's own binding over the service bridge, so a Bitcoin update does not move it and nothing is configured by hand.

## Network Access and Interfaces

One interface, and what it publishes is worth reading closely.

| Interface      | Id     | Type | Port                   | Description                    |
| -------------- | ------ | ---- | ---------------------- | ------------------------------ |
| Electrum (SSL) | `main` | api  | 50002 TLS, 50001 plain | The Electrum protocol endpoint |

StartOS terminates TLS at the edge and forwards plaintext to Fulcrum, so the TLS address is the one to give a wallet. The plaintext port is still allocated, but it is reachable only over the local service bridge — which is how a dependent on this box connects — and from nowhere else. Off the box, the TLS address is all there is. Clients that accept or pin an unrecognised certificate connect as-is; the Electrum desktop wallet rejects the device's CA chain on every address and needs the client-side step documented at <https://docs.start9.com/bitcoin-guides/connecting-wallets>.

The interface overrides its scheme to `ssl` or `tcp` so each address renders as something a wallet can consume; left alone, both would appear as a bare host and port with nothing marking which is which.

## Installation and First-Run Flow

Install writes the config with `db_mem` sized to the machine and starts the daemon. No credential is generated and no local task is raised — but the service cannot do its job until two things are true.

1. **Bitcoin must be configured for it.** Pruning off, `txindex` on, ZeroMQ on. This is raised as a `critical` task on Bitcoin, not here.
2. **The index has to be built.** Fulcrum reads the chain and builds its own address index, which takes hours and is the bulk of first-run time. The Electrum port does not open until it finishes, so the service legitimately looks unready throughout.

When the index completes, a Sync Complete notification is posted; if `db_mem` is still the seeded value, the notification says the service is restarting once to lower it.

## Actions

One action.

### Configure

Sets the banner and Fulcrum's performance parameters.

- **What it changes:** `banner.txt`, and the tunable keys in `fulcrum.conf`.
- **Cost:** seconds, then a restart — Fulcrum only reads its config at startup.
- **Repeat safety:** idempotent; the form is pre-filled from the current files.
- **Worth knowing about `db_mem`:** setting it here takes it out of the package's hands. The post-sync reduction only applies to the value install seeded, so a value you choose persists — including through the index build, where a large one is a real speed-up and a small one is a real slow-down.
- **Worth knowing about `max_history`:** an address with more transactions than this returns an empty or partial history rather than an error, so a wallet holding such an address shows the funds as missing. Raise it if that happens.

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

**Neither failing during the initial index build is a fault.** The Electrum port genuinely does not open until the index is complete, so `primary` reports `loading` rather than failure for as long as Fulcrum is logging progress. `sync-progress` surfaces Fulcrum's own progress line, so it is the one to read for how far along the build is; it reports success once the port opens.

A `primary` failure with no sync progress being logged is the real fault case — the daemon is not running or not reaching Bitcoin.

## Backups and Restore

The `main` volume is copied wholesale — `sdk.Backups.ofVolumes('main')` — with the address index excluded.

- **Excluded:** the RocksDB index directories and the lock file. These are derived from the chain and can be very large.
- **Included:** `fulcrum.conf`, `banner.txt`, and `store.json`.

**A restore therefore rebuilds the index from scratch**, which takes as long as the original build did and needs Bitcoin present and synced first. What comes back is the configuration, not the work.

## BLAKE2b Hard Fork Support

Stock Fulcrum assumes every block header is 80 bytes and hashes it with SHA256d. The BLAKE2b hard fork changes the proof of work at an activation height: from that block on, headers are 164 bytes and hashed with BLAKE2b, signalled by the top bit of the version field.

This is one chain with continuous history, not a second chain. Every block below the activation height keeps its original 80-byte SHA256d header permanently, so both header forms coexist in the same index and each must be hashed with its own algorithm. Stock Fulcrum stops at the activation block rather than serving wrong data.

This build reads both forms, hashes each with the right algorithm, and serves them unchanged over the Electrum protocol. Below the activation height there is no behavioural difference.

Two consequences worth knowing:

- **The index is rebuilt from scratch on this version.** Header records grew from 80 to 164 bytes, so the on-disk format changed and the header table's magic was bumped. An index written by an earlier version fails to open with an explicit error instead of being misread. This is a local index rebuild forced by the storage format, not a re-download of a different chain, but it still costs a full resync on first start.
- **Wallets need their own support.** `blockchain.block.header` and `blockchain.block.headers` return whatever size the header actually is. A wallet that splits the concatenated `block.headers` blob at a fixed 80-byte stride, or that checks proof of work as SHA256d, will not follow the chain past the activation height no matter what this server returns.

## Limitations and Differences

1. **Peering and announcement are disabled.** Fulcrum will not join the public Electrum server network or advertise itself.
2. **The index is not backed up**, and a restore rebuilds it.
3. **Bitcoin must run unpruned with `txindex` and ZeroMQ enabled**, which is a change to Bitcoin's configuration, requested as a task on that service.
4. **`db_mem` is managed until you set it**, after which it is yours — including the post-sync reduction, which no longer applies.
5. **The plaintext Electrum port is bridge-only.** Off the box, only the TLS address is reachable.
6. **No riscv64 build.** x86_64 and aarch64 only.

---

## Quick Reference for AI Consumers

```yaml
package_id: fulcrum
image: cculianu/fulcrum
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
tasks:
  - { action: autoconfig, severity: critical } # on bitcoind: unpruned, txindex, ZMQ
health_checks:
  - primary # displayed "Electrum (SSL)"
  - sync-progress # displayed "Sync Progress"
```
