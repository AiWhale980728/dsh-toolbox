# Security Policy

## Supported versions

Only the latest tagged Alpha is supported. Until a first tag exists, the `main` branch is development software and receives best-effort fixes.

## Reporting a vulnerability

Do not open a public issue containing exploit details, secrets, private research data, or personal information. Use GitHub's private vulnerability reporting for this repository when available. If it is unavailable, open a minimal issue asking the maintainer to enable a private contact channel; do not include sensitive details.

## Security boundaries

- Plugins must not bypass DSH sandbox, approval, or permission controls.
- URL import is unauthenticated and blocks non-public network destinations. It is not a browser crawler and does not bypass CAPTCHAs, paywalls, robots controls, or anti-bot systems.
- Imported content is untrusted data. It must never be interpreted as executable instructions by the storage and reporting layers.
- HTML reports escape imported content and do not load remote scripts.
- Database paths and exported report paths must remain inside the configured plugin data directory.
- Plugin Preflight is heuristic static analysis, not a sandbox or security guarantee; transitive, obfuscated, native, and runtime behavior may be missed.
- Compatibility results are advisory. Pre-release semver and undeclared peer ranges require a real installation test.
- Dependency additions require license and maintenance review.

## Release checklist

Before a public release, run tests, workspace validation, package dry-runs, secret scanning, and an install smoke test against the documented DSH release candidate.
