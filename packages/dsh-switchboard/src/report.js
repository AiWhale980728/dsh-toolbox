function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

function healthLabel(health) {
  if (!health) return 'not checked'
  return health.ok ? 'healthy' : 'review required'
}

export function formatProfileMarkdown(profile, health = null, audit = null) {
  const lines = [
    `# DSH Profile: ${profile.name}`,
    '',
    `- Health: **${healthLabel(health)}**`,
    `- Bundle layers: **${profile.bundles.length}**`,
    `- Dependencies: **${Object.keys(profile.dependencies).length}**`,
    `- User patch: **${profile.patch.exists ? `${profile.patch.bytes} bytes` : 'absent'}**`,
    `- State fingerprint: \`sha256:${profile.stateHash}\``,
    '',
    '## Ordered bundle layers',
    '',
  ]
  if (!profile.bundleDetails.length) lines.push('No bundle layers are active.')
  for (const bundle of profile.bundleDetails) {
    lines.push(`${bundle.position + 1}. **${bundle.packageName}** — ${bundle.resolved ? `${bundle.version ?? 'unknown version'} · ${bundle.source}` : 'unresolved'}`)
  }
  lines.push('', '## Inactive installed bundles', '')
  if (!profile.inactiveBundleDependencies.length) lines.push('No inactive bundle dependencies were detected.')
  for (const bundle of profile.inactiveBundleDependencies) lines.push(`- **${bundle.packageName}** — ${bundle.version ?? 'unknown version'}`)
  if (health) {
    lines.push('', '## Health check', '', `- Runtime validation: **${health.runtime?.ok ? 'passed' : 'failed'}**`)
    for (const finding of health.static?.findings ?? []) lines.push(`- **${finding.severity.toUpperCase()} · ${finding.code}**: ${finding.packageName ?? finding.message ?? ''}`)
    if (health.runtime?.diagnostic) lines.push(`- Diagnostic: ${health.runtime.diagnostic.replace(/\s+/g, ' ').slice(0, 1_000)}`)
  }
  if (audit) {
    lines.push('', '## Plugin audit', '', `- Scanned bundles: **${audit.scans.length}**`, `- Unresolved bundles: **${audit.unresolved.length}**`)
    for (const scan of audit.scans) lines.push(`- **${scan.package ?? scan.pluginPath}**: ${scan.verdict}${Number.isFinite(scan.riskScore) ? ` · risk ${scan.riskScore}/100` : ''}`)
    if (audit.compatibility) lines.push(`- Compatibility: ${JSON.stringify(audit.compatibility.summary)}`)
  }
  lines.push('', '## Privacy', '', 'This report was generated locally. It can contain package names, versions, local-path-derived diagnostics, and profile structure. Review it before sharing.', '')
  return lines.join('\n')
}

export function formatProfileHtml(profile, health = null, audit = null) {
  const bundleRows = profile.bundleDetails.map(bundle => `<tr><td>${bundle.position + 1}</td><td>${escapeHtml(bundle.packageName)}</td><td>${escapeHtml(bundle.version ?? '')}</td><td>${escapeHtml(bundle.resolved ? bundle.source : 'unresolved')}</td></tr>`).join('')
  const inactiveRows = profile.inactiveBundleDependencies.map(bundle => `<li><strong>${escapeHtml(bundle.packageName)}</strong> — ${escapeHtml(bundle.version ?? 'unknown version')}</li>`).join('') || '<li>None detected.</li>'
  const findings = (health?.static?.findings ?? []).map(item => `<li><strong>${escapeHtml(item.severity)} · ${escapeHtml(item.code)}</strong>: ${escapeHtml(item.packageName ?? item.message ?? '')}</li>`).join('') || '<li>No static findings.</li>'
  const scans = (audit?.scans ?? []).map(scan => `<li><strong>${escapeHtml(scan.package ?? scan.pluginPath)}</strong>: ${escapeHtml(scan.verdict)}${Number.isFinite(scan.riskScore) ? ` · risk ${scan.riskScore}/100` : ''}</li>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DSH Profile — ${escapeHtml(profile.name)}</title><style>body{font:16px/1.5 system-ui;max-width:1000px;margin:auto;padding:40px;color:#18212f}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd3dd;padding:8px;text-align:left}code{overflow-wrap:anywhere}.status{font-size:1.25rem}small{color:#536171}</style></head><body><h1>DSH Profile: ${escapeHtml(profile.name)}</h1><p class="status">Health: <strong>${escapeHtml(healthLabel(health))}</strong></p><ul><li>${profile.bundles.length} bundle layers</li><li>${Object.keys(profile.dependencies).length} dependencies</li><li>User patch: ${profile.patch.exists ? `${profile.patch.bytes} bytes` : 'absent'}</li></ul><p><small>State fingerprint: <code>sha256:${escapeHtml(profile.stateHash)}</code></small></p><h2>Ordered bundle layers</h2><table><thead><tr><th>#</th><th>Package</th><th>Version</th><th>Source</th></tr></thead><tbody>${bundleRows}</tbody></table><h2>Inactive installed bundles</h2><ul>${inactiveRows}</ul>${health ? `<h2>Health check</h2><p>Runtime validation: <strong>${health.runtime?.ok ? 'passed' : 'failed'}</strong></p><ul>${findings}</ul>` : ''}${audit ? `<h2>Plugin audit</h2><ul>${scans || '<li>No bundles scanned.</li>'}</ul>` : ''}<h2>Privacy</h2><p>This report was generated locally. Review package names, versions, diagnostics, and profile structure before sharing.</p></body></html>`
}

