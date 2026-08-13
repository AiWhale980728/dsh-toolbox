import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ResearchDatabase } from './database.js'
import { normalizeConfig } from './config.js'
import { importTextSource, importUrlSource } from './ingest.js'
import { extractEvidence } from './extract.js'
import { analyzeEvidence } from './analyze.js'
import { writeReports } from './report.js'

function requireText(value, label, max = 500) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim().slice(0, max)
}

export class ResearchWorkbench {
  constructor(inputConfig = {}, database) {
    this.config = normalizeConfig(inputConfig)
    mkdirSync(this.config.dataDir, { recursive: true, mode: 0o700 })
    this.database = database ?? new ResearchDatabase(join(this.config.dataDir, 'research.sqlite3'))
  }

  close() {
    this.database.close()
  }

  create(args) {
    return this.database.createProject({
      name: requireText(args.name, 'Project name', 200),
      question: String(args.question ?? '').trim().slice(0, 1000),
      audience: String(args.audience ?? '').trim().slice(0, 500),
    })
  }

  list({ limit = 20 } = {}) {
    const safeLimit = Math.trunc(limit)
    if (safeLimit < 1 || safeLimit > 100) throw new Error('limit must be between 1 and 100')
    return { projects: this.database.listProjects(safeLimit) }
  }

  get({ projectId }) {
    return this.database.snapshot(requireText(projectId, 'projectId'), false)
  }

  async addSource(args, signal) {
    const projectId = requireText(args.projectId, 'projectId')
    this.database.requireProject(projectId)
    if (!['text', 'url'].includes(args.kind)) throw new Error('kind must be text or url')
    if (args.kind === 'text' && args.url !== undefined) throw new Error('Text sources cannot include url')
    if (args.kind === 'url' && args.text !== undefined) throw new Error('URL sources cannot include text')
    const imported = args.kind === 'text'
      ? importTextSource({ title: args.title, text: args.text, maxSourceBytes: this.config.maxSourceBytes })
      : await importUrlSource({ url: requireText(args.url, 'url', 4_096), title: args.title, config: this.config, signal })
    return this.database.addSource({ projectId, ...imported })
  }

  extract({ projectId }) {
    projectId = requireText(projectId, 'projectId')
    const sources = this.database.listSources(projectId, true)
    if (sources.length === 0) throw new Error('The project has no sources')
    const evidence = extractEvidence(sources, this.config.maxEvidenceCards)
    this.database.replaceEvidence(projectId, evidence)
    return {
      projectId,
      sourceCount: sources.length,
      evidenceCount: evidence.length,
      byCategory: Object.fromEntries(Array.from(Map.groupBy(evidence, card => card.category), ([key, value]) => [key, value.length])),
      ...(evidence.length === 0
        ? { warning: 'No explicit pain language was found. Add more detailed user feedback and extract again.' }
        : {}),
    }
  }

  analyze({ projectId }) {
    projectId = requireText(projectId, 'projectId')
    const sources = this.database.listSources(projectId, false)
    const evidence = this.database.listEvidence(projectId)
    const clusters = analyzeEvidence(evidence, sources)
    this.database.replaceAnalysis(projectId, clusters)
    return {
      projectId,
      clusters: this.database.listClusters(projectId),
      opportunities: this.database.listOpportunities(projectId),
      method: 'Deterministic category clustering and transparent RICE-style scoring; no external model call.',
    }
  }

  async report({ projectId, format = 'both' }) {
    projectId = requireText(projectId, 'projectId')
    if (!['markdown', 'html', 'both'].includes(format)) throw new Error('format must be markdown, html, or both')
    const snapshot = this.database.snapshot(projectId, false)
    if (snapshot.opportunities.length === 0) throw new Error('No analyzed opportunities exist; run research_analyze first')
    const outputs = await writeReports(snapshot, this.config.dataDir, format)
    return {
      projectId,
      reports: outputs.map(output => this.database.addReport({ projectId, ...output })),
      privacyNote: 'Reports may contain source quotations and URLs. Review them before sharing.',
    }
  }
}
