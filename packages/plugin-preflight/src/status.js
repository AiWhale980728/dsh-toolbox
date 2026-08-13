export function registerStatusTool(ctx, defineTool = value => value) {
  ctx.tools.register(defineTool({
    name: 'plugin_preflight_status',
    description: 'Describe the experimental Plugin Preflight plugin and its planned checks.',
    parameters: {},
    output: { schema: { type: 'object', additionalProperties: true } },
    async execute() {
      return {
        status: 'experimental-scaffold',
        ready: false,
        planned: ['profile-bundle validation', 'dependency/license inventory', 'permission risk receipt', 'install-plan preview'],
        boundary: 'Analysis will be read-only and will not bypass DSH installation approvals.',
      }
    },
  }))
}
