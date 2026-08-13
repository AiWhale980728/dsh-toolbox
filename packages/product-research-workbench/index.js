import { defineTool } from '@deepseek-ai/dsh-tools'
import { ResearchWorkbench } from './src/workbench.js'
import { registerResearchTools } from './src/tools.js'

export const name = 'product-research-workbench'
export const inject = ['tools']

export function apply(ctx, config = {}) {
  const workbench = new ResearchWorkbench(config)
  registerResearchTools(ctx, workbench, defineTool)
  ctx.effect(() => () => workbench.close(), 'product-research-workbench:database')
}

export { ResearchWorkbench, registerResearchTools }
