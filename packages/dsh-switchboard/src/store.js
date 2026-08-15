import { DatabaseSync } from 'node:sqlite'
import { chmodSync, lstatSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export function defaultSwitchboardDataDir() {
  return join(homedir(), '.local', 'share', 'dsh-toolbox', 'dsh-switchboard')
}

export class SwitchboardStore {
  constructor(config = {}) {
    this.dataDir = resolve(config.dataDir ?? defaultSwitchboardDataDir())
    try {
      const info = lstatSync(this.dataDir)
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Switchboard data path must be a real directory, not a symlink: ${this.dataDir}`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      mkdirSync(this.dataDir, { recursive: true, mode: 0o700 })
    }
    try { chmodSync(this.dataDir, 0o700) } catch {}
    this.path = join(this.dataDir, 'switchboard.sqlite3')
    try {
      const info = lstatSync(this.path)
      if (info.isSymbolicLink() || !info.isFile()) throw new Error(`Switchboard database path must be a regular file, not a symlink: ${this.path}`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    this.db = new DatabaseSync(this.path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        adapter TEXT NOT NULL,
        profile TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        backup_dir TEXT,
        result_json TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        profile TEXT,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS activities_created_at_idx
        ON activities (created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS activities_profile_created_at_idx
        ON activities (profile, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS activities_session_created_at_idx
        ON activities (session_id, created_at DESC, id DESC);
    `)
    for (const path of [this.path, `${this.path}-wal`, `${this.path}-shm`]) {
      try { chmodSync(path, 0o600) } catch {}
    }
  }

  create({ plan, status = 'prepared', backupDir = null }) {
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO transactions
        (id, adapter, profile, action, status, plan_json, backup_dir, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(plan.id, plan.adapter, plan.profile, plan.action, status, JSON.stringify(plan), backupDir, now, now)
    return this.get(plan.id)
  }

  update(id, { status, backupDir, result, error } = {}) {
    const current = this.get(id)
    if (!current) throw new Error(`Unknown transaction: ${id}`)
    this.db.prepare(`
      UPDATE transactions
      SET status = ?, backup_dir = ?, result_json = ?, error = ?, updated_at = ?
      WHERE id = ?
    `).run(
      status ?? current.status,
      backupDir ?? current.backupDir,
      result === undefined ? current.resultJson : JSON.stringify(result),
      error === undefined ? current.error : error,
      new Date().toISOString(),
      id,
    )
    return this.get(id)
  }

  get(id) {
    const row = this.db.prepare('SELECT * FROM transactions WHERE id = ?').get(String(id))
    return row ? inflate(row) : null
  }

  list({ limit = 20 } = {}) {
    limit = Math.trunc(limit)
    if (limit < 1 || limit > 200) throw new Error('limit must be between 1 and 200')
    return this.db.prepare('SELECT * FROM transactions ORDER BY created_at DESC, id DESC LIMIT ?').all(limit).map(inflate)
  }

  addActivity(activity) {
    const value = {
      id: String(activity.id),
      sessionId: String(activity.sessionId),
      profile: activity.profile == null ? null : String(activity.profile),
      kind: String(activity.kind),
      status: String(activity.status),
      title: String(activity.title),
      detail: String(activity.detail),
      createdAt: String(activity.createdAt ?? new Date().toISOString()),
    }
    for (const key of ['id', 'sessionId', 'kind', 'status', 'title', 'createdAt']) {
      if (!value[key]) throw new Error(`Activity ${key} is required`)
    }
    this.db.prepare(`
      INSERT INTO activities
        (id, session_id, profile, kind, status, title, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(value.id, value.sessionId, value.profile, value.kind, value.status, value.title, value.detail, value.createdAt)
    return value
  }

  listActivities({ profile, kind, status, sessionId, limit = 50, cursor = null } = {}) {
    limit = Math.trunc(limit)
    if (limit < 1 || limit > 200) throw new Error('limit must be between 1 and 200')
    const where = []
    const values = []
    for (const [column, value] of [
      ['profile', profile],
      ['kind', kind],
      ['status', status],
      ['session_id', sessionId],
    ]) {
      if (value == null || value === '') continue
      where.push(`${column} = ?`)
      values.push(String(value))
    }
    if (cursor) {
      if (!cursor.createdAt || !cursor.id) throw new Error('Activity cursor is invalid')
      where.push('(created_at < ? OR (created_at = ? AND id < ?))')
      values.push(String(cursor.createdAt), String(cursor.createdAt), String(cursor.id))
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    return this.db.prepare(`
      SELECT * FROM activities
      ${clause}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(...values, limit).map(inflateActivity)
  }

  countActivities({ profile, kind, status, sessionId } = {}) {
    const where = []
    const values = []
    for (const [column, value] of [
      ['profile', profile],
      ['kind', kind],
      ['status', status],
      ['session_id', sessionId],
    ]) {
      if (value == null || value === '') continue
      where.push(`${column} = ?`)
      values.push(String(value))
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    return Number(this.db.prepare(`SELECT COUNT(*) AS count FROM activities ${clause}`).get(...values).count)
  }

  clearActivitiesForSession(sessionId) {
    const value = String(sessionId ?? '')
    if (!value) throw new Error('sessionId is required')
    return Number(this.db.prepare('DELETE FROM activities WHERE session_id = ?').run(value).changes)
  }

  close() { this.db.close() }
}

function inflateActivity(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    profile: row.profile,
    kind: row.kind,
    status: row.status,
    title: row.title,
    detail: row.detail,
    createdAt: row.created_at,
  }
}

function inflate(row) {
  return {
    id: row.id,
    adapter: row.adapter,
    profile: row.profile,
    action: row.action,
    status: row.status,
    plan: JSON.parse(row.plan_json),
    backupDir: row.backup_dir,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    resultJson: row.result_json,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
