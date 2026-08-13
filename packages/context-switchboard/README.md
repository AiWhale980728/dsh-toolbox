# Context Switchboard

Experimental local-first Alpha for named context profiles, deterministic task routing, explicit activation receipts, and rollback.

## Tools

- `context_profile_save` — create or update a profile with keywords, guidance, resources, and a context budget.
- `context_profile_list` — inspect configured profiles.
- `context_route` — preview ranked profiles for a task without changing state.
- `context_activate` — record an explicit selection and return a bounded context packet.
- `context_current` — show the active receipt for a session key.
- `context_rollback` — roll back the current receipt without deleting history.

Activation does **not** silently rewrite system prompts. The returned `contextPacket` is structured, bounded text for the caller/model to use explicitly. This keeps the Alpha compatible with current DSH Profile Bundles while prompt-section APIs are still Developer Preview.

Data defaults to `~/.local/share/dsh-toolbox/context-switchboard/context.sqlite3`; set `dataDir` in the bundle config to change it. No resource paths are opened by the plugin: they are labels/provenance pointers only.
