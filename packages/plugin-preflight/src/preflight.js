import { lstat, readFile, readdir } from 'node:fs/promises'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'

const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'])
const CAPABILITIES = [
  ['process-execution', /(?:from\s*|import\s*|require\s*\(\s*)['"](?:node:)?child_process['"]|\bexecSync\s*\(|\bspawnSync\s*\(|\bspawn\s*\(/g, 'high', 'Can start local processes.'],
  ['dynamic-code', /\beval\s*\(|new\s+Function\s*\(/g, 'high', 'Uses dynamic code evaluation.'],
  ['raw-network', /(?:from\s*|import\s*|require\s*\(\s*)['"](?:node:)?(?:net|tls|dgram)['"]|\bcreateConnection\s*\(/g, 'medium', 'Uses low-level network APIs.'],
  ['http-network', /(?:from\s*|import\s*|require\s*\(\s*)['"](?:node:)?(?:http|https)['"]|\bfetch\s*\(/g, 'medium', 'Can make network requests.'],
  ['filesystem-write', /\b(writeFile|appendFile|rm|unlink|rename|chmod|mkdir)(Sync)?\s*\(/g, 'medium', 'Can mutate the filesystem.'],
  ['environment-access', /process\.env\b/g, 'low', 'Reads process environment variables.'],
  ['shell-script', /\bshell\s*:\s*true\b/g, 'high', 'Requests shell command interpretation.'],
]

const NETWORK_DEPENDENCIES = /^(axios|got|undici|node-fetch|playwright|puppeteer|ws|ssh2)$/
const LIFECYCLE = new Set(['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly'])

function finding(severity, code, message, path, evidence) {
  return { severity, code, message, ...(path ? { path } : {}), ...(evidence ? { evidence } : {}) }
}

async function walk(root, maxFiles, maxFileBytes) {
  const files = []
  const symlinks = []
  const queue = [root]
  while (queue.length) {
    const directory = queue.shift()
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'coverage'].includes(entry.name)) continue
      const absolute = join(directory, entry.name)
      const display = relative(root, absolute) || '.'
      const info = await lstat(absolute)
      if (info.isSymbolicLink()) { symlinks.push(display); continue }
      if (info.isDirectory()) { queue.push(absolute); continue }
      if (!info.isFile()) continue
      files.push({ absolute, display, size: info.size, tooLarge: info.size > maxFileBytes })
      if (files.length > maxFiles) throw new Error(`Plugin contains more than ${maxFiles} files (excluded: .git, node_modules, coverage)`)
    }
  }
  return { files, symlinks }
}

function packed(manifest, display) {
  // npm always includes package.json even when a files allowlist is present.
  if (display === 'package.json') return true
  if (!Array.isArray(manifest.files)) return true
  return manifest.files.some(value => display === value || display.startsWith(`${String(value).replace(/\/$/, '')}/`))
}

function parseBundlePatch(text) {
  const inserts = [...text.matchAll(/^\s*-?\s*(?:id|name):\s*['"]?([^'"#\n]+?)['"]?\s*$/gm)]
  const ids = [], names = []
  for (const match of inserts) {
    const line = match[0]
    if (/\bid\s*:/.test(line)) ids.push(match[1].trim())
    if (/\bname\s*:/.test(line)) names.push(match[1].trim())
  }
  return { ids, names, hasInsert: /^\s*-\s*insert\s*:/m.test(text) }
}

function policyFindings(result, policy = {}) {
  const additions = []
  const blocked = new Set(policy.blockedCapabilities ?? [])
  for (const item of result.findings) {
    if (blocked.has(item.code)) additions.push(finding('high', 'policy-blocked-capability', `Organization policy blocks capability ${item.code}.`, item.path, item.evidence))
  }
  const allowedLicenses = Array.isArray(policy.allowedLicenses) ? policy.allowedLicenses : []
  if (allowedLicenses.length && !allowedLicenses.includes(result.license)) {
    additions.push(finding('high', 'policy-license', `License ${result.license ?? '(missing)'} is not in the allowed list.`, 'package.json'))
  }
  const allowedScopes = Array.isArray(policy.allowedPackageScopes) ? policy.allowedPackageScopes : []
  if (allowedScopes.length && result.package && !allowedScopes.some(scope => result.package.startsWith(`${scope}/`))) {
    additions.push(finding('medium', 'policy-package-scope', `Package is outside allowed scopes: ${allowedScopes.join(', ')}.`, 'package.json'))
  }
  if (Number.isFinite(policy.maxRiskScore) && result.riskScore > policy.maxRiskScore) {
    additions.push(finding('high', 'policy-risk-score', `Risk score ${result.riskScore} exceeds policy maximum ${policy.maxRiskScore}.`))
  }
  return additions
}

export async function scanPlugin(inputPath, options = {}) {
  const root = resolve(String(inputPath ?? ''))
  if (!inputPath) throw new Error('path is required')
  const rootInfo = await lstat(root)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('path must be a real directory, not a symlink')
  const maxFiles = Math.trunc(options.maxFiles ?? 1_000)
  const maxFileBytes = Math.trunc(options.maxFileBytes ?? 1_048_576)
  if (maxFiles < 1 || maxFiles > 10_000) throw new Error('maxFiles must be between 1 and 10000')
  if (maxFileBytes < 1_024 || maxFileBytes > 10_485_760) throw new Error('maxFileBytes must be between 1024 and 10485760')
  const { files, symlinks } = await walk(root, maxFiles, maxFileBytes)
  const findings = []
  for (const path of symlinks) findings.push(finding('medium', 'symlink-not-followed', 'Symlink is not scanned or packaged safely by this review.', path))
  const manifestFile = files.find(file => file.display === 'package.json')
  if (!manifestFile) throw new Error('No package.json exists at the plugin root')
  let manifest
  try { manifest = JSON.parse(await readFile(manifestFile.absolute, 'utf8')) } catch { throw new Error('package.json is not valid JSON') }

  if (!manifest.name) findings.push(finding('high', 'missing-name', 'package.json has no package name.', 'package.json'))
  if (manifest.private === true) findings.push(finding('info', 'private-package', 'Package is marked private; local path installation may still work.', 'package.json'))
  const patch = manifest.dsh?.bundle?.patch
  if (typeof patch !== 'string' || !patch.trim()) {
    findings.push(finding('high', 'missing-bundle-patch', 'Manifest does not declare dsh.bundle.patch.', 'package.json'))
  } else {
    const normalized = patch.replace(/^\.\//, '')
    if (normalized.includes('..') || normalized.startsWith(sep)) {
      findings.push(finding('high', 'unsafe-patch-path', 'Bundle patch must stay inside the package.', 'package.json', patch))
    } else if (!files.some(file => file.display === normalized)) {
      findings.push(finding('high', 'patch-not-found', 'Declared bundle patch is absent.', normalized))
    } else if (!packed(manifest, normalized)) {
      findings.push(finding('high', 'patch-not-packed', 'Declared bundle patch is excluded by package.json files.', normalized))
    } else {
      const patchText = await readFile(join(root, normalized), 'utf8')
      const parsedPatch = parseBundlePatch(patchText)
      if (!parsedPatch.hasInsert) findings.push(finding('high', 'patch-no-insert', 'Bundle patch has no top-level insert operation.', normalized))
      if (!parsedPatch.ids.length) findings.push(finding('medium', 'patch-no-id', 'Bundle patch does not declare a plugin row id.', normalized))
      if (!parsedPatch.names.length) findings.push(finding('high', 'patch-no-name', 'Bundle patch does not declare a plugin package name.', normalized))
      if (manifest.name && parsedPatch.names.length && !parsedPatch.names.includes(manifest.name)) {
        findings.push(finding('high', 'patch-name-mismatch', `Bundle patch names ${parsedPatch.names.join(', ')} but package is ${manifest.name}.`, normalized))
      }
    }
  }
  if (!manifest.main && !manifest.exports?.['.'] && typeof manifest.exports !== 'string') {
    findings.push(finding('high', 'missing-entrypoint', 'No main or root export is declared.', 'package.json'))
  }
  if (!manifest.engines?.node) findings.push(finding('low', 'missing-node-engine', 'Node runtime compatibility is not declared.', 'package.json'))
  if (!manifest.license) findings.push(finding('medium', 'missing-license-field', 'No license identifier is declared.', 'package.json'))
  const licenseFile = files.find(file => /^licen[cs]e(?:\.|$)/i.test(basename(file.display)))
  if (!licenseFile) findings.push(finding('medium', 'missing-license-file', 'No license file is included.', '.'))
  else if (!packed(manifest, licenseFile.display)) findings.push(finding('medium', 'license-not-packed', 'License file is excluded from the package.', licenseFile.display))

  for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
    if (LIFECYCLE.has(name)) findings.push(finding('high', 'lifecycle-script', `Package lifecycle script ${name} can run during install/publish.`, 'package.json', String(command).slice(0, 240)))
  }
  for (const section of ['dependencies', 'optionalDependencies']) {
    for (const dependency of Object.keys(manifest[section] ?? {})) {
      if (NETWORK_DEPENDENCIES.test(dependency)) findings.push(finding('low', 'network-dependency', `Dependency ${dependency} commonly enables network/browser access.`, 'package.json'))
    }
  }

  for (const file of files) {
    if (file.tooLarge) {
      findings.push(finding('medium', 'file-not-scanned', `File exceeds ${maxFileBytes} bytes and capability scanning was skipped.`, file.display))
      continue
    }
    if (!packed(manifest, file.display) || !CODE_EXTENSIONS.has(extname(file.display).toLowerCase())) continue
    const text = await readFile(file.absolute, 'utf8')
    for (const [code, pattern, severity, message] of CAPABILITIES) {
      pattern.lastIndex = 0
      const match = pattern.exec(text)
      if (match) findings.push(finding(severity, code, message, file.display, match[0].slice(0, 160)))
    }
  }
  const weights = { high: 25, medium: 10, low: 3, info: 0 }
  const packedFiles = files.filter(file => packed(manifest, file.display)).sort((a, b) => a.display.localeCompare(b.display))
  const fingerprint = createHash('sha256')
  for (const file of packedFiles) {
    fingerprint.update(file.display).update('\0').update(await readFile(file.absolute)).update('\0')
  }
  const dependencies = []
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, range] of Object.entries(manifest[section] ?? {})) dependencies.push({ name, range, section })
  }
  let riskScore = Math.min(100, findings.reduce((sum, item) => sum + weights[item.severity], 0))
  const base = {
    pluginPath: root, package: manifest.name ?? null, version: manifest.version ?? null, license: manifest.license ?? null,
    fingerprint: `sha256:${fingerprint.digest('hex')}`, sbom: { format: 'dsh-toolbox-sbom/v1', dependencies },
    findings, scannedFiles: files.length, packedFiles: packedFiles.length, skippedSymlinks: symlinks.length, riskScore,
  }
  findings.push(...policyFindings(base, options.policy))
  riskScore = Math.min(100, findings.reduce((sum, item) => sum + weights[item.severity], 0))
  const summary = Object.fromEntries(['high', 'medium', 'low', 'info'].map(severity => [severity, findings.filter(item => item.severity === severity).length]))
  const verdict = summary.high ? 'review-required' : summary.medium ? 'caution' : 'no-blocking-findings'
  const result = {
    ...base, riskScore, verdict, summary,
    findings, limitations: ['Static heuristics can miss obfuscated or transitive behavior.', 'Dependencies were not downloaded or executed.', 'This is not a sandbox or a security guarantee.'],
  }
  return { ...result, markdown: formatPreflightMarkdown(result) }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

export function formatPreflightHtml(result) {
  const rows = result.findings.map(item => `<tr><td>${escapeHtml(item.severity)}</td><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.path ?? '')}</td><td>${escapeHtml(item.message)}</td></tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Plugin Preflight — ${escapeHtml(result.package ?? 'unknown')}</title><style>body{font:16px/1.5 system-ui;max-width:1000px;margin:auto;padding:40px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px;text-align:left}code{overflow-wrap:anywhere}</style></head><body><h1>Plugin Preflight: ${escapeHtml(result.package ?? 'unknown')}</h1><p><strong>${escapeHtml(result.verdict)}</strong> · risk ${result.riskScore}/100</p><p>Fingerprint: <code>${result.fingerprint}</code></p><table><thead><tr><th>Severity</th><th>Code</th><th>Path</th><th>Finding</th></tr></thead><tbody>${rows}</tbody></table><h2>SBOM</h2><pre>${escapeHtml(JSON.stringify(result.sbom, null, 2))}</pre></body></html>`
}

export function formatPreflightMarkdown(result) {
  const lines = [`# Plugin Preflight: ${result.package ?? basename(result.pluginPath)}`, '',
    `- Verdict: **${result.verdict}**`, `- Risk score: **${result.riskScore}/100**`,
    `- Scanned files: ${result.scannedFiles}`, '', '## Findings', '']
  if (!result.findings.length) lines.push('No heuristic findings.')
  for (const item of result.findings) lines.push(`- **${item.severity.toUpperCase()} · ${item.code}**${item.path ? ` · \`${item.path}\`` : ''}: ${item.message}`)
  lines.push('', '## Limits', '', ...result.limitations.map(value => `- ${value}`), '')
  return lines.join('\n')
}
