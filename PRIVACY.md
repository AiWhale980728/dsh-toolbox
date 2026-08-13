# Privacy

DSH Toolbox is designed for a single user and local-first operation.

## Product Research Workbench Alpha

- Research projects, source text, evidence cards, analyses, and reports are stored in a local SQLite database.
- The default data directory is `~/.local/share/dsh-toolbox/product-research-workbench`. Set the plugin's `dataDir` configuration to choose another location.
- Telemetry is not collected. There are no analytics, accounts, hosted database, or background uploads.
- URL imports perform a direct unauthenticated `GET`. The plugin does not read or persist browser cookies, authorization headers, or passwords.
- Loopback, private-network, link-local, multicast, and common cloud-metadata destinations are blocked by default.
- URL responses and text imports are size-limited. Redirects and request duration are capped.
- The deterministic Alpha analysis runs locally. If a future model-provider integration is enabled, it must disclose exactly which content leaves the device and require explicit configuration.
- Generated reports can contain source quotations and URLs. Review them before sharing.

## Files that must not be committed

Never commit databases, WAL/SHM files, `.env` files, credentials, cookies, sessions, private reports, or raw exports. Repository ignore rules cover common names, but users remain responsible for reviewing staged changes.

## Deletion and retention

Deleting the configured data directory removes locally stored plugin data after DSH has stopped using the database. Secure deletion depends on the filesystem and backups. Project-level deletion/export tools are planned; until then, back up or remove the database deliberately.

Privacy or data-handling concerns may be reported using the private channel described in [SECURITY.md](SECURITY.md).
