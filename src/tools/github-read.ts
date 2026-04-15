import { redactText, truncateText } from '../redact.js'
import type { ReadToolResult, RepoContext } from '../types.js'
import { summarizePatch, summarizeWorkflowRuns } from '../context.js'
import { createWorkflowRunAccessRegistry } from './budget.js'

type Octokit = {
  rest: {
    actions?: {
      listWorkflowRunsForRepo?: (args: {
        owner: string
        repo: string
        head_sha?: string
        per_page: number
      }) => Promise<{ data: { workflow_runs: Array<{ id: number; name?: string | null; conclusion?: string | null; html_url?: string | null }> } }>
      downloadWorkflowRunLogs?: (args: {
        owner: string
        repo: string
        run_id: number
      }) => Promise<{ data?: unknown }>
    }
    issues?: {
      listComments?: (args: {
        owner: string
        repo: string
        issue_number: number
        per_page: number
      }) => Promise<{ data: Array<{ id: number; body?: string | null; created_at?: string | null; user?: { login?: string | null } | null }> }>
    }
    pulls?: {
      listReviewComments?: (args: {
        owner: string
        repo: string
        pull_number: number
        per_page: number
      }) => Promise<{ data: Array<{ id: number; body?: string | null; path?: string | null; line?: number | null; created_at?: string | null; user?: { login?: string | null } | null }> }>
      listFiles?: (args: {
        owner: string
        repo: string
        pull_number: number
        per_page: number
      }) => Promise<{ data: Array<{ filename: string; status: string; additions?: number; deletions?: number; patch?: string }> }>
    }
  }
}

function notPrContext<T>(): ReadToolResult<T> {
  return {
    ok: false,
    errorCode: 'not_pr_context',
    message: 'This tool is only available for pull requests.',
  }
}

function truncateRedacted(input: string, maxChars: number): string {
  return truncateText(redactText(input), maxChars)
}

function logDataToText(data: unknown): string | undefined {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  if (data && typeof data === 'object' && 'toString' in data && typeof data.toString === 'function') {
    const text = data.toString()
    if (typeof text === 'string' && text !== '[object Object]') return text
  }
  return undefined
}

export function createGitHubReadTools(options: {
  octokit: Octokit
  context: RepoContext
  maxDiffChars: number
  maxLogChars: number
}): {
  getIssueComments(args: { limit: number }): Promise<ReadToolResult<Array<{ id: number; author: string; createdAt?: string; body: string }>>>
  getReviewComments(args: { limit: number; unresolvedOnly: boolean }): Promise<ReadToolResult<Array<{ id: number; author: string; createdAt?: string; path?: string; line?: number; body: string }>>>
  listWorkflowRuns(args: { limit: number; failingOnly: boolean }): Promise<ReadToolResult<Array<{ id: number; name: string; conclusion: string; htmlUrl?: string }>>>
  getWorkflowRunLogs(args: { runId: number; failedJobsOnly: boolean }): Promise<ReadToolResult<{ runId: number; excerpt: string; failedJobsOnly: boolean }>>
  listPrFiles(args: { limit: number; includePatch: boolean }): Promise<ReadToolResult<Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>>>
} {
  const allowedRunIds = createWorkflowRunAccessRegistry()

  return {
    async getIssueComments({ limit }) {
      if (!options.context.issueNumber) {
        return {
          ok: false,
          errorCode: 'not_found',
          message: 'No issue or pull request context is available.',
        }
      }
      if (!options.octokit.rest.issues?.listComments) {
        return {
          ok: false,
          errorCode: 'api_unavailable',
          message: 'GitHub issue comments API is unavailable.',
        }
      }

      const response = await options.octokit.rest.issues.listComments({
        owner: options.context.owner,
        repo: options.context.repo,
        issue_number: options.context.issueNumber,
        per_page: limit,
      })

      return {
        ok: true,
        data: response.data.map((comment) => ({
          id: comment.id,
          author: comment.user?.login ?? 'unknown',
          createdAt: comment.created_at ?? undefined,
          body: truncateRedacted(comment.body ?? '', options.maxLogChars),
        })),
      }
    },

    async getReviewComments({ limit, unresolvedOnly }) {
      if (!options.context.pullRequest) return notPrContext()
      if (!options.octokit.rest.pulls?.listReviewComments) {
        return {
          ok: false,
          errorCode: 'api_unavailable',
          message: 'GitHub review comments API is unavailable.',
        }
      }

      const response = await options.octokit.rest.pulls.listReviewComments({
        owner: options.context.owner,
        repo: options.context.repo,
        pull_number: options.context.pullRequest.number,
        per_page: limit,
      })

      return {
        ok: true,
        data: response.data
          .filter((comment) => !unresolvedOnly || comment.line != null)
          .map((comment) => ({
            id: comment.id,
            author: comment.user?.login ?? 'unknown',
            createdAt: comment.created_at ?? undefined,
            path: comment.path ?? undefined,
            line: comment.line ?? undefined,
            body: truncateRedacted(comment.body ?? '', options.maxLogChars),
          })),
      }
    },

    async listWorkflowRuns({ limit, failingOnly }) {
      if (!options.octokit.rest.actions?.listWorkflowRunsForRepo) {
        return {
          ok: false,
          errorCode: 'api_unavailable',
          message: 'GitHub workflow runs API is unavailable.',
        }
      }

      const response = await options.octokit.rest.actions.listWorkflowRunsForRepo({
        owner: options.context.owner,
        repo: options.context.repo,
        head_sha: options.context.pullRequest?.headSha,
        per_page: limit,
      })

      const runs = failingOnly
        ? summarizeWorkflowRuns(response.data.workflow_runs)
        : response.data.workflow_runs.map((run) => ({
            id: run.id,
            name: run.name ?? `Run ${run.id}`,
            conclusion: run.conclusion ?? 'unknown',
            htmlUrl: run.html_url ?? undefined,
          }))

      allowedRunIds.allow(runs.map((run) => run.id))

      return {
        ok: true,
        data: runs,
      }
    },

    async getWorkflowRunLogs({ runId, failedJobsOnly }) {
      if (!allowedRunIds.has(runId)) {
        return {
          ok: false,
          errorCode: 'invalid_run_id',
          message: 'runId must come from a previous list_workflow_runs result.',
        }
      }
      if (!options.octokit.rest.actions?.downloadWorkflowRunLogs) {
        return {
          ok: false,
          errorCode: 'api_unavailable',
          message: 'GitHub workflow logs API is unavailable.',
        }
      }

      const response = await options.octokit.rest.actions.downloadWorkflowRunLogs({
        owner: options.context.owner,
        repo: options.context.repo,
        run_id: runId,
      })
      const logText = logDataToText(response.data) ?? 'Workflow log download completed, but no log text was returned by the API.'

      return {
        ok: true,
        data: {
          runId,
          failedJobsOnly,
          excerpt: truncateRedacted(logText, options.maxLogChars),
        },
      }
    },

    async listPrFiles({ limit, includePatch }) {
      if (!options.context.pullRequest) return notPrContext()
      if (!options.octokit.rest.pulls?.listFiles) {
        return {
          ok: false,
          errorCode: 'api_unavailable',
          message: 'GitHub pull request files API is unavailable.',
        }
      }

      const response = await options.octokit.rest.pulls.listFiles({
        owner: options.context.owner,
        repo: options.context.repo,
        pull_number: options.context.pullRequest.number,
        per_page: limit,
      })

      return {
        ok: true,
        data: response.data.map((file) => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions ?? 0,
          deletions: file.deletions ?? 0,
          patch: includePatch ? summarizePatch(file.patch, options.maxDiffChars) : undefined,
        })),
      }
    },
  }
}
