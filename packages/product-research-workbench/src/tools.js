function jsonContent(value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

function definition(defineTool, value) {
  return defineTool({
    ...value,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, output) => jsonContent(output),
    },
  })
}

export function registerResearchTools(ctx, workbench, defineTool = value => value) {
  const tools = [
    {
      name: 'research_create',
      description: 'Create a local product-research project. Use this before importing URL or text evidence.',
      parameters: {
        name: { type: 'string', required: true, description: 'Short project name' },
        question: { type: 'string', description: 'Decision or research question to answer' },
        audience: { type: 'string', description: 'Target user or market segment' },
      },
      execute: args => workbench.create(args),
    },
    {
      name: 'research_list',
      description: 'List recent local research projects and their source/evidence/opportunity counts.',
      parameters: { limit: { type: 'number', description: 'Maximum projects, 1-100; default 20' } },
      execute: args => workbench.list(args),
    },
    {
      name: 'research_get',
      description: 'Get a project snapshot with provenance, evidence, clusters, opportunities, and report paths. Raw source bodies are omitted.',
      parameters: { projectId: { type: 'string', required: true, description: 'Project id from research_create or research_list' } },
      execute: args => workbench.get(args),
    },
    {
      name: 'research_add_source',
      description: 'Import one pasted text or unauthenticated public http(s) URL into a local research project. Private-network URLs, credentials, cookies, and oversized responses are rejected by default.',
      parameters: {
        projectId: { type: 'string', required: true, description: 'Destination project id' },
        kind: { type: 'string', required: true, enum: ['text', 'url'], description: 'Source kind' },
        title: { type: 'string', description: 'Optional source title' },
        text: { type: 'string', description: 'Required only when kind=text' },
        url: { type: 'string', description: 'Required only when kind=url; must be public http(s)' },
      },
      execute: (args, exec = {}) => workbench.addSource(args, exec.signal),
    },
    {
      name: 'research_extract',
      description: 'Replace the project evidence ledger using transparent local pain-language heuristics. This makes no external model call.',
      parameters: { projectId: { type: 'string', required: true, description: 'Project id' } },
      execute: args => workbench.extract(args),
    },
    {
      name: 'research_analyze',
      description: 'Cluster extracted evidence by pain type and calculate transparent RICE-style opportunity scores locally.',
      parameters: { projectId: { type: 'string', required: true, description: 'Project id' } },
      execute: args => workbench.analyze(args),
    },
    {
      name: 'research_report',
      description: 'Write a Markdown, self-contained HTML, or paired report under the configured local data directory. Reports may contain quotations and URLs.',
      parameters: {
        projectId: { type: 'string', required: true, description: 'Project id' },
        format: { type: 'string', enum: ['markdown', 'html', 'both'], description: 'Output format; default both' },
      },
      execute: args => workbench.report(args),
    },
    {
      name: 'research_evidence_add',
      description: 'Add one human-reviewed evidence card to a source and clear stale derived analysis.',
      parameters: { projectId: { type: 'string', required: true }, sourceId: { type: 'string', required: true }, category: { type: 'string', required: true }, quote: { type: 'string', required: true }, summary: { type: 'string' }, intensity: { type: 'number' }, confidence: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } } },
      execute: args => workbench.addEvidence(args),
    },
    {
      name: 'research_source_delete',
      description: 'Delete one source and its evidence after exact source-id confirmation; clears stale clusters and opportunities.',
      parameters: { projectId: { type: 'string', required: true }, sourceId: { type: 'string', required: true }, confirmSourceId: { type: 'string', required: true } },
      execute: args => workbench.deleteSource(args),
    },
    {
      name: 'research_export',
      description: 'Write a private JSON project export. Raw source bodies are excluded unless includeSourceContent is explicitly true.',
      parameters: { projectId: { type: 'string', required: true }, includeSourceContent: { type: 'boolean' } },
      execute: args => workbench.exportProject(args),
    },
    {
      name: 'research_import',
      description: 'Restore a new project from a trusted Product Research Workbench export document that includes raw source content.',
      parameters: { document: { type: 'object', required: true, additionalProperties: true }, name: { type: 'string' } },
      execute: args => workbench.importProject(args),
    },
    {
      name: 'research_project_delete',
      description: 'Permanently delete one local research project and its generated report directory. Requires exact project-name confirmation.',
      parameters: { projectId: { type: 'string', required: true }, confirmProjectName: { type: 'string', required: true } },
      execute: args => workbench.deleteProject(args),
    },
  ]

  for (const tool of tools) ctx.tools.register(definition(defineTool, tool))
  return tools.map(tool => tool.name)
}
