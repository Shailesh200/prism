# Privacy

Prism analyses your code on your machine. There is no Prism account, no Prism
server, and no Prism cloud.

## The short version

| Question | Answer |
|---|---|
| Does my source code leave my machine? | No. |
| Is there telemetry, analytics, or crash reporting? | A usage ping: the command or tool name, and whether it worked. No crash reports. No code, paths, or prompts. |
| Is there an account or licence check? | No. |
| Does Prism ever make a network request? | An update check, and the usage ping below. Analysis makes none. |
| Where is my data stored? | `~/.prism/` on your machine. Nothing is written into your checkout. |

## The one network request

Once a day at most, `prism-mcp` asks the npm registry
(`registry.npmjs.org`) for the latest published version of
`@repo-prism/mcp-server`. The request carries no repository data. The answer is
cached in `~/.prism/update.json`. If a newer version exists, Prism prints
"update available: run `prism upgrade`"; it never downloads, installs or
relaunches anything by itself. Local checkouts never check. Set
`PRISM_SKIP_SELF_UPDATE=1` to turn it off.

## Usage

When you run a `prism` command or an agent calls a Prism tool, Prism sends
one event to Pulse (`pulse.shaileshjha.in`). The event is the command or tool
name, whether it finished, failed, or reported findings, how many milliseconds
it took, and for `prism install` which host you named. A failure also sends
the `PRISM_*` code, never the message. Your repository, paths, prompts, and
source are not included. The request gives up after a fraction of a second and
a failure never changes the command. Set `PRISM_PULSE=0` to turn it off.
Tests and CI do not send.

## What is proven, not just claimed

`packages/core/src/no-network.integration.test.ts` runs the analysis surface —
index, graphs, DNA, blast radius, safe delete, explain, explore and test
impact — with `fetch` and `net.Socket.prototype.connect` replaced by traps that
record the attempt and throw. Any outbound call fails the build and names the
call site. The suite also verifies that the traps fire. The daemon has the same
test (`packages/daemon/src/no-network.test.ts`): it only ever connects to
loopback.

## What Prism stores, and where

| Path | Contents |
|---|---|
| `~/.prism/workspaces/<key>/cache/` | The SQLite index: file metadata, symbols and graph edges derived from your code |
| `~/.prism/workspaces/<key>/hooks/` | The hook snapshot and the session baseline |
| `~/.prism/workspaces/<key>/receipts/` | The last 20 stop receipts |
| `~/.prism/workspaces/<key>/memory.json` | Notes saved with `prism remember` |
| `~/.prism/envelope-ledger.jsonl` | Tool-call receipts: tool, counts, bytes. Never source or prompts |
| `~/.prism/events.jsonl` | What hooks, the daemon and the snapshot writer did, and why when they could not |
| `~/.prism/install.json` | What `prism install` wrote, so `prism uninstall` can remove exactly that |
| `~/.prism/update.json` | The cached update check |

No credential of any kind is written. Prism holds no third-party tokens.

## Decisions of record

- **No cloud sync, ever** (Q-009, resolved 2026-08-05).
- **No telemetry of code** (Q-010, resolved 2026-08-05). The owner later asked
  for anonymous usage counts of commands and tools. Those counts are the
  usage ping above. They do not include source, paths, or prompts.

See [the threat model](./plans/architecture/07_THREAT_MODEL.md) for what Prism
executes and why.
