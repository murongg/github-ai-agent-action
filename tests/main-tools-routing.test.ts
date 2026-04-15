import { expect, test, vi } from 'vitest'
import { generateReadCommandReply } from '../src/main.js'
import type { AgentCommand, RepoContext } from '../src/types.js'

const repoContext: RepoContext = {
  owner: 'octo',
  repo: 'repo',
  eventName: 'issue_comment',
  commentBody: '/ai review',
  commentAuthor: 'alice',
  issueNumber: 42,
  issueState: 'open',
  pullRequest: {
    number: 42,
    title: 'Fix bug',
    body: 'Fixes a bug',
    headOwner: 'octo',
    headRepo: 'repo',
    headBranch: 'feature',
    headSha: 'abc123',
    baseBranch: 'main',
    changedFiles: [],
  },
  warnings: [],
}

test('non-approve commands use the tool-enabled agent path', async () => {
  const runToolEnabledAgent = vi.fn().mockResolvedValue({
    body: 'review reply',
    toolTrace: [{ name: 'list_pr_files', cacheHit: false }],
  })

  const result = await generateReadCommandReply({
    command: { mode: 'review', rawBody: '/ai review', text: '' },
    repoContext,
    inputs: {
      model: 'gpt-5.4-mini',
      maxDiffChars: 100,
      maxLogChars: 200,
      enableWriteActions: false,
      allowedOperations: ['add-labels'],
    },
    octokit: { rest: {} } as never,
    client: { responses: { create: vi.fn() } } as never,
    runToolEnabledAgent,
  })

  expect(runToolEnabledAgent).toHaveBeenCalledOnce()
  expect(result).toEqual({ body: 'review reply' })
})

test('plan mode still infers a pending operation after the tool-enabled reply', async () => {
  const command: AgentCommand = {
    mode: 'plan',
    rawBody: '/ai plan add labels bug',
    text: 'add labels bug',
  }
  const runToolEnabledAgent = vi.fn().mockResolvedValue({
    body: 'Plan reply.',
    toolTrace: [],
  })

  const result = await generateReadCommandReply({
    command,
    repoContext,
    inputs: {
      model: 'gpt-5.4-mini',
      maxDiffChars: 100,
      maxLogChars: 200,
      enableWriteActions: true,
      allowedOperations: ['add-labels'],
    },
    octokit: { rest: {} } as never,
    client: { responses: { create: vi.fn() } } as never,
    runToolEnabledAgent,
  })

  expect(result.pendingOperation).toMatchObject({
    kind: 'add-labels',
    args: { labels: ['bug'] },
  })
  expect(result.body).toMatch(/Approved operation available/)
})
