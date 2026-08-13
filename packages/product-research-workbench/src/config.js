import { homedir } from 'node:os'
import { resolve } from 'node:path'

export const DEFAULTS = Object.freeze({
  timeoutMs: 15_000,
  maxSourceBytes: 1_048_576,
  maxRedirects: 3,
  maxEvidenceCards: 120,
  allowPrivateNetwork: false,
})

export function normalizeConfig(input = {}) {
  const config = {
    dataDir: resolve(input.dataDir ?? `${homedir()}/.local/share/dsh-toolbox/product-research-workbench`),
    timeoutMs: input.timeoutMs ?? DEFAULTS.timeoutMs,
    maxSourceBytes: input.maxSourceBytes ?? DEFAULTS.maxSourceBytes,
    maxRedirects: input.maxRedirects ?? DEFAULTS.maxRedirects,
    maxEvidenceCards: input.maxEvidenceCards ?? DEFAULTS.maxEvidenceCards,
    allowPrivateNetwork: input.allowPrivateNetwork ?? DEFAULTS.allowPrivateNetwork,
  }

  for (const [key, min, max] of [
    ['timeoutMs', 1_000, 120_000],
    ['maxSourceBytes', 1_024, 10_485_760],
    ['maxRedirects', 0, 10],
    ['maxEvidenceCards', 1, 500],
  ]) {
    if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) {
      throw new Error(`${key} must be an integer between ${min} and ${max}`)
    }
  }
  if (typeof config.allowPrivateNetwork !== 'boolean') {
    throw new Error('allowPrivateNetwork must be a boolean')
  }
  return Object.freeze(config)
}
