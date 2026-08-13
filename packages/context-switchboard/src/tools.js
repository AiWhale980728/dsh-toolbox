function output() {
  return { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function sessionKey(args, exec) {
  return args.sessionKey ?? exec?.agent?.session?.id ?? exec?.agent?.session?.header?.id ?? 'local'
}

export function registerContextTools(ctx, switchboard, defineTool = value => value, onContextChange = () => {}) {
  const definitions = [
    ['context_profile_save', 'Create or update one local named context profile.', {
      name: { type: 'string', required: true }, description: { type: 'string' },
      keywords: { type: 'array', items: { type: 'string' } }, instructions: { type: 'string', required: true },
      negativeKeywords: { type: 'array', items: { type: 'string' } },
      resources: { type: 'array', items: { type: 'string' } }, tokenBudget: { type: 'number' },
      priority: { type: 'number' }, enabled: { type: 'boolean' },
    }, args => switchboard.saveProfile(args)],
    ['context_profile_list', 'List local context profiles. This does not activate a profile.', {}, () => switchboard.listProfiles()],
    ['context_route', 'Rank context profiles for a task using transparent keyword matching. Preview only; state is unchanged.', {
      task: { type: 'string', required: true }, limit: { type: 'number' },
    }, args => switchboard.route(args)],
    ['context_activate', 'Explicitly record one profile selection and return its bounded packet for DSH native runtime context. Does not replace the system prompt.', {
      profileId: { type: 'string', required: true }, task: { type: 'string' }, sessionKey: { type: 'string' },
    }, async (args, exec) => {
      const result = switchboard.activate({ ...args, sessionKey: sessionKey(args, exec) })
      await onContextChange()
      return result
    }],
    ['context_current', 'Show the latest non-rolled-back context receipt for this session key.', {
      sessionKey: { type: 'string' },
    }, (args, exec) => switchboard.current({ sessionKey: sessionKey(args, exec) })],
    ['context_rollback', 'Roll back the latest active receipt for this session key, preserving audit history.', {
      sessionKey: { type: 'string' },
    }, async (args, exec) => {
      const result = switchboard.rollback({ sessionKey: sessionKey(args, exec) })
      await onContextChange()
      return result
    }],
    ['context_history', 'List activation and rollback receipts for this session key.', {
      sessionKey: { type: 'string' }, limit: { type: 'number' },
    }, (args, exec) => switchboard.history({ ...args, sessionKey: sessionKey(args, exec) })],
    ['context_profile_export', 'Export all local context profiles as a portable JSON-compatible document.', {}, () => switchboard.exportProfiles()],
    ['context_profile_import', 'Import a Context Switchboard export document. replace disables profiles absent from the import but preserves history.', {
      document: { type: 'object', required: true, additionalProperties: true }, mode: { type: 'string', enum: ['merge', 'replace'] },
    }, args => switchboard.importProfiles(args)],
    ['context_diagnose', 'Find duplicate routing keywords, empty rules, and likely context-budget truncation.', {}, () => switchboard.diagnose()],
  ]
  for (const [name, description, parameters, execute] of definitions) {
    ctx.tools.register(defineTool({ name, description, parameters, output: output(), execute }))
  }
  return definitions.map(([name]) => name)
}
