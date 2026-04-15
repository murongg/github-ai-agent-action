import { expect, test } from 'vitest'
import { allowedOperationKinds } from '../src/types.js'
import type { AgentCommand, PendingOperation } from '../src/types.js'

test('shared types represent command and pending operation shape', () => {
  const command: AgentCommand = {
    mode: 'plan',
    rawBody: '/ai plan add validation',
    text: 'add validation',
  }

  const operation: PendingOperation = {
    id: 'op_123',
    kind: 'add-labels',
    issueNumber: 42,
    owner: 'octo',
    repo: 'repo',
    requestedBy: 'alice',
    requestedAt: '2026-04-14T23:00:00.000Z',
    task: 'add validation',
    args: {
      labels: ['bug'],
    },
    expiresAt: '2026-04-15T23:00:00.000Z',
  }

  expect(command.mode).toBe('plan')
  expect(operation.kind).toBe('add-labels')
  expect(operation.args.labels).toEqual(['bug'])
  expect(allowedOperationKinds).toContain('add-labels')
})
