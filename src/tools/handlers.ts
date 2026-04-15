import { parseToolArguments } from './definitions.js'
import type { ReadToolName, ReadToolResult } from '../types.js'

export interface ReadToolHandlers {
  getIssueComments(args: { limit: number }): Promise<ReadToolResult<unknown>>
  getReviewComments(args: { limit: number; unresolvedOnly: boolean }): Promise<ReadToolResult<unknown>>
  listWorkflowRuns(args: { limit: number; failingOnly: boolean }): Promise<ReadToolResult<unknown>>
  getWorkflowRunLogs(args: { runId: number; failedJobsOnly: boolean }): Promise<ReadToolResult<unknown>>
  listPrFiles(args: { limit: number; includePatch: boolean }): Promise<ReadToolResult<unknown>>
}

export function createReadToolExecutor(handlers: ReadToolHandlers) {
  return async (name: string, rawArgs: Record<string, unknown>): Promise<ReadToolResult<unknown>> => {
    if (!isReadToolName(name)) {
      return {
        ok: false,
        errorCode: 'invalid_tool',
        message: `Unsupported tool: ${name}.`,
      }
    }

    const parsed = parseToolArguments(name, rawArgs)
    if (!parsed.ok) return parsed

    switch (name) {
      case 'get_issue_comments':
        return handlers.getIssueComments(parsed.data as { limit: number })
      case 'get_review_comments':
        return handlers.getReviewComments(parsed.data as { limit: number; unresolvedOnly: boolean })
      case 'list_workflow_runs':
        return handlers.listWorkflowRuns(parsed.data as { limit: number; failingOnly: boolean })
      case 'get_workflow_run_logs':
        return handlers.getWorkflowRunLogs(parsed.data as { runId: number; failedJobsOnly: boolean })
      case 'list_pr_files':
        return handlers.listPrFiles(parsed.data as { limit: number; includePatch: boolean })
    }
  }
}

function isReadToolName(name: string): name is ReadToolName {
  return [
    'get_issue_comments',
    'get_review_comments',
    'list_workflow_runs',
    'get_workflow_run_logs',
    'list_pr_files',
  ].includes(name)
}
