import { defineTool } from '@deepseek-ai/dsh-tools'
import { ContextSwitchboard } from './src/switchboard.js'
import { registerContextTools } from './src/tools.js'

export const name = 'context-switchboard'
export const inject = ['tools']

export function apply(ctx, config = {}) {
  const switchboard = new ContextSwitchboard(config)
  registerContextTools(ctx, switchboard, defineTool)
  ctx.effect(() => () => switchboard.close(), 'context-switchboard:database')
}

export { ContextSwitchboard, registerContextTools }
