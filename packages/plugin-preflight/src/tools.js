import { scanPlugin } from './preflight.js'
import { realpath } from 'node:fs/promises'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { formatPreflightHtml } from './preflight.js'

function within(root, target) {
  const path = relative(root, target)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

async function permittedPath(input, exec, config) {
  const value = String(input)
  const cwd = resolve(exec?.agent?.session?.header?.cwd ?? process.cwd())
  const target = await realpath(resolve(isAbsolute(value) ? value : resolve(cwd, value)))
  const configured = Array.isArray(config.allowedRoots) ? config.allowedRoots : []
  const roots = configured.length
    ? configured
    : [exec?.agent?.session?.header?.cwd ?? process.cwd()]
  const realRoots = await Promise.all(roots.map(root => realpath(resolve(String(root)))))
  if (!realRoots.some(root => within(root, target))) {
    throw new Error(`Plugin path is outside allowed roots: ${realRoots.join(', ')}`)
  }
  return target
}

export function registerPreflightTools(ctx, defineTool = value => value, config = {}) {
  ctx.tools.register(defineTool({
    name: 'plugin_preflight_scan',
    description: 'Statically inspect one explicit local DSH plugin directory without installing dependencies, executing scripts, following symlinks, or changing DSH configuration.',
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute or working-directory-relative plugin directory' },
      maxFiles: { type: 'number', description: 'Scan cap, default 1000, maximum 10000' },
      maxFileBytes: { type: 'number', description: 'Per-file code scan cap, default 1 MiB' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, result) => [{ type: 'text', text: result.markdown }] },
    async execute(args, exec) {
      return scanPlugin(await permittedPath(args.path, exec, config), { ...args, policy: config.policy })
    },
  }))
  ctx.tools.register(defineTool({
    name: 'plugin_preflight_report',
    description: 'Scan a permitted local plugin and write Markdown plus self-contained HTML audit reports under the configured private data directory.',
    parameters: { path: { type: 'string', required: true }, maxFiles: { type: 'number' }, maxFileBytes: { type: 'number' } },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, result) => [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    },
    async execute(args, exec) {
      const result = await scanPlugin(await permittedPath(args.path, exec, config), { ...args, policy: config.policy })
      const directory = join(config.dataDir, 'reports')
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const safeName = (result.package ?? 'plugin').replace(/[^a-z0-9._-]+/gi, '-')
      const markdownPath = join(directory, `${safeName}_${stamp}.md`)
      const htmlPath = join(directory, `${safeName}_${stamp}.html`)
      await writeFile(markdownPath, result.markdown, { mode: 0o600 })
      await writeFile(htmlPath, formatPreflightHtml(result), { mode: 0o600 })
      await chmod(markdownPath, 0o600); await chmod(htmlPath, 0o600)
      return { package: result.package, verdict: result.verdict, riskScore: result.riskScore, fingerprint: result.fingerprint, reports: [{ format: 'markdown', path: markdownPath }, { format: 'html', path: htmlPath }] }
    },
  }))
  return ['plugin_preflight_scan', 'plugin_preflight_report']
}
