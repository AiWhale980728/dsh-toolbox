# DSH Toolbox

Local-first, independently installable plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

> **Experimental / Alpha.** DeepSeek Harness is currently in Developer Preview. APIs and profile-bundle compatibility may change between release candidates. This project is independent and is not affiliated with or endorsed by DeepSeek.

## Packages

| Plugin | Status | Purpose |
| --- | --- | --- |
| [`@dsh-toolbox/product-research-workbench`](packages/product-research-workbench) | Alpha | Turn URL/text evidence into pain clusters, opportunity scores, and Markdown/HTML reports. |
| [`@dsh-toolbox/context-switchboard`](packages/context-switchboard) | Experimental scaffold | Route tasks into explicit, inspectable local context profiles. |
| [`@dsh-toolbox/plugin-preflight`](packages/plugin-preflight) | Experimental scaffold | Check a plugin before installation for packaging, permissions, and common security risks. |
| [`@dsh-toolbox/compatibility-radar`](packages/compatibility-radar) | Experimental scaffold | Track DSH/plugin version compatibility and likely breaking changes. |

Each package is a DSH Profile Bundle and can be installed independently from a local path:

```sh
dsh plugin --profile web add ./packages/product-research-workbench
```

The Product Research Workbench currently requires Node.js `^22.19.0 || >=24.0.0`; SQLite uses Node's built-in `node:sqlite` module. The package targets `@deepseek-ai/dsh-tools >=0.1.0-rc.5 <0.2.0` and Cordis 4.x. A real `dsh` executable is not part of this repository, so release checks must be repeated against the intended DSH RC.

## Local development

```sh
pnpm test
pnpm check
pnpm pack:check
```

The Alpha intentionally has no production npm dependencies. See [PRIVACY.md](PRIVACY.md), [SECURITY.md](SECURITY.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) before enabling new integrations.

## Roadmap

1. Product Research Workbench usable Alpha
2. Context Switchboard
3. Plugin Preflight
4. Compatibility Radar

This ordering is deliberate: the research workflow establishes the shared local storage, receipts, export, and safety patterns used by the other plugins.

## License

Original code is released under the [MIT License](LICENSE). Third-party projects mentioned in documentation remain under their own licenses.
