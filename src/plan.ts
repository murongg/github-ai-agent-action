import { createOperationId } from './pending.js'
import type { PendingOperation, RepoContext } from './types.js'

function splitList(input: string): string[] {
  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildBaseOperation(options: {
  context: RepoContext
  requestedBy: string
  task: string
  now: Date
  createId: () => string
}) {
  if (!options.context.issueNumber) {
    return undefined
  }

  return {
    id: options.createId(),
    issueNumber: options.context.issueNumber,
    owner: options.context.owner,
    repo: options.context.repo,
    requestedBy: options.requestedBy,
    requestedAt: options.now.toISOString(),
    task: options.task,
    expiresAt: new Date(options.now.getTime() + 1000 * 60 * 60).toISOString(),
  }
}

export function inferPendingOperationFromPlanText(options: {
  text: string
  context: RepoContext
  requestedBy: string
  now?: Date
  createId?: () => string
}): PendingOperation | undefined {
  const text = options.text.trim()
  const lower = text.toLowerCase()
  const now = options.now ?? new Date()
  const makeId = options.createId ?? createOperationId
  const base = buildBaseOperation({
    context: options.context,
    requestedBy: options.requestedBy,
    task: text,
    now,
    createId: makeId,
  })

  if (!base) return undefined

  const addLabelsMatch = text.match(/^add labels?\s+(.+)$/i)
  if (addLabelsMatch?.[1]) {
    const labels = splitList(addLabelsMatch[1])
    if (labels.length > 0) {
      return {
        ...base,
        kind: 'add-labels',
        args: { labels },
      }
    }
  }

  const removeLabelsMatch = text.match(/^remove labels?\s+(.+)$/i)
  if (removeLabelsMatch?.[1]) {
    const labels = splitList(removeLabelsMatch[1])
    if (labels.length > 0) {
      return {
        ...base,
        kind: 'remove-labels',
        args: { labels },
      }
    }
  }

  const reviewersMatch = text.match(/^request reviewers?\s+(.+)$/i)
  if (reviewersMatch?.[1] && options.context.pullRequest) {
    const reviewers = splitList(reviewersMatch[1])
    if (reviewers.length > 0) {
      return {
        ...base,
        kind: 'request-reviewers',
        args: { reviewers },
      }
    }
  }

  const rerunMatch = lower.match(/^(?:rerun|re-run)\s+(?:workflow|run)(?:\s+(\d+))?$/)
  if (rerunMatch) {
    const explicitId = rerunMatch[1] ? Number.parseInt(rerunMatch[1], 10) : undefined
    const runId = explicitId ?? options.context.recentWorkflowRuns?.[0]?.id
    if (runId) {
      return {
        ...base,
        kind: 'rerun-workflow',
        args: { runId },
      }
    }
  }

  if (lower === 'close' || lower === 'close issue' || lower === 'close pr' || lower === 'close pull request') {
    return {
      ...base,
      kind: 'close-item',
      args: {},
    }
  }

  if (lower === 'reopen' || lower === 'reopen issue' || lower === 'reopen pr' || lower === 'reopen pull request') {
    return {
      ...base,
      kind: 'reopen-item',
      args: {},
    }
  }

  return undefined
}
