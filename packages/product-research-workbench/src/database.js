import { DatabaseSync } from 'node:sqlite'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

const SCHEMA = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    question TEXT NOT NULL DEFAULT '',
    audience TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'collecting',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('text', 'url')),
    title TEXT NOT NULL,
    locator TEXT,
    content TEXT NOT NULL,
    content_sha256 TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    imported_at TEXT NOT NULL,
    UNIQUE(project_id, content_sha256)
  );

  CREATE TABLE IF NOT EXISTS evidence_cards (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    quote TEXT NOT NULL,
    summary TEXT NOT NULL,
    intensity INTEGER NOT NULL,
    confidence REAL NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clusters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    pain TEXT NOT NULL,
    evidence_count INTEGER NOT NULL,
    source_count INTEGER NOT NULL,
    severity REAL NOT NULL,
    frequency REAL NOT NULL,
    confidence REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cluster_id TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    problem TEXT NOT NULL,
    reach REAL NOT NULL,
    impact REAL NOT NULL,
    confidence REAL NOT NULL,
    effort REAL NOT NULL,
    score REAL NOT NULL,
    rationale TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    format TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sources_project ON sources(project_id);
  CREATE INDEX IF NOT EXISTS idx_evidence_project ON evidence_cards(project_id);
  CREATE INDEX IF NOT EXISTS idx_clusters_project ON clusters(project_id);
  CREATE INDEX IF NOT EXISTS idx_opportunities_project ON opportunities(project_id);
`

function json(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeProject(row) {
  return row && {
    id: row.id,
    name: row.name,
    question: row.question,
    audience: row.audience,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class ResearchDatabase {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path)
    this.db.exec(SCHEMA)
    if (path !== ':memory:') {
      try { chmodSync(path, 0o600) } catch {}
    }
  }

  close() {
    this.db.close()
  }

  createProject({ name, question = '', audience = '' }) {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.prepare(`INSERT INTO projects (id, name, question, audience, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, name, question, audience, now, now)
    return this.getProject(id)
  }

  getProject(id) {
    return normalizeProject(this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id))
  }

  requireProject(id) {
    const project = this.getProject(id)
    if (!project) throw new Error(`Unknown research project: ${id}`)
    return project
  }

  listProjects(limit = 20) {
    return this.db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM sources s WHERE s.project_id = p.id) AS source_count,
        (SELECT COUNT(*) FROM evidence_cards e WHERE e.project_id = p.id) AS evidence_count,
        (SELECT COUNT(*) FROM opportunities o WHERE o.project_id = p.id) AS opportunity_count
      FROM projects p ORDER BY p.updated_at DESC LIMIT ?
    `).all(limit).map(row => ({
      ...normalizeProject(row),
      sourceCount: Number(row.source_count),
      evidenceCount: Number(row.evidence_count),
      opportunityCount: Number(row.opportunity_count),
    }))
  }

  addSource({ projectId, kind, title, locator = null, content, contentSha256, metadata = {} }) {
    this.requireProject(projectId)
    const id = randomUUID()
    const now = new Date().toISOString()
    try {
      this.db.prepare(`INSERT INTO sources
        (id, project_id, kind, title, locator, content, content_sha256, metadata_json, imported_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, projectId, kind, title, locator, content, contentSha256, JSON.stringify(metadata), now)
    } catch (error) {
      if (String(error?.message).includes('UNIQUE constraint failed')) {
        throw new Error('This source content is already in the project')
      }
      throw error
    }
    this.touch(projectId, 'collecting')
    return this.getSource(id, false)
  }

  getSource(id, includeContent = true) {
    const row = this.db.prepare('SELECT * FROM sources WHERE id = ?').get(id)
    if (!row) return undefined
    return {
      id: row.id,
      projectId: row.project_id,
      kind: row.kind,
      title: row.title,
      locator: row.locator,
      ...(includeContent ? { content: row.content } : {}),
      contentSha256: row.content_sha256,
      metadata: json(row.metadata_json, {}),
      importedAt: row.imported_at,
    }
  }

  listSources(projectId, includeContent = true) {
    this.requireProject(projectId)
    return this.db.prepare('SELECT id FROM sources WHERE project_id = ? ORDER BY imported_at, id')
      .all(projectId).map(row => this.getSource(row.id, includeContent))
  }

  replaceEvidence(projectId, cards) {
    this.requireProject(projectId)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('DELETE FROM evidence_cards WHERE project_id = ?').run(projectId)
      this.db.prepare('DELETE FROM opportunities WHERE project_id = ?').run(projectId)
      this.db.prepare('DELETE FROM clusters WHERE project_id = ?').run(projectId)
      const insert = this.db.prepare(`INSERT INTO evidence_cards
        (id, project_id, source_id, category, quote, summary, intensity, confidence, tags_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      const now = new Date().toISOString()
      for (const card of cards) {
        insert.run(card.id ?? randomUUID(), projectId, card.sourceId, card.category, card.quote,
          card.summary, card.intensity, card.confidence, JSON.stringify(card.tags ?? []), now)
      }
      this.touch(projectId, 'extracted')
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  listEvidence(projectId) {
    this.requireProject(projectId)
    return this.db.prepare('SELECT * FROM evidence_cards WHERE project_id = ? ORDER BY created_at, id')
      .all(projectId).map(row => ({
        id: row.id,
        projectId: row.project_id,
        sourceId: row.source_id,
        category: row.category,
        quote: row.quote,
        summary: row.summary,
        intensity: Number(row.intensity),
        confidence: Number(row.confidence),
        tags: json(row.tags_json, []),
        createdAt: row.created_at,
      }))
  }

  replaceAnalysis(projectId, clusters) {
    this.requireProject(projectId)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('DELETE FROM opportunities WHERE project_id = ?').run(projectId)
      this.db.prepare('DELETE FROM clusters WHERE project_id = ?').run(projectId)
      const insertCluster = this.db.prepare(`INSERT INTO clusters
        (id, project_id, label, pain, evidence_count, source_count, severity, frequency, confidence, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      const insertOpportunity = this.db.prepare(`INSERT INTO opportunities
        (id, project_id, cluster_id, title, problem, reach, impact, confidence, effort, score, rationale, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      const now = new Date().toISOString()
      for (const cluster of clusters) {
        const clusterId = cluster.id ?? randomUUID()
        insertCluster.run(clusterId, projectId, cluster.label, cluster.pain, cluster.evidenceCount,
          cluster.sourceCount, cluster.severity, cluster.frequency, cluster.confidence, now)
        const opportunity = cluster.opportunity
        insertOpportunity.run(opportunity.id ?? randomUUID(), projectId, clusterId, opportunity.title,
          opportunity.problem, opportunity.reach, opportunity.impact, opportunity.confidence,
          opportunity.effort, opportunity.score, opportunity.rationale, now)
      }
      this.touch(projectId, 'analyzed')
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  listClusters(projectId) {
    this.requireProject(projectId)
    return this.db.prepare('SELECT * FROM clusters WHERE project_id = ? ORDER BY frequency DESC, severity DESC')
      .all(projectId).map(row => ({
        id: row.id,
        projectId: row.project_id,
        label: row.label,
        pain: row.pain,
        evidenceCount: Number(row.evidence_count),
        sourceCount: Number(row.source_count),
        severity: Number(row.severity),
        frequency: Number(row.frequency),
        confidence: Number(row.confidence),
        createdAt: row.created_at,
      }))
  }

  listOpportunities(projectId) {
    this.requireProject(projectId)
    return this.db.prepare('SELECT * FROM opportunities WHERE project_id = ? ORDER BY score DESC, title')
      .all(projectId).map(row => ({
        id: row.id,
        projectId: row.project_id,
        clusterId: row.cluster_id,
        title: row.title,
        problem: row.problem,
        reach: Number(row.reach),
        impact: Number(row.impact),
        confidence: Number(row.confidence),
        effort: Number(row.effort),
        score: Number(row.score),
        rationale: row.rationale,
        createdAt: row.created_at,
      }))
  }

  addReport({ projectId, format, path }) {
    this.requireProject(projectId)
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.prepare('INSERT INTO reports (id, project_id, format, path, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, projectId, format, path, now)
    this.touch(projectId, 'reported')
    return { id, projectId, format, path, createdAt: now }
  }

  listReports(projectId) {
    this.requireProject(projectId)
    return this.db.prepare('SELECT * FROM reports WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId).map(row => ({
        id: row.id,
        projectId: row.project_id,
        format: row.format,
        path: row.path,
        createdAt: row.created_at,
      }))
  }

  snapshot(projectId, includeSourceContent = false) {
    return {
      project: this.requireProject(projectId),
      sources: this.listSources(projectId, includeSourceContent),
      evidence: this.listEvidence(projectId),
      clusters: this.listClusters(projectId),
      opportunities: this.listOpportunities(projectId),
      reports: this.listReports(projectId),
    }
  }

  touch(projectId, status) {
    this.db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), projectId)
  }
}
