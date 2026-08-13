import { defineTool } from '@deepseek-ai/dsh-tools'
import { registerPreflightTools } from './src/tools.js'

export const name = 'plugin-preflight'
export const inject = ['tools']

export function apply(ctx, config = {}) {
  registerPreflightTools(ctx, defineTool, config)
}

export { scanPlugin, formatPreflightMarkdown } from './src/preflight.js'
