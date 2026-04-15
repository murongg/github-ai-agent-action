import type { AgentCommand, AgentMode } from './types.js'

const explicitModes = new Set<AgentMode>(['diagnose-ci', 'review', 'explain', 'plan', 'approve'])

export function parseCommand(body: string): AgentCommand | undefined {
  const rawBody = body.trim()
  if (!rawBody.startsWith('/ai')) return undefined

  const rest = rawBody.slice(3).trim()
  if (!rest) {
    return { mode: 'conversation', rawBody, text: '' }
  }

  const [first, ...remaining] = rest.split(/\s+/)
  if (first && explicitModes.has(first as AgentMode)) {
    return {
      mode: first as AgentMode,
      rawBody,
      text: remaining.join(' '),
    }
  }

  return {
    mode: 'conversation',
    rawBody,
    text: rest,
  }
}
