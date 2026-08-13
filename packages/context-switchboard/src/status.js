export function registerStatusTool(ctx, defineTool = value => value) {
  ctx.tools.register(defineTool({
    name: 'context_switchboard_status',
    description: 'Describe the experimental Context Switchboard plugin and its planned safety boundary.',
    parameters: {},
    output: { schema: { type: 'object', additionalProperties: true } },
    async execute() {
      return {
        status: 'experimental-scaffold',
        ready: false,
        planned: ['named context profiles', 'explicit routing rules', 'activation receipts', 'rollback'],
        boundary: 'Will not silently rewrite agent instructions or bypass DSH permission controls.',
      }
    },
  }))
}
