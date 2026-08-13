import { createHash } from 'node:crypto'
import { fetchPublicText } from './network.js'

const ENTITIES = new Map([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"], ['nbsp', ' '],
])

function decodeEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (_match, entity) => {
    if (entity[0] === '#') {
      const codePoint = entity[1].toLowerCase() === 'x'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10)
      return Number.isSafeInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : ' '
    }
    return ENTITIES.get(entity.toLowerCase()) ?? ' '
  })
}

function clean(value) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function htmlToText(html) {
  return clean(decodeEntities(html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|canvas|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|article|section|main|header|footer|aside|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')))
}

export function htmlTitle(html) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  return match ? clean(decodeEntities(match[1].replace(/<[^>]+>/g, ' '))).slice(0, 200) : ''
}

export function digestContent(content) {
  return createHash('sha256').update(content).digest('hex')
}

export function importTextSource({ title, text, maxSourceBytes }) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Text source cannot be empty')
  if (Buffer.byteLength(text, 'utf8') > maxSourceBytes) {
    throw new Error(`Text source exceeds ${maxSourceBytes} bytes`)
  }
  const content = clean(text)
  return {
    kind: 'text',
    title: (title?.trim() || 'Pasted text').slice(0, 200),
    locator: null,
    content,
    contentSha256: digestContent(content),
    metadata: { importedAs: 'text', bytes: Buffer.byteLength(content, 'utf8') },
  }
}

export async function importUrlSource({ url, title, config, signal }) {
  const response = await fetchPublicText(url, config, signal)
  const isHtml = /html|xhtml/.test(response.contentType)
  const content = isHtml ? htmlToText(response.body) : clean(response.body)
  if (!content) throw new Error('URL did not contain extractable text')
  return {
    kind: 'url',
    title: (title?.trim() || (isHtml ? htmlTitle(response.body) : '') || new URL(response.finalUrl).hostname).slice(0, 200),
    locator: response.finalUrl,
    content,
    contentSha256: digestContent(content),
    metadata: {
      importedAs: 'url',
      contentType: response.contentType,
      httpStatus: response.status,
      bytes: Buffer.byteLength(content, 'utf8'),
    },
  }
}
