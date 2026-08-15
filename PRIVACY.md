# Privacy

DSH Toolbox is designed for one user and local-first operation. It has no accounts, hosted database, analytics, telemetry, or background uploads.

## Product Research Workbench

- Projects, raw source text, evidence, analyses, and report paths are stored in local SQLite under `~/.local/share/dsh-toolbox/product-research-workbench` by default.
- URL import sends a direct unauthenticated `GET` to the selected public URL. It does not read or persist browser cookies, authorization headers, or passwords.
- Loopback, private-network, link-local, multicast, documentation, carrier-grade NAT, and common cloud-metadata destinations are blocked by default. Redirects, response size, and request duration are capped.
- Extraction and analysis run locally. No research content is sent to a model provider by this plugin.
- `research_export` omits raw source bodies by default. Setting `includeSourceContent=true` produces a restorable JSON backup containing raw text; it should be protected as private research data.
- `research_project_delete` removes the project's SQLite rows and report directory after exact name confirmation. It intentionally leaves separately created JSON exports so backups are not silently destroyed. `research_source_delete` removes the source/evidence and clears stale derived analysis.
- Reports and exports may contain quotations, URLs, copyrighted text, and personal information. Review them before sharing.

## Context Switchboard

- Profiles, routing rules, resource-pointer labels, instructions, and activation receipts are stored in local SQLite under `~/.local/share/dsh-toolbox/context-switchboard` by default.
- An activated packet is contributed to DSH through the native runtime-context registry. DSH may materialize that packet as a durable user-role context snapshot in the selected session history.
- Profile exports include instructions and resource-pointer strings. Resource pointers are labels only; this plugin never opens them automatically.
- Rollback preserves receipts for auditability. Removing the data directory is required to erase that local history.

## Plugin Preflight

- Preflight reads only the explicitly requested directory inside the session working directory or operator-configured `allowedRoots`.
- It does not execute scripts, install dependencies, follow symlinks, contact registries, or upload scan results.
- Reports default to `~/.local/share/dsh-toolbox/plugin-preflight/reports` with private file permissions. They may reveal package names, local paths, capabilities, and dependency versions.

## Compatibility Radar

- Radar reads local bundle `package.json` files under permitted roots and stores snapshots under `~/.local/share/dsh-toolbox/compatibility-radar` by default.
- Discovery skips symlinks, `node_modules`, `.git`, coverage, and build output. It does not query package registries in the background or install/upgrade software.
- Reports may reveal local paths, package names, and versions.

## DSH Switchboard

- Switchboard reads profile manifests and user patch metadata under the selected `$DSH_HOME`. It does not upload profile data or query registries in the background.
- Transaction receipts, backups, Compatibility Radar data, and reports default to `~/.local/share/dsh-toolbox/dsh-switchboard` with user-only permissions where supported.
- Backups can contain a complete profile `package.json` and `cordis.patch.yml`. Treat them as private configuration even though Switchboard reports do not reproduce patch content.
- `inspect`, Preflight, audit, and report output can reveal package names, versions, profile structure, fingerprints, diagnostics, and absolute local paths. Sanitize output before sharing it or attaching it to an issue.
- The runtime safety gate starts `dsh --profile <name> --dump-config` without a shell. The composed config is counted but not stored in the receipt; DSH diagnostics may still include local paths or configuration details.
- Switchboard does not remove transaction history or backups automatically. Review and delete its data directory according to your retention needs after DSH is stopped.

## DSH Switchboard GUI

- The standalone GUI listens on `127.0.0.1` by default and refuses a non-loopback bind address. It has no remote account, hosted backend, analytics, telemetry, or background network request.
- Browser API responses expose Profile names, Bundle package names and versions, health diagnostics, transaction summaries, and the configured local DSH/data paths. They do not expose Profile manifest bodies, Cordis patch content, backup file content, or API credential values.
- A random session token is created in memory when the GUI server starts. It is returned to the same-origin page and required for every write request; it is not written to disk.
- The GUI uses the same local Switchboard receipts and backups described above. Closing the browser does not erase them, and pending plans remain only in server memory until that process exits.

## Files that must not be committed

Never commit SQLite databases or WAL/SHM files, `.env` files, credentials, cookies, sessions, private reports, or research exports. Repository ignore rules cover common names, but users remain responsible for inspecting staged changes.

## Deletion and retention

Stopping DSH and the GUI, then deleting a plugin's configured data directory, removes its local database and reports. Stop Switchboard operations before deleting its receipt/backup directory. Secure deletion depends on the filesystem, snapshots, backups, synchronization software, and retained DSH session history. JSON exports, Switchboard backups, and DSH runtime-context session snapshots are separate copies and must be managed separately.

Report data-handling concerns through the private channel described in [SECURITY.md](SECURITY.md).
