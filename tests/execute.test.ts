import { expect, test } from 'vitest'
import { executeApprovedOperation, isOperationAllowed } from '../src/execute.js'
import type { PendingOperation, RepoContext } from '../src/types.js'

const baseContext: RepoContext = {
  owner: 'octo',
  repo: 'repo',
  eventName: 'issue_comment',
  commentBody: '/ai approve',
  commentAuthor: 'maintainer',
  issueNumber: 42,
  issueState: 'open',
  warnings: [],
  pullRequest: {
    number: 42,
    title: 'Fix bug',
    body: 'Fixes a bug',
    headOwner: 'octo',
    headRepo: 'repo',
    headBranch: 'feature',
    headSha: 'abc',
    baseBranch: 'main',
    changedFiles: [],
  },
}

test('isOperationAllowed checks allowlist membership', () => {
  expect(isOperationAllowed('add-labels', ['add-labels', 'close-item'])).toBe(true)
  expect(isOperationAllowed('request-reviewers', ['add-labels', 'close-item'])).toBe(false)
})

test('executeApprovedOperation adds labels', async () => {
  const calls: string[] = []
  const octokit = {
    rest: {
      issues: {
        addLabels: async (_args: unknown) => {
          calls.push('issues.addLabels')
          return {}
        },
      },
    },
  }

  const operation: PendingOperation = {
    id: 'op_1',
    kind: 'add-labels',
    issueNumber: 42,
    owner: 'octo',
    repo: 'repo',
    requestedBy: 'alice',
    requestedAt: new Date().toISOString(),
    task: 'Add labels',
    args: { labels: ['bug', 'needs-review'] },
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  }

  const result = await executeApprovedOperation({
    octokit: octokit as never,
    operation,
    context: baseContext,
    allowedOperations: ['add-labels'],
  })

  expect(calls).toEqual(['issues.addLabels'])
  expect(result).toMatch(/Applied labels/)
})

test('executeApprovedOperation requests reviewers on pull requests', async () => {
  const calls: string[] = []
  const octokit = {
    rest: {
      pulls: {
        requestReviewers: async (_args: unknown) => {
          calls.push('pulls.requestReviewers')
          return {}
        },
      },
    },
  }

  const operation: PendingOperation = {
    id: 'op_2',
    kind: 'request-reviewers',
    issueNumber: 42,
    owner: 'octo',
    repo: 'repo',
    requestedBy: 'alice',
    requestedAt: new Date().toISOString(),
    task: 'Request reviewers',
    args: { reviewers: ['alice', 'bob'] },
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  }

  const result = await executeApprovedOperation({
    octokit: octokit as never,
    operation,
    context: baseContext,
    allowedOperations: ['request-reviewers'],
  })

  expect(calls).toEqual(['pulls.requestReviewers'])
  expect(result).toMatch(/Requested reviewers/)
})

test('executeApprovedOperation rejects disallowed operations', async () => {
  const operation: PendingOperation = {
    id: 'op_3',
    kind: 'close-item',
    issueNumber: 42,
    owner: 'octo',
    repo: 'repo',
    requestedBy: 'alice',
    requestedAt: new Date().toISOString(),
    task: 'Close issue',
    args: {},
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  }

  await expect(
    executeApprovedOperation({
      octokit: {} as never,
      operation,
      context: baseContext,
      allowedOperations: ['add-labels'],
    }),
  ).rejects.toThrow(/not allowed/)
})
