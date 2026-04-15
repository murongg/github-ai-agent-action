import * as core from '@actions/core'
import { allowedOperationKinds, type ActionInputs, type OperationKind } from './types.js'

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseBoolean(value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return fallback
  if (['true', '1', 'yes'].includes(normalized)) return true
  if (['false', '0', 'no'].includes(normalized)) return false
  throw new Error(`Invalid boolean value: ${value}`)
}

function parsePositiveInt(value: string, fallback: number): number {
  const trimmed = value.trim()
  if (!trimmed) return fallback
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed) || String(parsed) !== trimmed || parsed <= 0) {
    throw new Error(`Expected positive integer, got: ${value}`)
  }
  return parsed
}

function parseAllowedOperations(value: string): OperationKind[] {
  const configured = splitCsv(value)
  if (configured.length === 0) return [...allowedOperationKinds]
  const allowed = new Set(allowedOperationKinds)
  const invalid = configured.filter((item) => !allowed.has(item as OperationKind))
  if (invalid.length > 0) {
    throw new Error(`Unsupported allowed-operations values: ${invalid.join(', ')}`)
  }
  return configured as OperationKind[]
}

export function parseInputsFromObject(values: Record<string, string>): ActionInputs {
  const openaiApiKey = values['openai-api-key']?.trim() ?? ''
  const githubToken = values['github-token']?.trim() ?? ''
  if (!openaiApiKey) throw new Error('openai-api-key is required')
  if (!githubToken) throw new Error('github-token is required')

  return {
    openaiApiKey,
    githubToken,
    model: values.model?.trim() || 'gpt-5.4-mini',
    allowUsers: splitCsv(values['allow-users'] ?? ''),
    allowAssociations: splitCsv(values['allow-associations'] ?? '').length > 0
      ? splitCsv(values['allow-associations'] ?? '')
      : ['OWNER', 'MEMBER', 'COLLABORATOR'],
    enableWriteActions: parseBoolean(values['enable-write-actions'] ?? '', false),
    maxDiffChars: parsePositiveInt(values['max-diff-chars'] ?? '', 60000),
    maxLogChars: parsePositiveInt(values['max-log-chars'] ?? '', 60000),
    allowedOperations: parseAllowedOperations(values['allowed-operations'] ?? ''),
  }
}

export function readInputs(): ActionInputs {
  return parseInputsFromObject({
    'openai-api-key': core.getInput('openai-api-key', { required: true }),
    'github-token': core.getInput('github-token', { required: true }),
    model: core.getInput('model'),
    'allow-users': core.getInput('allow-users'),
    'allow-associations': core.getInput('allow-associations'),
    'enable-write-actions': core.getInput('enable-write-actions'),
    'max-diff-chars': core.getInput('max-diff-chars'),
    'max-log-chars': core.getInput('max-log-chars'),
    'allowed-operations': core.getInput('allowed-operations'),
  })
}
