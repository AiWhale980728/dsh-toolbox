# Plugin Preflight

Read-only MVP for reviewing a local DSH plugin directory before installation.

`plugin_preflight_scan` checks the package manifest, DSH Profile Bundle patch semantics, exported/packed files, license declaration, lifecycle scripts, dependency names, symlinks, file sizes, and capability signals in JavaScript/TypeScript. It returns structured findings, a deterministic packed-content SHA-256 fingerprint, a dependency SBOM, and Markdown. `plugin_preflight_report` writes private Markdown and self-contained HTML receipts.

Operators can configure policy with `allowedLicenses`, `allowedPackageScopes`, `blockedCapabilities`, and `maxRiskScore`. Policy violations are additional findings; they do not execute or quarantine the plugin.

The scanner does not execute package scripts, install dependencies, follow symlinks, contact registries, or change DSH configuration. The DSH tool defaults to the active session working directory; operators may configure explicit `allowedRoots` in the bundle config. A clean result is not a security guarantee; inspect source and dependency provenance before installing untrusted code.
