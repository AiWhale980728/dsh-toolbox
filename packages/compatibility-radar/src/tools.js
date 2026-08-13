import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

function rendered() { return { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] } }
const targetParameters = {
  dshToolsVersion: { type: 'string', required: true, description: 'Target @deepseek-ai/dsh-tools semantic version' },
  cordisVersion: { type: 'string', required: true, description: 'Target @deepseek-ai/cordis semantic version' },
  nodeVersion: { type: 'string', description: 'Target Node semantic version; defaults to current process' },
  pluginPaths: { type: 'array', required: true, items: { type: 'string' }, description: 'Explicit local plugin directories' },
}

function within(root, target) {
  const path = relative(root, target)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function sessionCwd(exec) {
  return resolve(exec?.agent?.session?.header?.cwd ?? process.cwd())
}

function resolveInput(input, exec) {
  const value = String(input)
  return resolve(isAbsolute(value) ? value : resolve(sessionCwd(exec), value))
}

async function permittedRootsFor(exec, config) {
  const configured = Array.isArray(config.allowedRoots) ? config.allowedRoots : []
  return Promise.all((configured.length ? configured : [sessionCwd(exec)])
    .map(root => realpath(resolve(String(root)))))
}

async function permittedArgs(args, exec, config) {
  const roots = await permittedRootsFor(exec, config)
  const pluginPaths = []
  for (const input of args.pluginPaths ?? []) {
    const target = await realpath(resolveInput(input, exec))
    if (!roots.some(root => within(root, target))) throw new Error(`Plugin path is outside allowed roots: ${roots.join(', ')}`)
    pluginPaths.push(target)
  }
  return { ...args, pluginPaths }
}

async function permittedRoots(args, exec, config) {
  return (await permittedArgs({ ...args, pluginPaths: args.roots }, exec, config)).pluginPaths
}

async function permittedManifestPath(input, exec, config) {
  const roots = await permittedRootsFor(exec, config)
  const target = await realpath(resolveInput(input, exec))
  if (!roots.some(root => within(root, target))) throw new Error(`Manifest path is outside allowed roots: ${roots.join(', ')}`)
  return target
}

export function registerRadarTools(ctx, radar, defineTool = value => value, config = {}) {
  const tools = [
    { name: 'compatibility_check', description: 'Build a read-only local plugin compatibility matrix without saving it or changing installed software.', parameters: targetParameters, execute: async (args, exec) => radar.check(await permittedArgs(args, exec, config)) },
    { name: 'compatibility_snapshot', description: 'Build and save a local SQLite compatibility matrix snapshot.', parameters: { ...targetParameters, label: { type: 'string' } }, execute: async (args, exec) => radar.snapshot(await permittedArgs(args, exec, config)) },
    { name: 'compatibility_list', description: 'List saved local compatibility snapshots.', parameters: { limit: { type: 'number' } }, execute: args => radar.list(args) },
    { name: 'compatibility_diff', description: 'Compare two saved matrices, or the latest two, and identify compatibility regressions.', parameters: { beforeId: { type: 'string' }, afterId: { type: 'string' } }, execute: args => radar.diff(args) },
    { name: 'compatibility_discover', description: 'Discover local DSH Profile Bundles under permitted roots without following symlinks or scanning node_modules.', parameters: { roots: { type: 'array', required: true, items: { type: 'string' } }, maxDepth: { type: 'number' }, maxDirectories: { type: 'number' } }, execute: async (args, exec) => radar.discover({ ...args, roots: await permittedRoots(args, exec, config) }) },
    { name: 'compatibility_infer_target', description: 'Infer exact DSH Tools, Cordis, and Node versions from one permitted local package.json.', parameters: { manifestPath: { type: 'string', required: true } }, execute: async (args, exec) => radar.inferTarget({ manifestPath: await permittedManifestPath(args.manifestPath, exec, config) }) },
    { name: 'compatibility_report', description: 'Write Markdown and/or self-contained HTML upgrade-risk reports from two snapshots.', parameters: { beforeId: { type: 'string' }, afterId: { type: 'string' }, format: { type: 'string', enum: ['markdown', 'html', 'both'] } }, execute: args => radar.report(args) },
  ]
  for (const tool of tools) ctx.tools.register(defineTool({ ...tool, output: rendered() }))
  return tools.map(tool => tool.name)
}
