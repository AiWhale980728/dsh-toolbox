import { scanPlugin } from './preflight.js'
import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

function within(root, target) {
  const path = relative(root, target)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

async function permittedPath(input, exec, config) {
  const target = await realpath(resolve(String(input)))
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
      return scanPlugin(await permittedPath(args.path, exec, config), args)
    },
  }))
  return ['plugin_preflight_scan']
}
