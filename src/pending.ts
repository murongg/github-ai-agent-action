import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { PendingOperation } from './types.js'

const markerPrefix = '<!-- github-ai-agent-action:pending '
const markerSuffix = ' -->'

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createOperationId(): string {
  return `op_${randomUUID()}`
}

export function createPendingMarker(operation: PendingOperation, secret: string): string {
  const payload = Buffer.from(JSON.stringify(operation), 'utf8').toString('base64url')
  const signature = sign(payload, secret)
  return `${markerPrefix}${payload}.${signature}${markerSuffix}`
}

export function parsePendingMarker(body: string, secret: string, now = new Date()): PendingOperation | undefined {
  const start = body.indexOf(markerPrefix)
  if (start < 0) return undefined
  const end = body.indexOf(markerSuffix, start)
  if (end < 0) return undefined

  const token = body.slice(start + markerPrefix.length, end)
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return undefined

  const expected = sign(payload, secret)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return undefined
  }

  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as PendingOperation
  if (new Date(parsed.expiresAt).getTime() <= now.getTime()) return undefined
  return parsed
}
