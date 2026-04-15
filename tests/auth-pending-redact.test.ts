import { expect, test } from 'vitest'
import { canApprove, canTriggerReadCommand } from '../src/auth.js'
import { createPendingMarker, parsePendingMarker } from '../src/pending.js'
import { redactText } from '../src/redact.js'

test('authorization allows explicit users and configured associations', () => {
  expect(canTriggerReadCommand({ actor: 'alice', association: 'CONTRIBUTOR', allowUsers: ['alice'], allowAssociations: [] })).toBe(true)
  expect(canTriggerReadCommand({ actor: 'mallory', association: 'CONTRIBUTOR', allowUsers: [], allowAssociations: ['OWNER'] })).toBe(false)
  expect(canApprove({ actor: 'maintainer', association: 'OWNER', allowUsers: [], allowAssociations: ['OWNER'], isPrAuthorOnSameRepoItem: false })).toBe(true)
  expect(canApprove({ actor: 'author', association: 'CONTRIBUTOR', allowUsers: [], allowAssociations: [], isPrAuthorOnSameRepoItem: true })).toBe(true)
})

test('pending marker round-trips with signature', () => {
  const operation = {
    id: 'op_123',
    kind: 'add-labels' as const,
    issueNumber: 5,
    owner: 'octo',
    repo: 'repo',
    requestedBy: 'alice',
    requestedAt: new Date().toISOString(),
    task: 'add labels',
    args: { labels: ['bug'] },
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  }

  const marker = createPendingMarker(operation, 'secret')
  const parsed = parsePendingMarker(marker, 'secret')
  expect(parsed?.id).toBe(operation.id)
  const tampered = marker.replace(/.$/, marker.endsWith('a') ? 'b' : 'a')
  expect(parsePendingMarker(tampered, 'secret')).toBeUndefined()
})

test('redactText masks common secrets', () => {
  const output = redactText('Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz123456\nOPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890')
  expect(output).not.toMatch(/ghp_/)
  expect(output).not.toMatch(/sk-proj-/)
})
