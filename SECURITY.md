# Security Policy

## Supported versions

The latest `0.2.x` MVP source on `main` receives best-effort security fixes. No npm package or GitHub Release has been published; those distribution channels are therefore not currently supported.

## Reporting a vulnerability

Do not open a public issue containing exploit details, secrets, private research data, or personal information. Use GitHub private vulnerability reporting for this repository when available. If it is unavailable, open a minimal issue asking the maintainer to enable a private contact channel; include no sensitive details.

## Security boundaries

- The plugins do not bypass DSH sandbox, approval, scope, or permission controls.
- Context Switchboard uses native runtime context and does not replace the deployment persona, sandbox policy, or approval policy. Imported profile documents are untrusted configuration and should be reviewed before activation.
- URL import is unauthenticated and blocks non-public destinations. It is not a browser crawler and does not bypass CAPTCHAs, paywalls, robots controls, or anti-bot systems.
- Imported content is untrusted data. Storage and report layers never interpret it as executable instructions.
- HTML reports escape imported or local metadata and load no remote scripts. Research report links are emitted only for `http(s)` locators.
- Database, export, and report paths remain under each configured data directory. Preflight/Radar reads remain under the session cwd or operator-configured `allowedRoots`, after real-path resolution.
- Product Research imports require explicit full-content exports, cap size/count, verify SHA-256 content hashes when present, and remove a newly created project if restoration fails.
- Plugin Preflight is heuristic static analysis, not a sandbox or security guarantee. It may miss transitive, obfuscated, native, generated, or runtime behavior. Its SBOM is manifest-derived, not a resolved dependency graph.
- Compatibility results are advisory. Pre-release semver and unsupported ranges require a real installation test.
- Dependency additions require license, provenance, and maintenance review. Packages intentionally have no install lifecycle scripts.

## Release checklist

Before a source milestone or package release:

1. Run `npm run check` on supported Node versions.
2. Run `npm run pack:check` and inspect packed file lists.
3. Run Preflight across all four bundles and investigate blocking findings.
4. Run current and deliberate-breaking Compatibility Radar matrices.
5. Run secret scanning and inspect `git diff --check` plus staged files.
6. Install all four packed bundles into an isolated `DSH_HOME` with the documented DSH RC; verify `--dump-config`, all 31 tool registrations, native runtime context, and representative tool calls.

Do not publish npm packages or create a GitHub Release when the pinned DSH installation smoke test has not passed.
