import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import http from 'node:http'
import https from 'node:https'

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.google',
  'instance-data',
])

function ipv4Number(address) {
  const parts = address.split('.').map(Number)
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0
}

function inV4Range(address, base, prefix) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (ipv4Number(address) & mask) === (ipv4Number(base) & mask)
}

export function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const blocked = [
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
      ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
      ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
      ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
    ]
    return !blocked.some(([base, prefix]) => inV4Range(address, base, prefix))
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase().split('%')[0]
    if (value === '::' || value === '::1') return false
    if (value.startsWith('::ffff:')) {
      const mapped = value.slice(7)
      return isIP(mapped) === 4 && isPublicAddress(mapped)
    }
    if (/^f[cd]/.test(value) || /^fe[89ab]/.test(value) || value.startsWith('ff')) return false
    if (value.startsWith('2001:db8:') || value === '2001:db8::') return false
    return true
  }
  return false
}

async function resolvePublic(hostname, allowPrivateNetwork) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!allowPrivateNetwork && (BLOCKED_HOSTS.has(normalized) || normalized.endsWith('.localhost'))) {
    throw new Error(`Blocked non-public hostname: ${hostname}`)
  }
  const literalFamily = isIP(normalized)
  const records = literalFamily
    ? [{ address: normalized, family: literalFamily }]
    : await lookup(normalized, { all: true, verbatim: true })
  if (records.length === 0) throw new Error(`No DNS address found for ${hostname}`)
  if (!allowPrivateNetwork && records.some(record => !isPublicAddress(record.address))) {
    throw new Error(`Blocked non-public network destination: ${hostname}`)
  }
  return records[0]
}

export async function assertSafeUrl(value, allowPrivateNetwork = false) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('URL source must be a valid absolute URL')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http and https URL sources are supported')
  if (url.username || url.password) throw new Error('URLs containing credentials are not allowed')
  if (!url.hostname) throw new Error('URL source needs a hostname')
  const address = await resolvePublic(url.hostname, allowPrivateNetwork)
  return { url, address }
}

function requestOnce(url, address, options, signal) {
  const transport = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      callback(value)
    }
    const request = transport.request(url, {
      method: 'GET',
      headers: {
        accept: 'text/html, text/plain;q=0.9, application/json;q=0.7',
        'accept-encoding': 'identity',
        'user-agent': 'dsh-toolbox-product-research-workbench/0.1 (+https://github.com/HiWhaleW/dsh-toolbox)',
      },
      lookup: (_hostname, lookupOptions, callback) => lookupOptions?.all
        ? callback(null, [address])
        : callback(null, address.address, address.family),
      signal,
    }, response => finish(resolve, response))
    request.setTimeout(options.timeoutMs, () => request.destroy(new Error(`URL request exceeded ${options.timeoutMs}ms`)))
    request.on('error', error => finish(reject, error))
    request.end()
  })
}

async function readLimited(response, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of response) {
    size += chunk.length
    if (size > maxBytes) {
      response.destroy()
      throw new Error(`URL response exceeds ${maxBytes} bytes`)
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function fetchPublicText(input, options, signal) {
  let current = input
  for (let redirect = 0; redirect <= options.maxRedirects; redirect += 1) {
    const { url, address } = await assertSafeUrl(current, options.allowPrivateNetwork)
    const response = await requestOnce(url, address, options, signal)
    const status = response.statusCode ?? 0
    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = response.headers.location
      response.resume()
      if (!location) throw new Error(`Redirect from ${url.href} has no Location header`)
      if (redirect === options.maxRedirects) throw new Error(`URL exceeded ${options.maxRedirects} redirects`)
      current = new URL(location, url).href
      continue
    }
    if (status < 200 || status >= 300) {
      response.resume()
      throw new Error(`URL returned HTTP ${status}`)
    }
    const contentType = String(response.headers['content-type'] ?? 'text/plain').toLowerCase()
    if (!/text\/(html|plain|markdown)|application\/(json|xhtml\+xml)/.test(contentType)) {
      response.resume()
      throw new Error(`Unsupported URL content type: ${contentType.split(';')[0]}`)
    }
    const declaredLength = Number(response.headers['content-length'])
    if (Number.isFinite(declaredLength) && declaredLength > options.maxSourceBytes) {
      response.resume()
      throw new Error(`URL response exceeds ${options.maxSourceBytes} bytes`)
    }
    return {
      finalUrl: url.href,
      contentType,
      body: await readLimited(response, options.maxSourceBytes),
      status,
    }
  }
  throw new Error('URL redirect handling failed')
}
