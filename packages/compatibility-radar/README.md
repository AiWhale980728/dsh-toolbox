# Compatibility Radar

Local-first MVP for discovering DSH plugins, checking them against a target runtime, storing compatibility snapshots in SQLite, and reporting upgrade risk.

## Tools

- `compatibility_check` — read local `package.json` files and build a matrix without saving it.
- `compatibility_snapshot` — save the same matrix under a label.
- `compatibility_list` — list prior snapshots.
- `compatibility_diff` — compare two snapshots, or the latest two when ids are omitted.
- `compatibility_discover` — find Profile Bundles under permitted workspace roots.
- `compatibility_infer_target` — infer exact target versions from a local manifest.
- `compatibility_report` — write private Markdown/HTML upgrade reports with remediation guidance.

The MVP understands the common exact, comparison, caret, tilde, wildcard, and `||` semver ranges used by current DSH plugins. It reads only explicitly supplied local package directories under the active session working directory (or operator-configured `allowedRoots`), does not install or upgrade anything, and performs no background network calls. Pre-release semver remains subtle: verify a release candidate with a real DSH install smoke test before publishing.

## License

Source-available under the PolyForm Noncommercial License 1.0.0. Commercial use is not permitted; see the packaged `LICENSE` file.
