# Context Switchboard

Local-first MVP for named context profiles, deterministic task routing, native DSH runtime-context injection, activation receipts, and rollback.

## Tools

- `context_profile_save` — create or update a profile with keywords, guidance, resources, and a context budget.
- `context_profile_list` — inspect configured profiles.
- `context_route` — preview ranked profiles for a task without changing state.
- `context_activate` — record an explicit selection and return a bounded context packet.
- `context_current` — show the active receipt for a session key.
- `context_rollback` — roll back the current receipt without deleting history.
- `context_history` — inspect the session activation stack.
- `context_profile_export` / `context_profile_import` — move or back up profile definitions.
- `context_diagnose` — find duplicated keywords and context-budget problems.

Activation contributes the bounded packet through DSH's native `systemPrompt.context()` registry. The current full packet is materialized as a durable runtime-context snapshot and replaces the prior snapshot instead of accumulating stale copies. No profile replaces the deployment persona, sandbox policy, or approval policy.

Profiles support positive/negative keywords, priority, enable/disable state, resource pointers, and per-profile token budgets. Activation history is per DSH session id; rolling back reveals the previous active receipt.

Data defaults to `~/.local/share/dsh-toolbox/context-switchboard/context.sqlite3`; set `dataDir` in the bundle config to change it. No resource paths are opened by the plugin: they are labels/provenance pointers only.
