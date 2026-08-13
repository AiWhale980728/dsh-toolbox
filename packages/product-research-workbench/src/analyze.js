import { randomUUID } from 'node:crypto'

const LABELS = {
  cost: ['Cost and pricing friction', 'Reduce cost uncertainty'],
  performance: ['Performance and latency', 'Make the workflow feel immediate'],
  reliability: ['Reliability and data loss', 'Build a dependable recovery path'],
  workflow: ['Manual and repetitive workflow', 'Automate repeated research work'],
  integration: ['Integration and portability gaps', 'Connect the missing handoffs'],
  usability: ['Usability and complexity', 'Shorten time to a confident result'],
  privacy: ['Privacy and permission concerns', 'Make data handling inspectable'],
  collaboration: ['Collaboration and review friction', 'Create a shared review loop'],
  discovery: ['Search and discovery friction', 'Improve evidence retrieval'],
  other: ['Unclassified recurring friction', 'Resolve the recurring unmet need'],
}

const EFFORT = { workflow: 2, discovery: 2, usability: 2, cost: 2.5, collaboration: 3, privacy: 3, performance: 3.5, integration: 4, reliability: 4, other: 3 }

function round(value, digits = 2) {
  return Number(value.toFixed(digits))
}

export function analyzeEvidence(evidence, sources) {
  if (evidence.length === 0) throw new Error('No evidence cards exist; run research_extract after importing pain-oriented source text')
  const sourceTotal = Math.max(1, sources.length)
  const grouped = Map.groupBy(evidence, card => card.category)
  return [...grouped.entries()].map(([category, cards]) => {
    const sourceCount = new Set(cards.map(card => card.sourceId)).size
    const severity = cards.reduce((sum, card) => sum + card.intensity, 0) / (cards.length * 5)
    const frequency = cards.length / evidence.length
    const confidence = cards.reduce((sum, card) => sum + card.confidence, 0) / cards.length
    const reach = sourceCount / sourceTotal
    const impact = 1 + severity * 2
    const effort = EFFORT[category] ?? EFFORT.other
    const score = (reach * impact * confidence * 10) / effort
    const [label, title] = LABELS[category] ?? LABELS.other
    const example = cards.slice().sort((a, b) => b.intensity - a.intensity)[0]
    return {
      id: randomUUID(),
      label,
      pain: example.summary,
      evidenceCount: cards.length,
      sourceCount,
      severity: round(severity),
      frequency: round(frequency),
      confidence: round(confidence),
      opportunity: {
        id: randomUUID(),
        title,
        problem: `${label} appears in ${cards.length} evidence card(s) across ${sourceCount} source(s).`,
        reach: round(reach),
        impact: round(impact),
        confidence: round(confidence),
        effort,
        score: round(score),
        rationale: `Transparent RICE-style score = source reach × impact × evidence confidence × 10 ÷ estimated effort.`,
      },
    }
  }).sort((a, b) => b.opportunity.score - a.opportunity.score)
}
