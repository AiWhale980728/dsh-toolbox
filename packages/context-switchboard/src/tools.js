function output() {
  return { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function sessionKey(args, exec) {
  return args.sessionKey ?? exec?.agent?.session?.id ?? exec?.agent?.session?.header?.id ?? 'local'
}

export function registerContextTools(ctx, switchboard, defineTool = value => value) {
  const definitions = [
    ['context_profile_save', 'Create or update one local named context profile.', {
      name: { type: 'string', required: true }, description: { type: 'string' },
      keywords: { type: 'array', items: { type: 'string' } }, instructions: { type: 'string', required: true },
      resources: { type: 'array', items: { type: 'string' } }, tokenBudget: { type: 'number' },
    }, args => switchboard.saveProfile(args)],
    ['context_profile_list', 'List local context profiles. This does not activate a profile.', {}, () => switchboard.listProfiles()],
    ['context_route', 'Rank context profiles for a task using transparent keyword matching. Preview only; state is unchanged.', {
      task: { type: 'string', required: true }, limit: { type: 'number' },
    }, args => switchboard.route(args)],
    ['context_activate', 'Explicitly record one profile selection and return its bounded context packet. Does not mutate the system prompt.', {
      profileId: { type: 'string', required: true }, task: { type: 'string' }, sessionKey: { type: 'string' },
    }, (args, exec) => switchboard.activate({ ...args, sessionKey: sessionKey(args, exec) })],
    ['context_current', 'Show the latest non-rolled-back context receipt for this session key.', {
      sessionKey: { type: 'string' },
    }, (args, exec) => switchboard.current({ sessionKey: sessionKey(args, exec) })],
    ['context_rollback', 'Roll back the latest active receipt for this session key, preserving audit history.', {
      sessionKey: { type: 'string' },
    }, (args, exec) => switchboard.rollback({ sessionKey: sessionKey(args, exec) })],
  ]
  for (const [name, description, parameters, execute] of definitions) {
    ctx.tools.register(defineTool({ name, description, parameters, output: output(), execute }))
  }
  return definitions.map(([name]) => name)
}
