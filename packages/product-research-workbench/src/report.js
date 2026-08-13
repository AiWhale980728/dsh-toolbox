import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

function markdownText(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/([\\`*_[\]<>])/g, '\\$1').trim()
}

function htmlText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function publicHttpUrl(value) {
  try {
    const url = new URL(String(value))
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function formatScore(value) {
  return Number(value).toFixed(2)
}

function sourceIndex(snapshot) {
  return new Map(snapshot.sources.map((source, index) => [source.id, { ...source, citation: `S${index + 1}` }]))
}

export function renderMarkdown(snapshot) {
  const { project, sources, evidence, clusters, opportunities } = snapshot
  const sourceById = sourceIndex(snapshot)
  const lines = [
    `# ${markdownText(project.name)}`,
    '',
    `- **Research question:** ${markdownText(project.question || 'Not specified')}`,
    `- **Audience:** ${markdownText(project.audience || 'Not specified')}`,
    `- **Generated:** ${new Date().toISOString()}`,
    `- **Coverage:** ${sources.length} source(s), ${evidence.length} evidence card(s), ${clusters.length} pain cluster(s)`,
    '',
    '> Experimental local analysis. Scores are prioritization aids, not market-size estimates. Review quotations and source rights before sharing.',
    '',
    '## Executive summary',
    '',
  ]

  if (opportunities.length === 0) {
    lines.push('No scored opportunities. Import evidence, then run extraction and analysis.', '')
  } else {
    for (const [index, opportunity] of opportunities.entries()) {
      lines.push(`${index + 1}. **${markdownText(opportunity.title)}** — score ${formatScore(opportunity.score)}. ${markdownText(opportunity.problem)}`)
    }
    lines.push('')
  }

  lines.push('## Opportunity scorecard', '')
  lines.push('| Opportunity | Reach | Impact | Confidence | Effort | Score |', '| --- | ---: | ---: | ---: | ---: | ---: |')
  for (const opportunity of opportunities) {
    lines.push(`| ${markdownText(opportunity.title)} | ${formatScore(opportunity.reach)} | ${formatScore(opportunity.impact)} | ${formatScore(opportunity.confidence)} | ${formatScore(opportunity.effort)} | ${formatScore(opportunity.score)} |`)
  }
  lines.push('', 'Score = source reach × impact × evidence confidence × 10 ÷ estimated effort.', '')

  lines.push('## Pain clusters', '')
  for (const cluster of clusters) {
    lines.push(
      `### ${markdownText(cluster.label)}`,
      '',
      `${markdownText(cluster.pain)}`,
      '',
      `Evidence: ${cluster.evidenceCount}; sources: ${cluster.sourceCount}; severity: ${formatScore(cluster.severity)}; confidence: ${formatScore(cluster.confidence)}.`,
      '',
    )
  }

  lines.push('## Evidence ledger', '')
  for (const card of evidence) {
    const source = sourceById.get(card.sourceId)
    lines.push(`- **${markdownText(card.category)} · ${source?.citation ?? 'unknown'} · intensity ${card.intensity}/5:** “${markdownText(card.quote)}”`)
  }
  lines.push('', '## Sources', '')
  for (const [index, source] of sources.entries()) {
    const label = `S${index + 1}`
    const locator = source.locator ? ` — ${markdownText(source.locator)}` : ' — pasted text (local only)'
    lines.push(`- **${label}:** ${markdownText(source.title)}${locator}`)
  }
  lines.push('')
  return lines.join('\n')
}

export function renderHtml(snapshot) {
  const markdown = renderMarkdown(snapshot)
  const sourceById = sourceIndex(snapshot)
  const opportunityRows = snapshot.opportunities.map(opportunity => `<tr>
    <td>${htmlText(opportunity.title)}</td><td>${formatScore(opportunity.reach)}</td>
    <td>${formatScore(opportunity.impact)}</td><td>${formatScore(opportunity.confidence)}</td>
    <td>${formatScore(opportunity.effort)}</td><td><strong>${formatScore(opportunity.score)}</strong></td>
  </tr>`).join('')
  const clusterCards = snapshot.clusters.map(cluster => `<article class="card">
    <h3>${htmlText(cluster.label)}</h3><p>${htmlText(cluster.pain)}</p>
    <p class="meta">${cluster.evidenceCount} evidence · ${cluster.sourceCount} sources · severity ${formatScore(cluster.severity)} · confidence ${formatScore(cluster.confidence)}</p>
  </article>`).join('')
  const evidenceItems = snapshot.evidence.map(card => {
    const source = sourceById.get(card.sourceId)
    return `<li><strong>${htmlText(card.category)} · ${source?.citation ?? 'unknown'} · ${card.intensity}/5</strong><blockquote>${htmlText(card.quote)}</blockquote></li>`
  }).join('')
  const sourceItems = snapshot.sources.map((source, index) => {
    const title = htmlText(source.title)
    const href = source.locator && publicHttpUrl(source.locator)
    const reference = href
      ? `<a href="${htmlText(href)}" rel="noreferrer noopener">${htmlText(source.locator)}</a>`
      : source.locator
        ? htmlText(source.locator)
      : 'pasted text (local only)'
    return `<li><strong>S${index + 1}: ${title}</strong> — ${reference}</li>`
  }).join('')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="DSH Toolbox Product Research Workbench MVP">
<title>${htmlText(snapshot.project.name)} — Research report</title>
<style>
:root{color-scheme:light dark;--bg:#f6f3ed;--ink:#17201e;--muted:#65706c;--panel:#fff;--line:#d8d4ca;--accent:#0b6b57}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:980px;margin:auto;padding:48px 24px 96px}h1{font-size:clamp(2rem,6vw,4.6rem);line-height:1;letter-spacing:-.05em;margin:.2em 0}.eyebrow,.meta{color:var(--muted)}.notice{border-left:4px solid var(--accent);padding:12px 16px;background:color-mix(in srgb,var(--panel) 80%,transparent)}section{margin-top:48px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px}table{width:100%;border-collapse:collapse;background:var(--panel)}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--line)}th{color:var(--muted)}blockquote{margin:.3em 0 1.2em;padding-left:12px;border-left:2px solid var(--line)}a{color:var(--accent);overflow-wrap:anywhere}.raw{white-space:pre-wrap;background:var(--panel);padding:16px;border:1px solid var(--line);border-radius:8px}@media(prefers-color-scheme:dark){:root{--bg:#111715;--ink:#e8eeea;--muted:#9aa7a1;--panel:#19211e;--line:#35413d;--accent:#59d2b1}}
</style></head><body><main>
<p class="eyebrow">DSH Toolbox · Product Research Workbench · Experimental MVP</p>
<h1>${htmlText(snapshot.project.name)}</h1>
<p><strong>Question:</strong> ${htmlText(snapshot.project.question || 'Not specified')}<br><strong>Audience:</strong> ${htmlText(snapshot.project.audience || 'Not specified')}</p>
<p class="notice">Local deterministic analysis of ${snapshot.sources.length} source(s) and ${snapshot.evidence.length} evidence card(s). Scores are prioritization aids, not market-size estimates.</p>
<section><h2>Opportunity scorecard</h2><div style="overflow:auto"><table><thead><tr><th>Opportunity</th><th>Reach</th><th>Impact</th><th>Confidence</th><th>Effort</th><th>Score</th></tr></thead><tbody>${opportunityRows}</tbody></table></div><p class="meta">Score = source reach × impact × evidence confidence × 10 ÷ estimated effort.</p></section>
<section><h2>Pain clusters</h2><div class="grid">${clusterCards}</div></section>
<section><h2>Evidence ledger</h2><ol>${evidenceItems}</ol></section>
<section><h2>Sources</h2><ol>${sourceItems}</ol></section>
<details><summary>Portable Markdown copy</summary><pre class="raw">${htmlText(markdown)}</pre></details>
</main></body></html>`
}

export async function writeReports(snapshot, dataDir, format = 'both') {
  const directory = join(dataDir, 'reports', snapshot.project.id)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const outputs = []
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  if (format === 'markdown' || format === 'both') {
    const path = join(directory, `research-report_${stamp}.md`)
    await writeFile(path, renderMarkdown(snapshot), { encoding: 'utf8', mode: 0o600 })
    await chmod(path, 0o600)
    outputs.push({ format: 'markdown', path })
  }
  if (format === 'html' || format === 'both') {
    const path = join(directory, `research-report_${stamp}.html`)
    await writeFile(path, renderHtml(snapshot), { encoding: 'utf8', mode: 0o600 })
    await chmod(path, 0o600)
    outputs.push({ format: 'html', path })
  }
  return outputs
}
