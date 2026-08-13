import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ResearchWorkbench } from '../src/workbench.js'

async function withWorkbench(run) {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-prw-'))
  const workbench = new ResearchWorkbench({ dataDir })
  try {
    await run(workbench, dataDir)
  } finally {
    workbench.close()
    await rm(dataDir, { recursive: true, force: true })
  }
}

test('runs the local text → evidence → opportunity → report workflow', async () => {
  await withWorkbench(async (workbench, dataDir) => {
    const project = workbench.create({
      name: 'PM evidence study',
      question: 'Where should a local research tool reduce effort?',
      audience: 'Independent product managers',
    })
    const source = await workbench.addSource({
      projectId: project.id,
      kind: 'text',
      title: 'Interview notes',
      text: [
        '我经常需要手动复制粘贴访谈内容，来回切换很麻烦。',
        'The export is often slow and I wish it could sync cleanly with my notes.',
        '隐私是严重问题，我不能把未发布的访谈内容上传到云端。',
      ].join('\n'),
    })
    assert.equal(source.kind, 'text')
    assert.equal('content' in source, false)

    const extracted = workbench.extract({ projectId: project.id })
    assert.ok(extracted.evidenceCount >= 3)
    const analyzed = workbench.analyze({ projectId: project.id })
    assert.ok(analyzed.opportunities.length >= 2)
    assert.ok(analyzed.opportunities[0].score > 0)

    const generated = await workbench.report({ projectId: project.id, format: 'both' })
    assert.equal(generated.reports.length, 2)
    for (const report of generated.reports) {
      assert.ok(report.path.startsWith(join(dataDir, 'reports', project.id)))
      assert.ok((await stat(report.path)).size > 100)
    }

    const markdownPath = generated.reports.find(report => report.format === 'markdown').path
    const htmlPath = generated.reports.find(report => report.format === 'html').path
    assert.match(await readFile(markdownPath, 'utf8'), /Opportunity scorecard/)
    const html = await readFile(htmlPath, 'utf8')
    assert.match(html, /<!doctype html>/)
    assert.doesNotMatch(html, /<script\b/i)

    const snapshot = workbench.get({ projectId: project.id })
    assert.equal(snapshot.sources[0].content, undefined)
    assert.equal(snapshot.reports.length, 2)
  })
})

test('rejects duplicate content within one project', async () => {
  await withWorkbench(async workbench => {
    const project = workbench.create({ name: 'Duplicates' })
    const args = { projectId: project.id, kind: 'text', text: 'This manual workflow is difficult and slow.' }
    await workbench.addSource(args)
    await assert.rejects(workbench.addSource(args), /already in the project/)
  })
})

test('escapes imported HTML-like text in generated HTML reports', async () => {
  await withWorkbench(async workbench => {
    const project = workbench.create({ name: '<img src=x onerror=alert(1)>' })
    await workbench.addSource({
      projectId: project.id,
      kind: 'text',
      title: '<script>alert(1)</script>',
      text: 'The manual workflow is difficult. <img src=x onerror=alert(1)>',
    })
    workbench.extract({ projectId: project.id })
    workbench.analyze({ projectId: project.id })
    const { reports } = await workbench.report({ projectId: project.id, format: 'html' })
    const html = await readFile(reports[0].path, 'utf8')
    assert.doesNotMatch(html, /<img src=x/i)
    assert.doesNotMatch(html, /<script>alert/i)
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  })
})
