export const allowedOperationKinds = [
  'rerun-workflow',
  'add-labels',
  'remove-labels',
  'request-reviewers',
  'close-item',
  'reopen-item',
] as const

export type OperationKind = (typeof allowedOperationKinds)[number]

export type AgentMode = 'conversation' | 'diagnose-ci' | 'review' | 'explain' | 'plan' | 'approve'

export type ReadToolName =
  | 'get_issue_comments'
  | 'get_review_comments'
  | 'list_workflow_runs'
  | 'get_workflow_run_logs'
  | 'list_pr_files'

export type ReadToolResult<T> =
  | { ok: true; data: T; message?: string }
  | { ok: false; errorCode: string; message: string }

export interface AgentCommand {
  mode: AgentMode
  rawBody: string
  text: string
}

export interface ActionInputs {
  openaiApiKey: string
  openaiBaseUrl?: string
  githubToken: string
  model: string
  allowUsers: string[]
  allowAssociations: string[]
  enableWriteActions: boolean
  maxDiffChars: number
  maxLogChars: number
  allowedOperations: OperationKind[]
}

export interface RepoContext {
  owner: string
  repo: string
  eventName: string
  commentId?: number
  commentBody: string
  commentAuthor: string
  authorAssociation?: string
  threadId?: string
  issueState?: 'open' | 'closed'
  issueNumber?: number
  issueTitle?: string
  issueBody?: string
  conversation?: Array<{
    role: 'user' | 'agent'
    actor: string
    body: string
  }>
  pullRequest?: {
    number: number
    title: string
    body: string
    authorLogin?: string
    headOwner: string
    headRepo: string
    headBranch: string
    headSha: string
    baseBranch: string
    changedFiles: Array<{ filename: string; status: string; patch?: string }>
  }
  recentWorkflowRuns?: Array<{
    id: number
    name: string
    conclusion: string
    htmlUrl?: string
  }>
  workflowSummary?: string
  readme?: string
  agentsMd?: string
  warnings: string[]
}

interface PendingOperationBase {
  id: string
  kind: OperationKind
  issueNumber: number
  owner: string
  repo: string
  requestedBy: string
  requestedAt: string
  task: string
  expiresAt: string
}

export type PendingOperation =
  | (PendingOperationBase & {
      kind: 'rerun-workflow'
      args: { runId: number }
    })
  | (PendingOperationBase & {
      kind: 'add-labels'
      args: { labels: string[] }
    })
  | (PendingOperationBase & {
      kind: 'remove-labels'
      args: { labels: string[] }
    })
  | (PendingOperationBase & {
      kind: 'request-reviewers'
      args: { reviewers: string[] }
    })
  | (PendingOperationBase & {
      kind: 'close-item'
      args: Record<string, never>
    })
  | (PendingOperationBase & {
      kind: 'reopen-item'
      args: Record<string, never>
    })

export interface AgentReply {
  body: string
  pendingOperation?: PendingOperation
}
