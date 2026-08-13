import { DatabaseSync } from 'node:sqlite'
import { chmodSync, mkdirSync } from 'node:fs'
import { readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { satisfiesRange } from './semver.js'

function required(value, name) {
  value = String(value ?? '').trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function target(args) {
  return {
    dshTools: required(args.dshToolsVersion, 'dshToolsVersion'),
    cordis: required(args.cordisVersion, 'cordisVersion'),
    node: String(args.nodeVersion ?? process.versions.node).replace(/^v/, ''),
  }
}

function checkRange(actual, range) {
  if (!range) return { status: 'unknown', actual, range: null, reason: 'Plugin does not declare this compatibility range.' }
  const match = satisfiesRange(actual, range)
  return match === null
    ? { status: 'unknown', actual, range, reason: 'Range syntax is outside the Alpha parser.' }
    : { status: match ? 'compatible' : 'incompatible', actual, range }
}

export class CompatibilityRadar {
  constructor(config = {}) {
    this.dataDir = resolve(config.dataDir ?? `${homedir()}/.local/share/dsh-toolbox/compatibility-radar`)
    mkdirSync(this.dataDir, { recursive: true, mode: 0o700 })
    const path = join(this.dataDir, 'compatibility.sqlite3')
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY, label TEXT NOT NULL, target_json TEXT NOT NULL, matrix_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
    `)
    try { chmodSync(path, 0o600) } catch {}
  }

  close() { this.db.close() }

  async check(args) {
    const runtime = target(args)
    if (!Array.isArray(args.pluginPaths) || args.pluginPaths.length === 0) throw new Error('pluginPaths needs at least one local plugin directory')
    if (args.pluginPaths.length > 100) throw new Error('pluginPaths is capped at 100')
    const matrix = []
    for (const input of args.pluginPaths) {
      let pluginPath
      try { pluginPath = await realpath(resolve(String(input))) } catch (error) {
        matrix.push({ pluginPath: resolve(String(input)), package: null, version: null, status: 'error', reason: `Cannot resolve plugin directory: ${error.message}` })
        continue
      }
      let manifest
      try { manifest = JSON.parse(await readFile(join(pluginPath, 'package.json'), 'utf8')) } catch (error) {
        matrix.push({ pluginPath, package: null, version: null, status: 'error', reason: `Cannot read package.json: ${error.message}` })
        continue
      }
      const checks = {
        dshTools: checkRange(runtime.dshTools, manifest.peerDependencies?.['@deepseek-ai/dsh-tools']),
        cordis: checkRange(runtime.cordis, manifest.peerDependencies?.['@deepseek-ai/cordis']),
        node: checkRange(runtime.node, manifest.engines?.node),
      }
      const values = Object.values(checks).map(item => item.status)
      const status = values.includes('incompatible') ? 'incompatible' : values.includes('unknown') ? 'unknown' : 'compatible'
      matrix.push({ pluginPath, package: manifest.name ?? null, version: manifest.version ?? null, status, checks })
    }
    const summary = Object.fromEntries(['compatible', 'incompatible', 'unknown', 'error'].map(status => [status, matrix.filter(item => item.status === status).length]))
    return { target: runtime, summary, matrix, changed: false }
  }

  async snapshot(args) {
    const checked = await this.check(args)
    const snapshot = { id: randomUUID(), label: String(args.label ?? '').trim().slice(0, 200) || `Snapshot ${new Date().toISOString()}`, createdAt: new Date().toISOString(), ...checked }
    this.db.prepare('INSERT INTO snapshots (id, label, target_json, matrix_json, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(snapshot.id, snapshot.label, JSON.stringify(snapshot.target), JSON.stringify(snapshot.matrix), snapshot.createdAt)
    return snapshot
  }

  list({ limit = 20 } = {}) {
    limit = Math.trunc(limit)
    if (limit < 1 || limit > 100) throw new Error('limit must be between 1 and 100')
    return { snapshots: this.db.prepare('SELECT * FROM snapshots ORDER BY created_at DESC, id DESC LIMIT ?').all(limit).map(row => this.inflate(row, false)) }
  }

  get(id) {
    const row = this.db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id)
    if (!row) throw new Error(`Unknown compatibility snapshot: ${id}`)
    return this.inflate(row, true)
  }

  inflate(row, includeMatrix) {
    const target = JSON.parse(row.target_json), matrix = JSON.parse(row.matrix_json)
    const summary = Object.fromEntries(['compatible', 'incompatible', 'unknown', 'error'].map(status => [status, matrix.filter(item => item.status === status).length]))
    return { id: row.id, label: row.label, target, summary, ...(includeMatrix ? { matrix } : {}), createdAt: row.created_at }
  }

  diff({ beforeId, afterId } = {}) {
    if (!beforeId || !afterId) {
      const latest = this.db.prepare('SELECT id FROM snapshots ORDER BY created_at DESC, id DESC LIMIT 2').all()
      if (latest.length < 2) throw new Error('At least two snapshots are required when ids are omitted')
      afterId ??= latest[0].id
      beforeId ??= latest.find(row => row.id !== afterId)?.id
    }
    if (beforeId === afterId) throw new Error('beforeId and afterId must differ')
    const before = this.get(beforeId), after = this.get(afterId)
    const beforeByPath = new Map(before.matrix.map(item => [item.pluginPath, item]))
    const afterByPath = new Map(after.matrix.map(item => [item.pluginPath, item]))
    const changes = []
    for (const path of new Set([...beforeByPath.keys(), ...afterByPath.keys()])) {
      const left = beforeByPath.get(path), right = afterByPath.get(path)
      if (!left) changes.push({ pluginPath: path, kind: 'added', after: right.status, package: right.package })
      else if (!right) changes.push({ pluginPath: path, kind: 'removed', before: left.status, package: left.package })
      else if (left.status !== right.status || left.version !== right.version) changes.push({ pluginPath: path, kind: 'changed', before: left.status, after: right.status, beforeVersion: left.version, afterVersion: right.version, package: right.package })
    }
    const riskOrder = { error: 3, incompatible: 3, unknown: 2, compatible: 1 }
    const regressions = changes.filter(change => change.kind === 'added' ? riskOrder[change.after] >= 2 : change.kind === 'changed' && riskOrder[change.after] > riskOrder[change.before])
    return { before: { id: before.id, label: before.label, target: before.target }, after: { id: after.id, label: after.label, target: after.target }, changes, regressions, upgradeRisk: regressions.length ? 'review-required' : changes.length ? 'changed' : 'no-change' }
  }
}
