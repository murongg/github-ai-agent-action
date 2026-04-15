import * as github from '@actions/github'
import { createPendingMarker } from './pending.js'
import type { AgentReply, AgentMode } from './types.js'

type Octokit = ReturnType<typeof github.getOctokit>

const replyMarkerPrefix = '<!-- github-ai-agent-action:reply'
const replyMarkerSuffix = ' -->'
export const replyMarker = '<!-- github-ai-agent-action:reply -->'
export const replyFooter = 'No repository changes were made unless this comment explicitly reports an approved execution result.'

export interface ReplyMetadata {
  threadId: string
  requestedBy: string
  mode: AgentMode
  replyToCommentId?: number
}

export function createReplyMarker(metadata?: ReplyMetadata): string {
  if (!metadata) return replyMarker
  return `${replyMarkerPrefix} ${JSON.stringify(metadata)}${replyMarkerSuffix}`
}

export function parseReplyMarker(body: string): ReplyMetadata | undefined {
  if (body.startsWith(replyMarker)) return undefined
  const prefix = `${replyMarkerPrefix} `
  const start = body.indexOf(prefix)
  if (start < 0) return undefined
  const end = body.indexOf(replyMarkerSuffix, start)
  if (end < 0) return undefined
  const json = body.slice(start + prefix.length, end)
  try {
    const parsed = JSON.parse(json) as Partial<ReplyMetadata>
    if (
      typeof parsed.threadId === 'string' &&
      typeof parsed.requestedBy === 'string' &&
      typeof parsed.mode === 'string'
    ) {
      return {
        threadId: parsed.threadId,
        requestedBy: parsed.requestedBy,
        mode: parsed.mode as AgentMode,
        replyToCommentId: typeof parsed.replyToCommentId === 'number' ? parsed.replyToCommentId : undefined,
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

export function buildReplyBody(reply: AgentReply, markerSecret?: string, metadata?: ReplyMetadata): string {
  const marker = reply.pendingOperation && markerSecret
    ? `\n\n${createPendingMarker(reply.pendingOperation, markerSecret)}`
    : ''

  return `${createReplyMarker(metadata)}\n${reply.body}${marker}\n\n---\n${replyFooter}`
}

export async function postIssueComment(options: {
  octokit: Octokit
  owner: string
  repo: string
  issueNumber: number
  body: string
}): Promise<string | undefined> {
  const response = await options.octokit.rest.issues.createComment({
    owner: options.owner,
    repo: options.repo,
    issue_number: options.issueNumber,
    body: options.body,
  })
  return response.data.html_url ?? undefined
}
