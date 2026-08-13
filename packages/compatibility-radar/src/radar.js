import { DatabaseSync } from 'node:sqlite'
import { chmodSync, mkdirSync } from 'node:fs'
import { chmod, mkdir, readFile, realpath, readdir, writeFile } from 'node:fs/promises'
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
    ? { status: 'unknown', actual, range, reason: 'Range syntax is outside the built-in parser.' }
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

  async discover({ roots, maxDepth = 4, maxDirectories = 5_000 }) {
    if (!Array.isArray(roots) || roots.length === 0) throw new Error('roots needs at least one local directory')
    maxDepth = Math.trunc(maxDepth); maxDirectories = Math.trunc(maxDirectories)
    if (maxDepth < 0 || maxDepth > 12) throw new Error('maxDepth must be between 0 and 12')
    if (maxDirectories < 1 || maxDirectories > 50_000) throw new Error('maxDirectories must be between 1 and 50000')
    const plugins = [], errors = [], visited = new Set(), queue = [], resolvedRoots = []
    for (const input of roots) {
      try {
        const path = await realpath(resolve(String(input)))
        resolvedRoots.push(path); queue.push({ path, depth: 0 })
      } catch (error) { errors.push({ path: resolve(String(input)), error: error.message }) }
    }
    while (queue.length) {
      const item = queue.shift()
      if (visited.has(item.path)) continue
      visited.add(item.path)
      if (visited.size > maxDirectories) throw new Error(`Discovery exceeded ${maxDirectories} directories`)
      try {
        const manifest = JSON.parse(await readFile(join(item.path, 'package.json'), 'utf8'))
        if (manifest.dsh?.bundle?.patch) plugins.push({ pluginPath: item.path, package: manifest.name ?? null, version: manifest.version ?? null, patch: manifest.dsh.bundle.patch })
      } catch {}
      if (item.depth >= maxDepth) continue
      let entries
      try { entries = await readdir(item.path, { withFileTypes: true }) } catch (error) { errors.push({ path: item.path, error: error.message }); continue }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink() || ['.git', 'node_modules', 'coverage', 'dist'].includes(entry.name)) continue
        queue.push({ path: join(item.path, entry.name), depth: item.depth + 1 })
      }
    }
    plugins.sort((a, b) => a.package?.localeCompare(b.package ?? '') || a.pluginPath.localeCompare(b.pluginPath))
    return { roots: [...new Set(resolvedRoots)], plugins, errors, scannedDirectories: visited.size }
  }

  async inferTarget({ manifestPath }) {
    const path = resolve(required(manifestPath, 'manifestPath'))
    let manifest
    try { manifest = JSON.parse(await readFile(path, 'utf8')) } catch (error) { throw new Error(`Cannot read target manifest: ${error.message}`) }
    const sources = [manifest.dependencies ?? {}, manifest.devDependencies ?? {}, manifest.peerDependencies ?? {}]
    const pick = name => sources.map(group => group[name]).find(Boolean)
    const exact = (range, name) => {
      const match = /(?:^|[^\d])(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(String(range ?? ''))
      if (!match) throw new Error(`Cannot infer an exact ${name} version from ${range ?? '(missing)'}`)
      return match[1]
    }
    return {
      manifestPath: path,
      dshToolsVersion: exact(pick('@deepseek-ai/dsh-tools'), '@deepseek-ai/dsh-tools'),
      cordisVersion: exact(pick('@deepseek-ai/cordis'), '@deepseek-ai/cordis'),
      nodeVersion: exact(manifest.engines?.node ?? process.versions.node, 'Node'),
    }
  }

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
        dshTools: checkRange(runtime.dshTools, manifest.peerDependencies?.['@deepseek-ai/dsh-tools'] ?? manifest.dependencies?.['@deepseek-ai/dsh-tools']),
        cordis: checkRange(runtime.cordis, manifest.peerDependencies?.['@deepseek-ai/cordis'] ?? manifest.dependencies?.['@deepseek-ai/cordis']),
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
    const recommendations = regressions.map(change => ({
      package: change.package,
      action: change.after === 'incompatible' ? 'Keep the prior runtime or update the plugin peer range only after a real install/test.' : 'Review missing or unsupported compatibility declarations.',
    }))
    return { before: { id: before.id, label: before.label, target: before.target }, after: { id: after.id, label: after.label, target: after.target }, changes, regressions, recommendations, upgradeRisk: regressions.length ? 'review-required' : changes.length ? 'changed' : 'no-change' }
  }

  async report({ beforeId, afterId, format = 'both' } = {}) {
    if (!['markdown', 'html', 'both'].includes(format)) throw new Error('format must be markdown, html, or both')
    const diff = this.diff({ beforeId, afterId })
    const markdown = this.markdown(diff)
    const directory = join(this.dataDir, 'reports')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const reports = []
    if (format !== 'html') {
      const path = join(directory, `compatibility_${stamp}.md`); await writeFile(path, markdown, { mode: 0o600 }); await chmod(path, 0o600); reports.push({ format: 'markdown', path })
    }
    if (format !== 'markdown') {
      const path = join(directory, `compatibility_${stamp}.html`); await writeFile(path, this.html(diff), { mode: 0o600 }); await chmod(path, 0o600); reports.push({ format: 'html', path })
    }
    return { upgradeRisk: diff.upgradeRisk, changes: diff.changes.length, regressions: diff.regressions.length, reports }
  }

  markdown(diff) {
    const lines = ['# DSH Compatibility Radar', '', `- Before: **${diff.before.label}**`, `- After: **${diff.after.label}**`, `- Upgrade risk: **${diff.upgradeRisk}**`, '', '## Changes', '']
    if (!diff.changes.length) lines.push('No compatibility changes detected.')
    for (const item of diff.changes) lines.push(`- **${item.package ?? item.pluginPath}**: ${item.kind}${item.before ? ` ${item.before}` : ''}${item.after ? ` → ${item.after}` : ''}`)
    lines.push('', '## Recommendations', '', ...(diff.recommendations.length ? diff.recommendations.map(item => `- **${item.package}**: ${item.action}`) : ['No upgrade regression recommendations.']), '')
    return lines.join('\n')
  }

  html(diff) {
    const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DSH Compatibility Radar</title><style>body{font:16px/1.5 system-ui;max-width:960px;margin:auto;padding:40px}.risk{font-size:1.4rem}li{margin:.6em 0}</style></head><body><h1>DSH Compatibility Radar</h1><p class="risk">Upgrade risk: <strong>${escape(diff.upgradeRisk)}</strong></p><p>${escape(diff.before.label)} → ${escape(diff.after.label)}</p><h2>Changes</h2><ul>${diff.changes.map(item => `<li><strong>${escape(item.package ?? item.pluginPath)}</strong>: ${escape(item.kind)} ${escape(item.before ?? '')} → ${escape(item.after ?? '')}</li>`).join('')}</ul><h2>Recommendations</h2><ul>${diff.recommendations.map(item => `<li><strong>${escape(item.package)}</strong>: ${escape(item.action)}</li>`).join('')}</ul></body></html>`
  }
}
