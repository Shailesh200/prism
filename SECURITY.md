# Security Policy

Prism is a local-first repository analysis engine. It reads your source code,
runs on your machine, and — unless you grant a specific consent — talks to
nothing.

## Reporting a vulnerability

Please report privately rather than opening a public issue.

- **Where:** open a [GitHub security advisory](https://github.com/Shailesh200/prism/security/advisories/new) on this repository.
- **Include:** what you did, what happened, what you expected, and the Prism
  version (`prism --version`). A minimal reproduction helps more than anything
  else.
- **Please do not** include real source code, tokens, or `.prism/` contents from
  a private repository in the report. A synthetic reproduction is always
  preferable.

## What to expect

| Stage | Target |
|---|---|
| Acknowledgement | 3 working days |
| Initial assessment, with a severity and a plan | 10 working days |
| Fix or documented mitigation for high severity | 30 days |

Prism is maintained by a single owner, so these are honest targets rather than a
staffed rotation. If a report goes unanswered past acknowledgement, please ping
the advisory thread.

We will credit you in the release notes unless you ask us not to.

## Supported versions

Prism has not reached 1.0. Until it does, only the latest release on `main`
receives fixes. Once 1.0 ships, the most recent minor version will be supported
alongside the one before it.

## What counts as a vulnerability

In scope:

- Any network request Prism makes without a matching consent grant. This is the
  central promise of the product, and a violation is a security bug even if the
  destination is benign.
- Reading or writing outside the opened workspace, other than the documented
  cache location.
- A token, key, or credential appearing in `.prism/`, in a Core DTO, in a log,
  or in CLI/MCP output.
- Path traversal through a CLI argument, an MCP tool argument, or a webview
  message.
- Code execution triggered by *analysing* a repository — that is, by indexing,
  graphing, or reporting.

Out of scope, and why:

- **Prism runs the opened repository's own build script.** Bundle analysis and
  the frontend lab execute `npm run <script>` from the target repository's
  `package.json`. Running a project's build is the feature; there is no way to
  measure a bundle without producing one. This is gated behind the
  `run.local-build` consent and described in the
  [threat model](./plans/architecture/07_THREAT_MODEL.md). Opening an untrusted
  repository and granting that consent is equivalent to cloning it and typing
  `npm run build`.
- The security *report* is a local configuration checklist, not a scanner. It
  not finding a vulnerability in your code is not a Prism vulnerability. See
  [ADR-0022](./plans/adr/0022-testing-security-reports.md).
- Denial of service through a pathologically large repository.

## Hardening notes for operators

- `.prism/` holds derived analysis and your consent decisions. It is not
  encrypted, because it holds no secrets — but it does describe your codebase's
  structure, so treat it as you would build output. Prism offers to add it to
  `.gitignore`.
- Consent is per-workspace. A grant in one repository does not carry to another.
- The MCP server exposes read-only tools only. No consent-gated path is
  reachable from an agent, by design: an agent cannot give informed consent on
  your behalf.
