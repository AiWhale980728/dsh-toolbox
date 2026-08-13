import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

function parsed(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

function uniqueStrings(values, limit = 50) {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))].slice(0, limit)
}

function profile(row) {
  return row && {
    id: row.id,
    name: row.name,
    description: row.description,
    keywords: parsed(row.keywords_json, []),
    instructions: row.instructions,
    resources: parsed(row.resources_json, []),
    tokenBudget: Number(row.token_budget),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class ContextSwitchboard {
  constructor(config = {}) {
    this.dataDir = resolve(config.dataDir ?? `${homedir()}/.local/share/dsh-toolbox/context-switchboard`)
    mkdirSync(this.dataDir, { recursive: true, mode: 0o700 })
    const path = join(this.dataDir, 'context.sqlite3')
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, description TEXT NOT NULL,
        keywords_json TEXT NOT NULL, instructions TEXT NOT NULL, resources_json TEXT NOT NULL,
        token_budget INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS activations (
        id TEXT PRIMARY KEY, session_key TEXT NOT NULL, profile_id TEXT NOT NULL REFERENCES profiles(id),
        task TEXT NOT NULL, score REAL NOT NULL, context_packet TEXT NOT NULL, created_at TEXT NOT NULL,
        rolled_back_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_activations_session ON activations(session_key, created_at DESC);
    `)
    try { chmodSync(path, 0o600) } catch {}
  }

  close() { this.db.close() }

  saveProfile(args) {
    const name = String(args.name ?? '').trim().slice(0, 100)
    const instructions = String(args.instructions ?? '').trim().slice(0, 12_000)
    if (!name) throw new Error('Profile name is required')
    if (!instructions) throw new Error('Profile instructions are required')
    const tokenBudget = Math.trunc(args.tokenBudget ?? 1_200)
    if (tokenBudget < 100 || tokenBudget > 8_000) throw new Error('tokenBudget must be between 100 and 8000')
    const existing = this.db.prepare('SELECT * FROM profiles WHERE name = ? COLLATE NOCASE').get(name)
    const now = new Date().toISOString()
    const values = {
      id: existing?.id ?? randomUUID(),
      name,
      description: String(args.description ?? '').trim().slice(0, 1_000),
      keywords: uniqueStrings(args.keywords, 50),
      instructions,
      resources: uniqueStrings(args.resources, 100),
      tokenBudget,
      createdAt: existing?.created_at ?? now,
      updatedAt: now,
    }
    this.db.prepare(`INSERT INTO profiles
      (id, name, description, keywords_json, instructions, resources_json, token_budget, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET description=excluded.description, keywords_json=excluded.keywords_json,
      instructions=excluded.instructions, resources_json=excluded.resources_json,
      token_budget=excluded.token_budget, updated_at=excluded.updated_at`)
      .run(values.id, values.name, values.description, JSON.stringify(values.keywords), values.instructions,
        JSON.stringify(values.resources), values.tokenBudget, values.createdAt, values.updatedAt)
    return { profile: this.getProfile(values.id), action: existing ? 'updated' : 'created' }
  }

  getProfile(id) { return profile(this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(id)) }

  listProfiles() {
    return { profiles: this.db.prepare('SELECT * FROM profiles ORDER BY name').all().map(profile) }
  }

  route({ task, limit = 3 }) {
    task = String(task ?? '').trim()
    if (!task) throw new Error('task is required')
    limit = Math.trunc(limit)
    if (limit < 1 || limit > 10) throw new Error('limit must be between 1 and 10')
    const lower = task.toLocaleLowerCase()
    const routes = this.listProfiles().profiles.map(item => {
      const matchedKeywords = item.keywords.filter(keyword => lower.includes(keyword.toLocaleLowerCase()))
      const nameMatch = lower.includes(item.name.toLocaleLowerCase()) ? 2 : 0
      const descriptionTerms = item.description.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(term => term.length >= 3)
      const descriptionMatches = descriptionTerms.filter(term => lower.includes(term)).slice(0, 8)
      const score = nameMatch + matchedKeywords.length * 3 + descriptionMatches.length * 0.25
      return { profileId: item.id, name: item.name, score, matchedKeywords, descriptionMatches }
    }).filter(route => route.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit)
    return { task, routes, selected: routes[0] ?? null, changed: false }
  }

  activate({ sessionKey = 'local', profileId, task = '' }) {
    sessionKey = String(sessionKey).trim().slice(0, 200) || 'local'
    const item = this.getProfile(String(profileId ?? ''))
    if (!item) throw new Error(`Unknown context profile: ${profileId}`)
    const route = task ? this.route({ task, limit: 10 }).routes.find(candidate => candidate.profileId === item.id) : undefined
    const packet = this.packet(item)
    const receipt = {
      id: randomUUID(), sessionKey, profileId: item.id, profileName: item.name,
      task: String(task).trim().slice(0, 2_000), score: route?.score ?? 0,
      contextPacket: packet, createdAt: new Date().toISOString(), rolledBackAt: null,
    }
    this.db.prepare(`INSERT INTO activations
      (id, session_key, profile_id, task, score, context_packet, created_at, rolled_back_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`)
      .run(receipt.id, receipt.sessionKey, receipt.profileId, receipt.task, receipt.score, receipt.contextPacket, receipt.createdAt)
    return { receipt, explicitUseRequired: true, note: 'No system prompt was mutated; use contextPacket explicitly.' }
  }

  packet(item) {
    const resourceLines = item.resources.length ? item.resources.map(value => `- ${value}`).join('\n') : '- None declared'
    const value = `# Context profile: ${item.name}\n\n${item.description}\n\n## Guidance\n${item.instructions}\n\n## Resource pointers\n${resourceLines}`
    const approximateCharacters = item.tokenBudget * 4
    return value.length <= approximateCharacters ? value : `${value.slice(0, approximateCharacters - 30)}\n\n[truncated to profile budget]`
  }

  current({ sessionKey = 'local' } = {}) {
    sessionKey = String(sessionKey).trim() || 'local'
    const row = this.db.prepare(`SELECT a.*, p.name AS profile_name FROM activations a
      JOIN profiles p ON p.id = a.profile_id WHERE a.session_key = ? AND a.rolled_back_at IS NULL
      ORDER BY a.created_at DESC, a.id DESC LIMIT 1`).get(sessionKey)
    return { sessionKey, active: row ? this.activation(row) : null }
  }

  rollback({ sessionKey = 'local' } = {}) {
    const current = this.current({ sessionKey })
    if (!current.active) return { sessionKey: current.sessionKey, rolledBack: null, active: null }
    const now = new Date().toISOString()
    this.db.prepare('UPDATE activations SET rolled_back_at = ? WHERE id = ?').run(now, current.active.id)
    return { sessionKey: current.sessionKey, rolledBack: { ...current.active, rolledBackAt: now }, active: this.current({ sessionKey }).active }
  }

  activation(row) {
    return {
      id: row.id, sessionKey: row.session_key, profileId: row.profile_id, profileName: row.profile_name,
      task: row.task, score: Number(row.score), contextPacket: row.context_packet,
      createdAt: row.created_at, rolledBackAt: row.rolled_back_at,
    }
  }
}
