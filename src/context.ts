import * as github from '@actions/github'
import type { RepoContext } from './types.js'
import { parseReplyMarker, replyFooter, replyMarker } from './comment.js'
import { redactText, truncateText } from './redact.js'

type Octokit = ReturnType<typeof github.getOctokit>

interface WorkflowRunLike {
  id: number
  name?: string | null
  conclusion?: string | null
  html_url?: string | null
}

interface IssueCommentLike {
  body?: string | null
  user?: { login?: string | null } | null
}

function cleanAgentReplyBody(body: string): string {
  return body
    .replace(/<!-- github-ai-agent-action:reply(?:\s+\{[\s\S]*?\})? -->\n?/g, '')
    .replace(/\n?<!-- github-ai-agent-action:pending[\s\S]*?-->/g, '')
    .replace(`\n\n---\n${replyFooter}`, '')
    .trim()
}

export function extractConversationTurns(
  comments: IssueCommentLike[],
  maxTurns: number,
  maxCharsPerTurn: number,
  filters?: { requestedBy?: string; threadId?: string },
): Array<{ role: 'user' | 'agent'; actor: string; body: string }> {
  const turns: Array<{ role: 'user' | 'agent'; actor: string; body: string }> = []

  for (const comment of comments) {
    const body = comment.body?.trim()
    const actor = comment.user?.login ?? 'unknown'
    if (!body) continue

    if (body.startsWith('/ai')) {
      if (filters?.requestedBy && actor !== filters.requestedBy) continue
      turns.push({
        role: 'user',
        actor,
        body: truncateText(redactText(body), maxCharsPerTurn),
      })
      continue
    }

    if (body.includes('<!-- github-ai-agent-action:reply')) {
      const metadata = parseReplyMarker(body)
      if (filters?.requestedBy && metadata?.requestedBy !== filters.requestedBy) continue
      if (filters?.threadId && metadata?.threadId !== filters.threadId) continue
      turns.push({
        role: 'agent',
        actor,
        body: truncateText(redactText(cleanAgentReplyBody(body)), maxCharsPerTurn),
      })
    }
  }

  return turns.slice(-maxTurns)
}

export function summarizePatch(patch: string | undefined, maxChars: number): string | undefined {
  if (!patch) return undefined
  const redacted = redactText(patch)
  if (redacted.length <= maxChars) return redacted
  return `${redacted.slice(0, maxChars)}\n[patch truncated ${redacted.length - maxChars} characters]`
}

export function summarizeWorkflowRuns(runs: WorkflowRunLike[]): Array<{
  id: number
  name: string
  conclusion: string
  htmlUrl?: string
}> {
  return runs
    .filter((run) => run.conclusion && run.conclusion !== 'success' && run.conclusion !== 'skipped')
    .map((run) => ({
      id: run.id,
      name: run.name ?? `Run ${run.id}`,
      conclusion: run.conclusion ?? 'unknown',
      htmlUrl: run.html_url ?? undefined,
    }))
}

async function readRepoFile(options: {
  octokit: Octokit
  owner: string
  repo: string
  path: string
  maxChars: number
}): Promise<string | undefined> {
  try {
    const response = await options.octokit.rest.repos.getContent({
      owner: options.owner,
      repo: options.repo,
      path: options.path,
    })
    const data = response.data
    if (!('content' in data) || Array.isArray(data)) return undefined
    return truncateText(Buffer.from(data.content, 'base64').toString('utf8'), options.maxChars)
  } catch {
    return undefined
  }
}

export async function collectRepoContext(options: {
  octokit: Octokit
  owner: string
  repo: string
  maxDiffChars: number
  maxLogChars: number
}): Promise<RepoContext> {
  const payload = github.context.payload as Record<string, any>
  const comment = payload.comment
  const issue = payload.issue
  const warnings: string[] = []
  const issueNumber: number | undefined = issue?.number ?? payload.pull_request?.number
  const commentAuthor = comment?.user?.login ?? github.context.actor
  const threadId = issueNumber ? `issue-${issueNumber}:${commentAuthor}` : undefined

  let pullRequest: RepoContext['pullRequest']
  let recentWorkflowRuns: RepoContext['recentWorkflowRuns']
  let conversation: RepoContext['conversation']

  if (issue?.pull_request && issueNumber) {
    try {
      const [prResponse, filesResponse] = await Promise.all([
        options.octokit.rest.pulls.get({
          owner: options.owner,
          repo: options.repo,
          pull_number: issueNumber,
        }),
        options.octokit.rest.pulls.listFiles({
          owner: options.owner,
          repo: options.repo,
          pull_number: issueNumber,
          per_page: 100,
        }),
      ])

      pullRequest = {
        number: prResponse.data.number,
        title: prResponse.data.title,
        body: prResponse.data.body ?? '',
        authorLogin: prResponse.data.user?.login ?? undefined,
        headOwner: prResponse.data.head.repo?.owner.login ?? '',
        headRepo: prResponse.data.head.repo?.name ?? '',
        headBranch: prResponse.data.head.ref,
        headSha: prResponse.data.head.sha,
        baseBranch: prResponse.data.base.ref,
        changedFiles: filesResponse.data.map((file) => ({
          filename: file.filename,
          status: file.status,
          patch: summarizePatch(file.patch, options.maxDiffChars),
        })),
      }

      try {
        const runsResponse = await options.octokit.rest.actions.listWorkflowRunsForRepo({
          owner: options.owner,
          repo: options.repo,
          head_sha: prResponse.data.head.sha,
          per_page: 20,
        })
        recentWorkflowRuns = summarizeWorkflowRuns(runsResponse.data.workflow_runs)
      } catch (error) {
        warnings.push(`Could not fetch workflow runs: ${error instanceof Error ? error.message : 'unknown error'}`)
      }
    } catch (error) {
      warnings.push(`Could not fetch pull request context: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  if (issueNumber) {
    try {
      const commentsResponse = await options.octokit.rest.issues.listComments({
        owner: options.owner,
        repo: options.repo,
        issue_number: issueNumber,
        per_page: 30,
      })
      conversation = extractConversationTurns(commentsResponse.data, 10, 2000, {
        requestedBy: commentAuthor,
        threadId,
      })
    } catch (error) {
      warnings.push(`Could not fetch issue comments: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  const [readme, agentsMd] = await Promise.all([
    readRepoFile({ octokit: options.octokit, owner: options.owner, repo: options.repo, path: 'README.md', maxChars: options.maxLogChars }),
    readRepoFile({ octokit: options.octokit, owner: options.owner, repo: options.repo, path: 'AGENTS.md', maxChars: options.maxLogChars }),
  ])

  return {
    owner: options.owner,
    repo: options.repo,
    eventName: github.context.eventName,
    commentId: comment?.id,
    commentBody: comment?.body ?? '',
    commentAuthor,
    authorAssociation: comment?.author_association,
    threadId,
    issueState: issue?.state,
    issueNumber,
    issueTitle: issue?.title,
    issueBody: issue?.body ?? undefined,
    conversation,
    pullRequest,
    recentWorkflowRuns,
    workflowSummary: recentWorkflowRuns
      ? recentWorkflowRuns
          .map((run) => `- ${run.name}: ${run.conclusion}${run.htmlUrl ? ` (${run.htmlUrl})` : ''}`)
          .join('\n')
      : undefined,
    readme,
    agentsMd,
    warnings,
  }
}
