# Plugin Preflight

Read-only experimental Alpha for reviewing a local DSH plugin directory before installation.

`plugin_preflight_scan` checks the package manifest, DSH Profile Bundle patch, exported/packed files, license declaration, lifecycle scripts, dependency names, symlinks, file sizes, and capability signals in JavaScript/TypeScript. It returns structured findings plus Markdown.

The scanner does not execute package scripts, install dependencies, follow symlinks, contact registries, or change DSH configuration. The DSH tool defaults to the active session working directory; operators may configure explicit `allowedRoots` in the bundle config. A clean result is not a security guarantee; inspect source and dependency provenance before installing untrusted code.
