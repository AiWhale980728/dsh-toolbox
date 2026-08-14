# DSH Toolbox

Four local-first, independently installable plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): product research, context routing, plugin preflight, and compatibility monitoring.

> **Experimental MVP · Noncommercial use only.** DeepSeek Harness is in Developer Preview, so APIs and Profile Bundle compatibility may change between release candidates. DSH Toolbox is independent and is not affiliated with or endorsed by DeepSeek.

## What is included

| Plugin | Daily-use workflow | Tools |
| --- | --- | ---: |
| [`@dsh-toolbox/product-research-workbench`](packages/product-research-workbench) | Import URL/text evidence, curate findings, score opportunities, back up projects, and create Markdown/HTML reports. | 12 |
| [`@dsh-toolbox/context-switchboard`](packages/context-switchboard) | Route work into bounded profiles, activate native runtime context, inspect receipts, and roll back. | 10 |
| [`@dsh-toolbox/plugin-preflight`](packages/plugin-preflight) | Review a local bundle's package semantics, capabilities, policy, SBOM, and fingerprint before installation. | 2 |
| [`@dsh-toolbox/compatibility-radar`](packages/compatibility-radar) | Discover bundles, compare them with a target runtime, save/diff snapshots, and create upgrade reports. | 7 |

All data and reports stay on the local machine by default. There are no accounts, hosted services, analytics, telemetry, background registry checks, or automatic upgrades.

## Requirements

- Node.js `^22.19.0 || >=24.0.0` (`node:sqlite` is built in)
- npm, for packing the local bundles
- `@deepseek-ai/dsh@0.1.0-rc.6`
- A local DSH profile you are allowed to modify

The tested runtime combination is:

| Component | Tested version |
| --- | --- |
| DeepSeek Harness | `0.1.0-rc.6` |
| DSH Tools | `0.1.0-rc.6` |
| Cordis | `4.0.1` |
| Node.js | `24.x` and the declared `22.19+` range |

Install the pinned DSH CLI if it is not already available:

```sh
npm install --global @deepseek-ai/dsh@0.1.0-rc.6
dsh --version
```

## Five-minute installation

Clone the source, create the four npm tarballs, and install them into one DSH profile:

```sh
git clone https://github.com/AiWhale980728/dsh-toolbox.git
cd dsh-toolbox

mkdir -p dist
npm pack --workspace @dsh-toolbox/product-research-workbench --pack-destination dist
npm pack --workspace @dsh-toolbox/context-switchboard --pack-destination dist
npm pack --workspace @dsh-toolbox/plugin-preflight --pack-destination dist
npm pack --workspace @dsh-toolbox/compatibility-radar --pack-destination dist

dsh plugin --profile toolbox add ./dist/dsh-toolbox-product-research-workbench-0.2.1.tgz
dsh plugin --profile toolbox add ./dist/dsh-toolbox-context-switchboard-0.2.1.tgz
dsh plugin --profile toolbox add ./dist/dsh-toolbox-plugin-preflight-0.2.1.tgz
dsh plugin --profile toolbox add ./dist/dsh-toolbox-compatibility-radar-0.2.1.tgz

dsh --profile toolbox --dump-config
```

The final command should show all four bundle layers. Start DSH with the same profile:

```sh
dsh --profile toolbox
```

You may install only the tarballs you need. Packing does not execute plugin code and does not require repository dependencies to be installed. Direct checkout-path installation is also possible after `npm install` at the repository root, but tarballs match npm packaging semantics and are the validated portable flow.

Each package pins the small DSH tool-definition runtime needed for reliable out-of-tree installation. There are no install lifecycle scripts.

## How to use the plugins

These packages register tools inside DSH; they are not standalone shell commands. Ask the agent to run the named tool, or describe the outcome and let DSH select it.

### Product Research Workbench

Suggested flow:

```text
research_create → research_add_source → research_extract
→ research_evidence_add (optional human correction)
→ research_analyze → research_report
```

Example request:

```text
Create a research project called "Local AI research workflows".
Import this pasted interview text, extract evidence, analyze the opportunities,
and generate both Markdown and HTML reports.
```

URL import accepts public unauthenticated `http(s)` pages. It blocks loopback, private, link-local, metadata, and other non-public destinations by default. Authenticated crawling, browser cookies, CAPTCHA bypass, and social-media scraping are outside the MVP.

### Context Switchboard

Suggested flow:

```text
context_profile_save → context_route → context_activate
→ context_current / context_history → context_rollback
```

Example request:

```text
Save a context profile named "DSH plugin development" with the keywords
"dsh", "cordis", and "plugin"; use a 1,200-token budget. Route this task,
activate the best profile, and show me the activation receipt.
```

Activation uses DSH's native `systemPrompt.context()` registry. It contributes a bounded runtime-context snapshot and does not replace the deployment persona, sandbox policy, or approval policy.

### Plugin Preflight

Example request:

```text
Run plugin_preflight_scan on packages/context-switchboard and explain every
finding before I install it. Then create the Markdown and HTML audit report.
```

Preflight is static and read-only: it does not run scripts, install dependencies, follow symlinks, or contact registries. A clean scan is not a security guarantee.

### Compatibility Radar

Example request:

```text
Discover DSH bundles under packages, check them against DSH Tools 0.1.0-rc.6,
Cordis 4.0.1, and my current Node version, then save a compatibility snapshot.
```

Before changing DSH or Cordis versions, save a second snapshot and use `compatibility_diff` or `compatibility_report` to identify regressions. Radar never upgrades software automatically.

## Local data and outputs

| Plugin | Default local data |
| --- | --- |
| Product Research Workbench | `~/.local/share/dsh-toolbox/product-research-workbench` |
| Context Switchboard | `~/.local/share/dsh-toolbox/context-switchboard` |
| Plugin Preflight | `~/.local/share/dsh-toolbox/plugin-preflight` |
| Compatibility Radar | `~/.local/share/dsh-toolbox/compatibility-radar` |

The plugins use SQLite and create Markdown plus self-contained HTML reports where applicable. Generated reports load no remote scripts. Runtime databases, reports, exports, sessions, environment files, and cookies are excluded by the repository `.gitignore`, but you should still inspect staged changes before every commit.

Research reports and exports may contain source text, quotations, URLs, local paths, project names, copyrighted material, or personal information. Review them before sharing. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) for the complete boundaries.

## Troubleshooting

### `node:sqlite` cannot be found

Upgrade to Node.js 22.19 or later, or Node.js 24 or later. Older Node releases are unsupported.

### Checkout-path installation cannot resolve `@deepseek-ai/dsh-tools`

Use the tarball flow above. If you deliberately install from checkout paths, run `npm install` at the repository root first.

### DSH reports a minimum-release-age or supply-chain policy violation

Do not bypass the policy automatically. The pinned DSH release candidate and its dependencies may be newer than your configured safety window. Wait for the window to pass or review the dependency provenance and policy with the DSH administrator.

### Peer-dependency warnings appear during profile installation

DSH profiles use an installation-anchor layout that can produce peer visibility warnings. Do not add a second Cordis runtime merely to silence them. Verify `dsh --profile toolbox --dump-config`, then run a real tool smoke test.

### A newer DSH release is available

This MVP is pinned to RC.6. Use Compatibility Radar and repeat an isolated installation/tool-execution test before changing the declared ranges.

## Development and verification

```sh
npm run check
npm run pack:check
```

The `check` command validates all four Profile Bundle manifests and runs the complete test suite. The release gate also includes package dry-runs, Preflight self-scans, current/breaking Compatibility Radar matrices, secret review, and an isolated DSH install/config-load/tool-execution smoke test.

Version `0.2.1` contains 31 registered tools across the four bundles. npm publication and a GitHub Release remain intentionally deferred pending user feedback and an explicit release decision.

## License: noncommercial use only

DSH Toolbox `0.2.1` and later is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE).

Permitted uses include personal study, research, experiments, hobby projects, education, charitable/nonprofit work, public research, public safety, environmental protection, and government work as defined by the license.

**Commercial use is not permitted.** Do not use this software, modified versions, or derived works for direct or indirect commercial advantage, including paid products or services, revenue-generating operations, commercial consulting deliverables, or internal business benefit. The canonical license text controls if this summary differs from it.

This restriction applies to the original DSH Toolbox code. DeepSeek Harness, Cordis, DSH Tools, and other dependencies remain under their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Historical note: copies of earlier versions that were already distributed under MIT remain subject to the grants that accompanied those copies. The `0.2.1` license change does not retroactively revoke rights already granted.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) before contributing. By submitting a contribution, you agree that it may be distributed under the repository's current noncommercial license.
