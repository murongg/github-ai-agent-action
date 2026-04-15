import type { AgentMode, ReadToolName } from '../types.js'

export interface ResponseToolDefinition {
  type: 'function'
  name: ReadToolName
  description: string
  strict: true
  parameters: Record<string, unknown>
}

function integerSchema(description: string, minimum: number, maximum: number): Record<string, unknown> {
  return {
    type: 'integer',
    description,
    minimum,
    maximum,
  }
}

const readTools: ResponseToolDefinition[] = [
  {
    type: 'function',
    name: 'get_issue_comments',
    description: 'Read recent issue or pull request conversation comments for the current item.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        limit: integerSchema('Maximum number of comments to return.', 1, 20),
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_review_comments',
    description: 'Read recent pull request review comments for the current pull request.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        limit: integerSchema('Maximum number of review comments to return.', 1, 20),
        unresolvedOnly: { type: 'boolean', description: 'Whether to return only unresolved review comments.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'list_workflow_runs',
    description: 'List recent workflow runs relevant to the current issue or pull request.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        limit: integerSchema('Maximum number of workflow runs to return.', 1, 10),
        failingOnly: { type: 'boolean', description: 'Whether to return only failing or cancelled workflow runs.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_workflow_run_logs',
    description: 'Read a bounded excerpt of workflow logs for a previously listed workflow run.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'integer', description: 'Workflow run id returned from list_workflow_runs.' },
        failedJobsOnly: { type: 'boolean', description: 'Whether to return only failed job log excerpts.' },
      },
      required: ['runId'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'list_pr_files',
    description: 'List changed files for the current pull request, optionally with bounded patch summaries.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        limit: integerSchema('Maximum number of changed files to return.', 1, 50),
        includePatch: { type: 'boolean', description: 'Whether to include summarized patch text.' },
      },
      additionalProperties: false,
    },
  },
]

export function getToolsForMode(mode: AgentMode): ResponseToolDefinition[] {
  if (mode === 'approve') return []
  return [...readTools]
}

function normalizeLimit(value: unknown, fallback: number, min: number, max: number) {
  if (value === undefined) return { ok: true as const, value: fallback }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { ok: false as const, errorCode: 'invalid_arguments', message: 'limit must be an integer.' }
  }
  if (value < min || value > max) {
    return {
      ok: false as const,
      errorCode: 'invalid_arguments',
      message: `limit must be between ${min} and ${max}.`,
    }
  }
  return { ok: true as const, value }
}

export function parseToolArguments(name: ReadToolName, args: Record<string, unknown>) {
  switch (name) {
    case 'get_issue_comments': {
      const limit = normalizeLimit(args.limit, 10, 1, 20)
      if (!limit.ok) return limit
      return { ok: true as const, data: { limit: limit.value } }
    }
    case 'get_review_comments': {
      const limit = normalizeLimit(args.limit, 10, 1, 20)
      if (!limit.ok) return limit
      if (args.unresolvedOnly !== undefined && typeof args.unresolvedOnly !== 'boolean') {
        return { ok: false as const, errorCode: 'invalid_arguments', message: 'unresolvedOnly must be a boolean.' }
      }
      return {
        ok: true as const,
        data: {
          limit: limit.value,
          unresolvedOnly: args.unresolvedOnly === true,
        },
      }
    }
    case 'list_workflow_runs': {
      const limit = normalizeLimit(args.limit, 5, 1, 10)
      if (!limit.ok) return limit
      if (args.failingOnly !== undefined && typeof args.failingOnly !== 'boolean') {
        return { ok: false as const, errorCode: 'invalid_arguments', message: 'failingOnly must be a boolean.' }
      }
      return {
        ok: true as const,
        data: {
          limit: limit.value,
          failingOnly: args.failingOnly !== false,
        },
      }
    }
    case 'get_workflow_run_logs': {
      if (typeof args.runId !== 'number' || !Number.isInteger(args.runId)) {
        return { ok: false as const, errorCode: 'invalid_arguments', message: 'runId must be a number.' }
      }
      if (args.failedJobsOnly !== undefined && typeof args.failedJobsOnly !== 'boolean') {
        return { ok: false as const, errorCode: 'invalid_arguments', message: 'failedJobsOnly must be a boolean.' }
      }
      return {
        ok: true as const,
        data: {
          runId: args.runId,
          failedJobsOnly: args.failedJobsOnly !== false,
        },
      }
    }
    case 'list_pr_files': {
      const limit = normalizeLimit(args.limit, 20, 1, 50)
      if (!limit.ok) return limit
      if (args.includePatch !== undefined && typeof args.includePatch !== 'boolean') {
        return { ok: false as const, errorCode: 'invalid_arguments', message: 'includePatch must be a boolean.' }
      }
      return {
        ok: true as const,
        data: {
          limit: limit.value,
          includePatch: args.includePatch === true,
        },
      }
    }
  }
}
