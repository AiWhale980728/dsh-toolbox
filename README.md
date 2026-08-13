# DSH Toolbox

Four local-first, independently installable plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

> **Experimental MVP.** DeepSeek Harness is in Developer Preview, so APIs and Profile Bundle compatibility may change between release candidates. This independent project is not affiliated with or endorsed by DeepSeek.

## Plugins

| Plugin | Daily-use workflow | Tools |
| --- | --- | ---: |
| [`@dsh-toolbox/product-research-workbench`](packages/product-research-workbench) | Import URL/text evidence, curate findings, score opportunities, back up projects, and create Markdown/HTML reports. | 12 |
| [`@dsh-toolbox/context-switchboard`](packages/context-switchboard) | Route work into bounded profiles, activate native runtime context, inspect receipts, and roll back. | 10 |
| [`@dsh-toolbox/plugin-preflight`](packages/plugin-preflight) | Review a local bundle's package semantics, capabilities, policy, SBOM, and fingerprint before installation. | 2 |
| [`@dsh-toolbox/compatibility-radar`](packages/compatibility-radar) | Discover bundles, compare them with a target runtime, save/diff snapshots, and create upgrade reports. | 7 |

All data and reports stay on the local machine by default. There are no accounts, hosted services, analytics, telemetry, background registry checks, or automatic upgrades.

## Install

These are DSH Profile Bundles. The validated installation path is to pack the checkout into tarballs, then add those tarballs to a profile:

```sh
mkdir -p dist
npm pack --workspace @dsh-toolbox/product-research-workbench --pack-destination dist
npm pack --workspace @dsh-toolbox/context-switchboard --pack-destination dist
npm pack --workspace @dsh-toolbox/plugin-preflight --pack-destination dist
npm pack --workspace @dsh-toolbox/compatibility-radar --pack-destination dist
dsh plugin --profile toolbox add ./dist/dsh-toolbox-product-research-workbench-0.2.0.tgz
dsh plugin --profile toolbox add ./dist/dsh-toolbox-context-switchboard-0.2.0.tgz
dsh plugin --profile toolbox add ./dist/dsh-toolbox-plugin-preflight-0.2.0.tgz
dsh plugin --profile toolbox add ./dist/dsh-toolbox-compatibility-radar-0.2.0.tgz
dsh --profile toolbox --dump-config
```

Packing does not execute plugin code or require repository dependencies to be installed. Direct checkout-path installation also works after `npm install` at the repository root has populated the workspace dependencies, but tarballs match npm packaging semantics and are the tested portable flow.

The MVP targets:

- `@deepseek-ai/dsh@0.1.0-rc.6`
- `@deepseek-ai/dsh-tools 0.1.0-rc.6`
- `@deepseek-ai/cordis ^4.0.1`
- Node.js `^22.19.0 || >=24.0.0` (`node:sqlite` is built in)

Each package pins the small DSH tool-definition runtime needed for reliable out-of-tree installation; pnpm deduplicates it across the profile. There are no install lifecycle scripts, so Git installation requires no build step or build authorization.

## Local development

```sh
npm run check
npm run pack:check
```

`npm run check` validates all four bundle manifests and runs the complete test suite. The release gate also includes package dry-runs, static Preflight scans, a current/breaking Compatibility Radar matrix, and installation into an isolated DSH home.

## Publication and privacy

Original code is licensed under the [MIT License](LICENSE). Review [PRIVACY.md](PRIVACY.md), [SECURITY.md](SECURITY.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) before sharing generated artifacts or adding integrations.

Runtime databases, reports, exports, sessions, environment files, and cookies are excluded by `.gitignore`. Still inspect staged changes: research exports and reports may contain source text, quotations, URLs, local paths, or project names.

Version `0.2.0` is the daily-usable MVP milestone and has passed an isolated install/config-load/tool-execution smoke test against the pinned DSH RC. npm publication and a GitHub Release remain intentionally deferred pending user feedback and an explicit release decision; source remains available from this repository.
