import { expect, test } from 'vitest'
import { createPendingMarker } from '../src/pending.js'
import { buildUnauthorizedReply, findLatestPendingOperationBody } from '../src/main.js'

test('buildUnauthorizedReply explains allow policy', () => {
  const reply = buildUnauthorizedReply('/ai review')
  expect(reply).toMatch(/not authorized/i)
  expect(reply).toMatch(/\/ai review/)
})

test('findLatestPendingOperationBody returns most recent valid marker body', () => {
  const marker1 = createPendingMarker({
    id: 'op_1',
    kind: 'add-labels',
    issueNumber: 42,
    owner: 'octo',
    repo: 'repo',
    requestedBy: 'alice',
    requestedAt: new Date().toISOString(),
    task: 'add labels',
    args: { labels: ['bug'] },
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  }, 'secret')
  const marker2 = createPendingMarker({
    id: 'op_2',
    kind: 'close-item',
    issueNumber: 42,
    owner: 'octo',
    repo: 'repo',
    requestedBy: 'alice',
    requestedAt: new Date().toISOString(),
    task: 'close item',
    args: {},
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  }, 'secret')

  const latest = findLatestPendingOperationBody([
    { body: `older\n\n${marker1}` },
    { body: 'plain comment' },
    { body: `newer\n\n${marker2}` },
  ], 'secret')

  expect(latest?.id).toBe('op_2')
  const specific = findLatestPendingOperationBody([
    { body: `older\n\n${marker1}` },
    { body: `newer\n\n${marker2}` },
  ], 'secret', 'op_1')
  expect(specific?.id).toBe('op_1')
})
