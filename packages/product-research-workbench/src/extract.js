import { randomUUID } from 'node:crypto'

const CATEGORIES = [
  ['cost', ['expensive', 'cost', 'price', 'pricing', '收费', '太贵', '成本', '付费']],
  ['performance', ['slow', 'latency', 'lag', 'timeout', '卡顿', '很慢', '延迟', '超时']],
  ['reliability', ['bug', 'broken', 'crash', 'error', 'fail', 'unstable', '崩溃', '报错', '失败', '不稳定', '丢失']],
  ['workflow', ['manual', 'repetitive', 'copy', 'paste', 'steps', '手动', '重复', '复制', '粘贴', '步骤', '来回切换']],
  ['integration', ['integrate', 'integration', 'sync', 'export', 'import', '兼容', '集成', '同步', '导出', '导入']],
  ['usability', ['confusing', 'difficult', 'hard to', 'unclear', 'complex', '难用', '麻烦', '复杂', '不清楚', '找不到']],
  ['privacy', ['privacy', 'security', 'permission', 'tracking', '隐私', '安全', '权限', '追踪', '泄露']],
  ['collaboration', ['team', 'share', 'review', 'comment', '协作', '团队', '分享', '评审', '评论']],
  ['discovery', ['search', 'find', 'discover', '搜索', '检索', '查找', '发现']],
]

const PAIN_SIGNALS = [
  'problem', 'pain', 'frustrat', 'annoy', 'hate', 'wish', 'cannot', "can't", 'unable',
  'difficult', 'hard', 'slow', 'expensive', 'bug', 'broken', 'manual', 'waste', 'missing',
  '问题', '痛点', '困扰', '麻烦', '讨厌', '希望', '无法', '不能', '困难', '很难', '太慢',
  '太贵', '报错', '崩溃', '手动', '浪费', '缺少', '不支持', '不好用', '来回切换',
]

const HIGH_INTENSITY = ['always', 'never', 'critical', 'terrible', 'hate', 'blocked', '崩溃', '严重', '完全', '根本', '每次', '总是']
const MEDIUM_INTENSITY = ['often', 'frequently', 'annoy', 'difficult', 'slow', '经常', '麻烦', '困难', '很慢', '反复']

function splitSentences(text) {
  return text
    .split(/(?<=[。！？!?])\s*|\n+|(?<=[.!?])\s+(?=[A-Z0-9])/u)
    .map(value => value.replace(/\s+/g, ' ').trim())
    .filter(value => value.length >= 12)
}

function categoryFor(lower) {
  for (const [category, keywords] of CATEGORIES) {
    if (keywords.some(keyword => lower.includes(keyword))) return { category, tags: keywords.filter(keyword => lower.includes(keyword)).slice(0, 5) }
  }
  return { category: 'other', tags: [] }
}

function intensityFor(lower) {
  if (HIGH_INTENSITY.some(signal => lower.includes(signal))) return 5
  if (MEDIUM_INTENSITY.some(signal => lower.includes(signal))) return 4
  return 3
}

function compactQuote(value, max = 420) {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`
}

export function extractEvidence(sources, limit = 120) {
  const cards = []
  const seen = new Set()
  for (const source of sources) {
    for (const sentence of splitSentences(source.content)) {
      const lower = sentence.toLocaleLowerCase()
      if (!PAIN_SIGNALS.some(signal => lower.includes(signal))) continue
      const key = lower.replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 240)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const { category, tags } = categoryFor(lower)
      const quote = compactQuote(sentence)
      cards.push({
        id: randomUUID(),
        sourceId: source.id,
        category,
        quote,
        summary: compactQuote(sentence, 180),
        intensity: intensityFor(lower),
        confidence: Math.min(0.95, 0.58 + Math.min(3, tags.length) * 0.08 + (quote.length >= 30 ? 0.08 : 0)),
        tags,
      })
      if (cards.length >= limit) return cards
    }
  }
  return cards
}
