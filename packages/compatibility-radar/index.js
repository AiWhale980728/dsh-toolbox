import { defineTool } from '@deepseek-ai/dsh-tools'
import { CompatibilityRadar } from './src/radar.js'
import { registerRadarTools } from './src/tools.js'

export const name = 'compatibility-radar'
export const inject = ['tools']

export function apply(ctx, config = {}) {
  const radar = new CompatibilityRadar(config)
  registerRadarTools(ctx, radar, defineTool, config)
  ctx.effect(() => () => radar.close(), 'compatibility-radar:database')
}

export { CompatibilityRadar, registerRadarTools }
