function version(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(value).trim())
  if (!match) return null
  return { major: +match[1], minor: +match[2], patch: +match[3], pre: match[4]?.split('.') ?? [] }
}

function completeVersion(value) {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(-[0-9A-Za-z.-]+)?$/.exec(String(value).trim())
  return match ? `${match[1]}.${match[2] ?? 0}.${match[3] ?? 0}${match[4] ?? ''}` : null
}

function compareIdentifier(a, b) {
  const aNumber = /^\d+$/.test(a), bNumber = /^\d+$/.test(b)
  if (aNumber && bNumber) return Number(a) - Number(b)
  if (aNumber !== bNumber) return aNumber ? -1 : 1
  return a.localeCompare(b)
}

export function compareVersions(a, b) {
  a = version(a); b = version(b)
  if (!a || !b) throw new Error('Invalid semantic version')
  for (const key of ['major', 'minor', 'patch']) if (a[key] !== b[key]) return a[key] - b[key]
  if (!a.pre.length || !b.pre.length) return a.pre.length ? -1 : b.pre.length ? 1 : 0
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    if (a.pre[index] === undefined) return -1
    if (b.pre[index] === undefined) return 1
    const compared = compareIdentifier(a.pre[index], b.pre[index])
    if (compared) return compared
  }
  return 0
}

function testComparator(value, operator, target) {
  const result = compareVersions(value, target)
  return operator === '>' ? result > 0 : operator === '>=' ? result >= 0 : operator === '<' ? result < 0 : operator === '<=' ? result <= 0 : result === 0
}

function upperForCaret(parsed) {
  if (parsed.major > 0) return `${parsed.major + 1}.0.0`
  if (parsed.minor > 0) return `0.${parsed.minor + 1}.0`
  return `0.0.${parsed.patch + 1}`
}

function satisfiesSet(value, set) {
  const tokens = set.trim().split(/\s+/).filter(Boolean)
  if (!tokens.length || tokens.includes('*') || tokens.includes('x') || tokens.includes('X')) return true
  return tokens.every(token => {
    if (/^[v\d]/.test(token) && /[xX*]/.test(token)) {
      const parts = token.replace(/^v/, '').split('.')
      const actual = version(value)
      if (!actual) return false
      return parts.every((part, index) => /[xX*]/.test(part) || Number(part) === [actual.major, actual.minor, actual.patch][index])
    }
    if (token.startsWith('^') || token.startsWith('~')) {
      const target = token.slice(1)
      const parsed = version(target)
      if (!parsed) return false
      const upper = token[0] === '^' ? upperForCaret(parsed) : `${parsed.major}.${parsed.minor + 1}.0`
      return testComparator(value, '>=', target) && testComparator(value, '<', upper)
    }
    const match = /^(>=|<=|>|<|=)?(v?\d+(?:\.\d+)?(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?)$/.exec(token)
    const target = match && completeVersion(match[2])
    return target ? testComparator(value, match[1] || '=', target) : false
  })
}

export function satisfiesRange(value, range) {
  if (!version(value) || typeof range !== 'string' || !range.trim()) return null
  try { return range.split('||').some(set => satisfiesSet(value, set)) } catch { return null }
}
