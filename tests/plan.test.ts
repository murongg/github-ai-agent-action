import { expect, test } from 'vitest'
import { inferPendingOperationFromPlanText } from '../src/plan.js'
import type { RepoContext } from '../src/types.js'

const baseContext: RepoContext = {
  owner: 'octo',
  repo: 'repo',
  eventName: 'issue_comment',
  commentBody: '/ai plan add labels bug',
  commentAuthor: 'alice',
  issueNumber: 42,
  issueState: 'open',
  pullRequest: {
    number: 42,
    title: 'Fix bug',
    body: 'Fix bug',
    headOwner: 'octo',
    headRepo: 'repo',
    headBranch: 'feature',
    headSha: 'abc',
    baseBranch: 'main',
    changedFiles: [],
  },
  recentWorkflowRuns: [
    { id: 101, name: 'CI', conclusion: 'failure', htmlUrl: 'https://example.com/run/101' },
  ],
  warnings: [],
}

test('inferPendingOperationFromPlanText infers add-labels', () => {
  const operation = inferPendingOperationFromPlanText({
    text: 'add labels bug, needs-review',
    context: baseContext,
    requestedBy: 'alice',
    now: new Date('2026-04-14T15:00:00.000Z'),
    createId: () => 'op_fixed',
  })

  expect(operation).toMatchObject({
    kind: 'add-labels',
    args: { labels: ['bug', 'needs-review'] },
  })
})

test('inferPendingOperationFromPlanText infers request-reviewers for PRs', () => {
  const operation = inferPendingOperationFromPlanText({
    text: 'request reviewers alice, bob',
    context: baseContext,
    requestedBy: 'alice',
    now: new Date('2026-04-14T15:00:00.000Z'),
    createId: () => 'op_fixed',
  })

  expect(operation).toMatchObject({
    kind: 'request-reviewers',
    args: { reviewers: ['alice', 'bob'] },
  })
})

test('inferPendingOperationFromPlanText infers rerun-workflow from latest run', () => {
  const operation = inferPendingOperationFromPlanText({
    text: 'rerun workflow',
    context: baseContext,
    requestedBy: 'alice',
    now: new Date('2026-04-14T15:00:00.000Z'),
    createId: () => 'op_fixed',
  })

  expect(operation).toMatchObject({
    kind: 'rerun-workflow',
    args: { runId: 101 },
  })
})

test('inferPendingOperationFromPlanText returns undefined for unsupported plans', () => {
  const operation = inferPendingOperationFromPlanText({
    text: 'refactor the login flow',
    context: baseContext,
    requestedBy: 'alice',
    now: new Date('2026-04-14T15:00:00.000Z'),
    createId: () => 'op_fixed',
  })

  expect(operation).toBeUndefined()
})
