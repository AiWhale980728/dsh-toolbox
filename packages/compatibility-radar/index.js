import { defineTool } from '@deepseek-ai/dsh-tools'
import { registerStatusTool } from './src/status.js'

export const name = 'compatibility-radar'
export const inject = ['tools']

export function apply(ctx) {
  registerStatusTool(ctx, defineTool)
}
