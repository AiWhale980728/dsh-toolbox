# DSH Toolbox

Local-first, independently installable plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

> **Experimental / Alpha.** DeepSeek Harness is currently in Developer Preview. APIs and profile-bundle compatibility may change between release candidates. This project is independent and is not affiliated with or endorsed by DeepSeek.

## Packages

| Plugin | Status | Purpose |
| --- | --- | --- |
| [`@dsh-toolbox/product-research-workbench`](packages/product-research-workbench) | Alpha | Turn URL/text evidence into pain clusters, opportunity scores, and Markdown/HTML reports. |
| [`@dsh-toolbox/context-switchboard`](packages/context-switchboard) | Alpha | Route tasks into explicit profiles with activation receipts and rollback. |
| [`@dsh-toolbox/plugin-preflight`](packages/plugin-preflight) | Alpha | Statically check local plugins for packaging, license, lifecycle, and capability risks. |
| [`@dsh-toolbox/compatibility-radar`](packages/compatibility-radar) | Alpha | Build and diff local DSH/plugin compatibility snapshots. |

Each package is a DSH Profile Bundle and can be installed independently from a local path:

```sh
dsh plugin --profile web add ./packages/product-research-workbench
```

The plugins require Node.js `^22.19.0 || >=24.0.0`; local storage uses Node's built-in `node:sqlite` module. Packages target `@deepseek-ai/dsh-tools >=0.1.0-rc.5 <0.2.0` and Cordis 4.x. A real `dsh` executable is not part of this repository, so release checks must be repeated against the intended DSH RC.

## Local development

```sh
pnpm test
pnpm check
pnpm pack:check
```

The Alpha intentionally has no production npm dependencies. See [PRIVACY.md](PRIVACY.md), [SECURITY.md](SECURITY.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) before enabling new integrations.

## Delivery status

1. Product Research Workbench Alpha — implemented
2. Context Switchboard Alpha — implemented
3. Plugin Preflight Alpha — implemented
4. Compatibility Radar Alpha — implemented

Next milestone: install smoke tests against a pinned DSH release candidate, followed by usability feedback and hardening. None of the packages has been published to npm or tagged as a GitHub Release yet.

## License

Original code is released under the [MIT License](LICENSE). Third-party projects mentioned in documentation remain under their own licenses.
