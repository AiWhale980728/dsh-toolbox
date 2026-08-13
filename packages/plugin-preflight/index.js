import { defineTool } from '@deepseek-ai/dsh-tools'
import { registerPreflightTools } from './src/tools.js'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

export const name = 'plugin-preflight'
export const inject = ['tools']

export function apply(ctx, config = {}) {
  const dataDir = resolve(config.dataDir ?? `${homedir()}/.local/share/dsh-toolbox/plugin-preflight`)
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  registerPreflightTools(ctx, defineTool, { ...config, dataDir })
}

export { scanPlugin, formatPreflightMarkdown } from './src/preflight.js'
