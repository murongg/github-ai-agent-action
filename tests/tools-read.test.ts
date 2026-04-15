import { expect, test, vi } from 'vitest'
import { createToolBudget, createWorkflowRunAccessRegistry } from '../src/tools/budget.js'
import { getToolsForMode, parseToolArguments } from '../src/tools/definitions.js'
import { createGitHubReadTools } from '../src/tools/github-read.js'
import { createReadToolExecutor } from '../src/tools/handlers.js'

test('tool budget denies calls beyond the configured limit', () => {
  const budget = createToolBudget({ maxCalls: 2, maxWorkflowLogCalls: 1 })

  expect(budget.tryConsume('get_issue_comments')).toEqual({ ok: true })
  expect(budget.tryConsume('list_pr_files')).toEqual({ ok: true })
  expect(budget.tryConsume('get_issue_comments')).toEqual({
    ok: false,
    errorCode: 'budget_exceeded',
    message: 'Tool call budget exhausted.',
  })
})

test('workflow log calls are limited separately', () => {
  const budget = createToolBudget({ maxCalls: 5, maxWorkflowLogCalls: 1 })

  expect(budget.tryConsume('get_workflow_run_logs')).toEqual({ ok: true })
  expect(budget.tryConsume('get_workflow_run_logs')).toEqual({
    ok: false,
    errorCode: 'budget_exceeded',
    message: 'Workflow log tool call budget exhausted.',
  })
})

test('workflow run registry tracks accessible run ids', () => {
  const registry = createWorkflowRunAccessRegistry()

  registry.allow([101, 102])

  expect(registry.has(101)).toBe(true)
  expect(registry.has(999)).toBe(false)
})

test('approve mode exposes no model tools', () => {
  expect(getToolsForMode('approve')).toEqual([])
})

test('review mode exposes the read-only tool set', () => {
  expect(getToolsForMode('review').map((tool) => tool.name)).toEqual([
    'get_issue_comments',
    'get_review_comments',
    'list_workflow_runs',
    'get_workflow_run_logs',
    'list_pr_files',
  ])
})

test('workflow log tool rejects non-numeric run ids', () => {
  expect(parseToolArguments('get_workflow_run_logs', { runId: 'oops' })).toEqual({
    ok: false,
    errorCode: 'invalid_arguments',
    message: 'runId must be a number.',
  })
})

test('issue comments tool applies default limits', () => {
  expect(parseToolArguments('get_issue_comments', {})).toEqual({
    ok: true,
    data: { limit: 10 },
  })
})

test('workflow log tool rejects run ids that were not previously listed', async () => {
  const tools = createGitHubReadTools({
    octokit: { rest: {} } as never,
    context: {
      owner: 'octo',
      repo: 'repo',
      eventName: 'issue_comment',
      commentBody: '/ai diagnose-ci',
      commentAuthor: 'alice',
      warnings: [],
    },
    maxDiffChars: 100,
    maxLogChars: 200,
  })

  const result = await tools.getWorkflowRunLogs({ runId: 999, failedJobsOnly: true })

  expect(result).toEqual({
    ok: false,
    errorCode: 'invalid_run_id',
    message: 'runId must come from a previous list_workflow_runs result.',
  })
})

test('pr-only tools reject issue context', async () => {
  const tools = createGitHubReadTools({
    octokit: { rest: {} } as never,
    context: {
      owner: 'octo',
      repo: 'repo',
      eventName: 'issue_comment',
      commentBody: '/ai explain',
      commentAuthor: 'alice',
      issueNumber: 1,
      warnings: [],
    },
    maxDiffChars: 100,
    maxLogChars: 200,
  })

  await expect(tools.getReviewComments({ limit: 10, unresolvedOnly: false })).resolves.toEqual({
    ok: false,
    errorCode: 'not_pr_context',
    message: 'This tool is only available for pull requests.',
  })

  await expect(tools.listPrFiles({ limit: 10, includePatch: false })).resolves.toEqual({
    ok: false,
    errorCode: 'not_pr_context',
    message: 'This tool is only available for pull requests.',
  })
})

test('issue comments are redacted and truncated', async () => {
  const tools = createGitHubReadTools({
    octokit: {
      rest: {
        issues: {
          listComments: async () => ({
            data: [
              {
                id: 10,
                body: 'Authorization: Bearer secret-token\n' + 'a'.repeat(80),
                created_at: '2026-04-15T00:00:00Z',
                user: { login: 'alice' },
              },
            ],
          }),
        },
      },
    } as never,
    context: {
      owner: 'octo',
      repo: 'repo',
      eventName: 'issue_comment',
      commentBody: '/ai explain',
      commentAuthor: 'alice',
      issueNumber: 1,
      warnings: [],
    },
    maxDiffChars: 100,
    maxLogChars: 40,
  })

  const result = await tools.getIssueComments({ limit: 10 })

  expect(result.ok).toBe(true)
  expect(JSON.stringify(result)).toContain('<redacted:authorization header>')
  expect(JSON.stringify(result)).toContain('[truncated')
})

test('tool executor validates arguments before dispatching', async () => {
  const getWorkflowRunLogs = vi.fn()
  const executor = createReadToolExecutor({
    getIssueComments: vi.fn(),
    getReviewComments: vi.fn(),
    listWorkflowRuns: vi.fn(),
    getWorkflowRunLogs,
    listPrFiles: vi.fn(),
  })

  const result = await executor('get_workflow_run_logs', { runId: 'oops' })

  expect(getWorkflowRunLogs).not.toHaveBeenCalled()
  expect(result).toEqual({
    ok: false,
    errorCode: 'invalid_arguments',
    message: 'runId must be a number.',
  })
})

test('tool executor dispatches normalized arguments to handlers', async () => {
  const getIssueComments = vi.fn().mockResolvedValue({ ok: true, data: [] })
  const executor = createReadToolExecutor({
    getIssueComments,
    getReviewComments: vi.fn(),
    listWorkflowRuns: vi.fn(),
    getWorkflowRunLogs: vi.fn(),
    listPrFiles: vi.fn(),
  })

  await executor('get_issue_comments', {})

  expect(getIssueComments).toHaveBeenCalledWith({ limit: 10 })
})
