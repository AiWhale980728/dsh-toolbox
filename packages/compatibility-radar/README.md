# Compatibility Radar

Local-first experimental Alpha for checking several local DSH plugins against a target runtime, storing compatibility snapshots in SQLite, and diffing upgrade risk.

## Tools

- `compatibility_check` — read local `package.json` files and build a matrix without saving it.
- `compatibility_snapshot` — save the same matrix under a label.
- `compatibility_list` — list prior snapshots.
- `compatibility_diff` — compare two snapshots, or the latest two when ids are omitted.

The Alpha understands the common exact, comparison, caret, tilde, wildcard, and `||` semver ranges used by current DSH plugins. It reads only explicitly supplied local package directories under the active session working directory (or operator-configured `allowedRoots`), does not install or upgrade anything, and performs no background network calls. Pre-release semver remains subtle: verify a release candidate with a real DSH install smoke test before publishing.
