export function registerRuntimeContext(ctx, switchboard) {
  return ctx.systemPrompt.context({
    name: 'dsh-toolbox:context-switchboard',
    order: 40,
    text: assembly => switchboard.contextForAgent(assembly.agent),
  })
}
