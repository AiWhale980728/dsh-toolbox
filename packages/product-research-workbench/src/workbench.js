import { mkdirSync } from 'node:fs'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ResearchDatabase } from './database.js'
import { normalizeConfig } from './config.js'
import { digestContent, importTextSource, importUrlSource } from './ingest.js'
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

  addEvidence(args) {
    const projectId = requireText(args.projectId, 'projectId')
    const intensity = Math.trunc(args.intensity ?? 3)
    if (intensity < 1 || intensity > 5) throw new Error('intensity must be between 1 and 5')
    const confidence = Number(args.confidence ?? 1)
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('confidence must be between 0 and 1')
    return this.database.addEvidence(projectId, {
      sourceId: requireText(args.sourceId, 'sourceId'),
      category: requireText(args.category, 'category', 80),
      quote: requireText(args.quote, 'quote', 2_000),
      summary: String(args.summary ?? args.quote).trim().slice(0, 500),
      intensity,
      confidence,
      tags: Array.isArray(args.tags) ? [...new Set(args.tags.map(value => String(value).trim()).filter(Boolean))].slice(0, 20) : [],
    })
  }

  deleteSource({ projectId, sourceId, confirmSourceId }) {
    projectId = requireText(projectId, 'projectId'); sourceId = requireText(sourceId, 'sourceId')
    if (confirmSourceId !== sourceId) throw new Error('confirmSourceId must exactly match sourceId')
    return { deleted: this.database.deleteSource(projectId, sourceId), analysisCleared: true }
  }

  async exportProject({ projectId, includeSourceContent = false }) {
    projectId = requireText(projectId, 'projectId')
    const snapshot = this.database.snapshot(projectId, Boolean(includeSourceContent))
    const document = { schema: 'dsh-toolbox/product-research-workbench', schemaVersion: 1, exportedAt: new Date().toISOString(), includesSourceContent: Boolean(includeSourceContent), ...snapshot }
    const directory = join(this.config.dataDir, 'exports')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const path = join(directory, `${projectId}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    await writeFile(path, JSON.stringify(document, null, 2), { mode: 0o600 }); await chmod(path, 0o600)
    return { projectId, path, includesSourceContent: document.includesSourceContent, bytes: Buffer.byteLength(JSON.stringify(document)), privacyNote: includeSourceContent ? 'Export contains raw source text; protect it as private research data.' : 'Raw source bodies were omitted.' }
  }

  importProject({ document, name }) {
    const value = typeof document === 'string' ? (() => { try { return JSON.parse(document) } catch { return null } })() : document
    if (!value || value.schema !== 'dsh-toolbox/product-research-workbench' || value.schemaVersion !== 1 || !value.project || !Array.isArray(value.sources)) {
      throw new Error('Invalid Product Research Workbench export document')
    }
    if (value.sources.length > 1_000 || (value.evidence?.length ?? 0) > 10_000) throw new Error('Import exceeds project limits')
    if (!value.includesSourceContent || value.sources.some(source => typeof source.content !== 'string')) {
      throw new Error('Restorable imports require an export created with includeSourceContent=true')
    }
    const totalBytes = value.sources.reduce((sum, source) => sum + Buffer.byteLength(source.content), 0)
    if (value.sources.some(source => Buffer.byteLength(source.content) > this.config.maxSourceBytes)) {
      throw new Error(`Import contains a source larger than maxSourceBytes (${this.config.maxSourceBytes})`)
    }
    if (totalBytes > Math.min(this.config.maxSourceBytes * 100, 104_857_600)) throw new Error('Import contains more than 100 source-size units or 100 MiB of raw text')
    for (const source of value.sources) {
      const actual = digestContent(source.content)
      if (source.contentSha256 && source.contentSha256 !== actual) throw new Error(`Source checksum mismatch: ${source.id ?? '(unknown)'}`)
    }

    const project = this.create({ name: name ?? `${value.project.name} (imported)`, question: value.project.question, audience: value.project.audience })
    const sourceMap = new Map()
    try {
      for (const source of value.sources) {
        const imported = this.database.addSource({
          projectId: project.id, kind: source.kind === 'url' ? 'url' : 'text', title: String(source.title ?? 'Imported source').slice(0, 200),
          locator: source.kind === 'url' ? source.locator ?? null : null, content: source.content, contentSha256: digestContent(source.content),
          metadata: { ...(source.metadata ?? {}), restoredFromExport: true },
        })
        sourceMap.set(source.id, imported.id)
      }
      for (const card of value.evidence ?? []) {
        const sourceId = sourceMap.get(card.sourceId)
        if (!sourceId) throw new Error(`Evidence references an unknown source: ${card.sourceId}`)
        this.addEvidence({ ...card, projectId: project.id, sourceId })
      }
      if ((value.evidence?.length ?? 0) > 0) this.analyze({ projectId: project.id })
      return { project: this.database.getProject(project.id), sourceCount: sourceMap.size, evidenceCount: this.database.listEvidence(project.id).length }
    } catch (error) {
      this.database.deleteProject(project.id)
      throw error
    }
  }

  async deleteProject({ projectId, confirmProjectName }) {
    projectId = requireText(projectId, 'projectId')
    const project = this.database.requireProject(projectId)
    if (confirmProjectName !== project.name) throw new Error('confirmProjectName must exactly match the project name')
    const deleted = this.database.deleteProject(projectId)
    const reportDirectory = join(this.config.dataDir, 'reports', projectId)
    await rm(reportDirectory, { recursive: true, force: true })
    return { deleted, removedReportDirectory: reportDirectory, databaseRecovery: 'Recoverable only from your own database or JSON backup.' }
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
