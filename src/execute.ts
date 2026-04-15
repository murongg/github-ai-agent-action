import type { PendingOperation, RepoContext, OperationKind } from './types.js'

type Octokit = {
  rest: {
    actions?: {
      reRunWorkflow?: (args: { owner: string; repo: string; run_id: number }) => Promise<unknown>
    }
    issues?: {
      addLabels?: (args: { owner: string; repo: string; issue_number: number; labels: string[] }) => Promise<unknown>
      removeLabel?: (args: { owner: string; repo: string; issue_number: number; name: string }) => Promise<unknown>
      update?: (args: { owner: string; repo: string; issue_number: number; state: 'open' | 'closed' }) => Promise<unknown>
    }
    pulls?: {
      requestReviewers?: (args: { owner: string; repo: string; pull_number: number; reviewers: string[] }) => Promise<unknown>
    }
  }
}

export function isOperationAllowed(kind: OperationKind, allowlist: OperationKind[]): boolean {
  return allowlist.includes(kind)
}

async function rerunWorkflow(octokit: Octokit, operation: Extract<PendingOperation, { kind: 'rerun-workflow' }>): Promise<string> {
  if (!octokit.rest.actions?.reRunWorkflow) {
    throw new Error('GitHub Actions rerun API is unavailable')
  }

  await octokit.rest.actions.reRunWorkflow({
    owner: operation.owner,
    repo: operation.repo,
    run_id: operation.args.runId,
  })

  return `Re-ran workflow run ${operation.args.runId}.`
}

async function addLabels(octokit: Octokit, operation: Extract<PendingOperation, { kind: 'add-labels' }>): Promise<string> {
  if (!octokit.rest.issues?.addLabels) {
    throw new Error('GitHub issues addLabels API is unavailable')
  }

  await octokit.rest.issues.addLabels({
    owner: operation.owner,
    repo: operation.repo,
    issue_number: operation.issueNumber,
    labels: operation.args.labels,
  })

  return `Applied labels: ${operation.args.labels.join(', ')}.`
}

async function removeLabels(octokit: Octokit, operation: Extract<PendingOperation, { kind: 'remove-labels' }>): Promise<string> {
  if (!octokit.rest.issues?.removeLabel) {
    throw new Error('GitHub issues removeLabel API is unavailable')
  }

  for (const label of operation.args.labels) {
    await octokit.rest.issues.removeLabel({
      owner: operation.owner,
      repo: operation.repo,
      issue_number: operation.issueNumber,
      name: label,
    })
  }

  return `Removed labels: ${operation.args.labels.join(', ')}.`
}

async function requestReviewers(
  octokit: Octokit,
  operation: Extract<PendingOperation, { kind: 'request-reviewers' }>,
  context: RepoContext,
): Promise<string> {
  if (!context.pullRequest) {
    throw new Error('request-reviewers requires pull request context')
  }
  if (!octokit.rest.pulls?.requestReviewers) {
    throw new Error('GitHub pulls requestReviewers API is unavailable')
  }

  await octokit.rest.pulls.requestReviewers({
    owner: operation.owner,
    repo: operation.repo,
    pull_number: context.pullRequest.number,
    reviewers: operation.args.reviewers,
  })

  return `Requested reviewers: ${operation.args.reviewers.join(', ')}.`
}

async function updateIssueState(
  octokit: Octokit,
  operation: Extract<PendingOperation, { kind: 'close-item' | 'reopen-item' }>,
  state: 'open' | 'closed',
): Promise<string> {
  if (!octokit.rest.issues?.update) {
    throw new Error('GitHub issues update API is unavailable')
  }

  await octokit.rest.issues.update({
    owner: operation.owner,
    repo: operation.repo,
    issue_number: operation.issueNumber,
    state,
  })

  return `${state === 'closed' ? 'Closed' : 'Reopened'} issue or pull request #${operation.issueNumber}.`
}

export async function executeApprovedOperation(options: {
  octokit: Octokit
  operation: PendingOperation
  context: RepoContext
  allowedOperations: OperationKind[]
}): Promise<string> {
  if (!isOperationAllowed(options.operation.kind, options.allowedOperations)) {
    throw new Error(`Operation ${options.operation.kind} is not allowed`)
  }

  switch (options.operation.kind) {
    case 'rerun-workflow':
      return rerunWorkflow(options.octokit, options.operation)
    case 'add-labels':
      return addLabels(options.octokit, options.operation)
    case 'remove-labels':
      return removeLabels(options.octokit, options.operation)
    case 'request-reviewers':
      return requestReviewers(options.octokit, options.operation, options.context)
    case 'close-item':
      return updateIssueState(options.octokit, options.operation, 'closed')
    case 'reopen-item':
      return updateIssueState(options.octokit, options.operation, 'open')
    default: {
      const exhaustive: never = options.operation
      throw new Error(`Unsupported operation: ${JSON.stringify(exhaustive)}`)
    }
  }
}
