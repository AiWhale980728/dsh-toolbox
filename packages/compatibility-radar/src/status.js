export function registerStatusTool(ctx, defineTool = value => value) {
  ctx.tools.register(defineTool({
    name: 'compatibility_radar_status',
    description: 'Describe the experimental Compatibility Radar plugin and its planned monitoring scope.',
    parameters: {},
    output: { schema: { type: 'object', additionalProperties: true } },
    async execute() {
      return {
        status: 'experimental-scaffold',
        ready: false,
        planned: ['local version inventory', 'compatibility matrix', 'release metadata snapshots', 'upgrade risk report'],
        boundary: 'Monitoring will not auto-upgrade plugins or DSH.',
      }
    },
  }))
}
