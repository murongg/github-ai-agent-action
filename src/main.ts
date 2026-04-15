import * as core from '@actions/core'
import * as github from '@actions/github'
import { pathToFileURL } from 'node:url'
import { canApprove, canTriggerReadCommand } from './auth.js'
import { parseCommand } from './commands.js'
import { buildReplyBody, postIssueComment } from './comment.js'
import { collectRepoContext } from './context.js'
import { executeApprovedOperation, isOperationAllowed } from './execute.js'
import { readInputs } from './inputs.js'
import { runToolEnabledAgent } from './openai/agent.js'
import { createOpenAIClient } from './openai.js'
import { parsePendingMarker } from './pending.js'
import { inferPendingOperationFromPlanText } from './plan.js'
import { buildPrompt } from './prompt.js'
import { getToolsForMode } from './tools/definitions.js'
import { createReadToolExecutor } from './tools/handlers.js'
import { createGitHubReadTools } from './tools/github-read.js'
import type { ActionInputs, AgentCommand, AgentReply, PendingOperation, RepoContext } from './types.js'

type IssueCommentBody = { body?: string | null }

export function buildUnauthorizedReply(commandBody: string): string {
  return `You are not authorized to trigger this AI agent command: \`${commandBody}\`.`
}

export function findLatestPendingOperationBody(
  comments: IssueCommentBody[],
  secret: string,
  operationId?: string,
): PendingOperation | undefined {
  return [...comments]
    .reverse()
    .map((comment) => parsePendingMarker(comment.body ?? '', secret))
    .filter((operation) => !operationId || operation?.id === operationId)
    .find(Boolean)
}

function isExecutedDirectly(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(entry).href
}

export function registerActionSecrets(
  inputs: Pick<ActionInputs, 'openaiApiKey' | 'openaiBaseUrl' | 'githubToken'>,
  registerSecret: (value: string) => void = core.setSecret,
): void {
  registerSecret(inputs.openaiApiKey)
  if (inputs.openaiBaseUrl) {
    registerSecret(inputs.openaiBaseUrl)
  }
  registerSecret(inputs.githubToken)
}

export async function generateReadCommandReply(options: {
  command: AgentCommand
  repoContext: RepoContext
  inputs: Pick<ActionInputs, 'model' | 'maxDiffChars' | 'maxLogChars' | 'enableWriteActions' | 'allowedOperations'>
  octokit: ReturnType<typeof github.getOctokit>
  client: ReturnType<typeof createOpenAIClient>
  runToolEnabledAgent?: typeof runToolEnabledAgent
}): Promise<AgentReply> {
  const prompt = buildPrompt(options.command, options.repoContext)
  const tools = getToolsForMode(options.command.mode)
  const githubReadTools = createGitHubReadTools({
    octokit: options.octokit as never,
    context: options.repoContext,
    maxDiffChars: options.inputs.maxDiffChars,
    maxLogChars: options.inputs.maxLogChars,
  })
  const executeToolCall = createReadToolExecutor(githubReadTools)
  const agentRunner = options.runToolEnabledAgent ?? runToolEnabledAgent

  let modelReply = (
    await agentRunner({
      client: options.client,
      model: options.inputs.model,
      prompt,
      tools,
      executeToolCall,
    })
  ).body

  let pendingOperation: PendingOperation | undefined
  if (options.command.mode === 'plan') {
    const inferred = inferPendingOperationFromPlanText({
      text: options.command.text,
      context: options.repoContext,
      requestedBy: options.repoContext.commentAuthor,
    })

    if (inferred && options.inputs.enableWriteActions && isOperationAllowed(inferred.kind, options.inputs.allowedOperations)) {
      pendingOperation = inferred
      modelReply = `${modelReply}\n\nApproved operation available: \`${inferred.kind}\`.\nAn authorized user can run \`/ai approve\` to execute it.`
    } else if (inferred) {
      modelReply = `${modelReply}\n\nA matching repository operation was detected (\`${inferred.kind}\`), but execution is currently disabled or not allowed by configuration.`
    }
  }

  return {
    body: modelReply,
    pendingOperation,
  }
}

export async function run(): Promise<void> {
  const inputs = readInputs()
  registerActionSecrets(inputs)

  const payload = github.context.payload as Record<string, any>
  const commentBody = payload.comment?.body ?? ''
  const command = parseCommand(commentBody)
  if (!command) {
    core.info('No /ai command found; skipping.')
    return
  }

  core.setOutput('mode', command.mode)
  const octokit = github.getOctokit(inputs.githubToken)
  const { owner, repo } = github.context.repo
  const repoContext = await collectRepoContext({
    octokit,
    owner,
    repo,
    maxDiffChars: inputs.maxDiffChars,
    maxLogChars: inputs.maxLogChars,
  })

  const issueNumber = repoContext.issueNumber ?? repoContext.pullRequest?.number
  if (!issueNumber) {
    throw new Error('This Action requires issue or pull request context to reply.')
  }

  const readAllowed = canTriggerReadCommand({
    actor: repoContext.commentAuthor,
    association: repoContext.authorAssociation,
    allowUsers: inputs.allowUsers,
    allowAssociations: inputs.allowAssociations,
  })

  if (!readAllowed) {
    const body = buildUnauthorizedReply(command.rawBody)
    await postIssueComment({ octokit, owner, repo, issueNumber, body })
    core.setOutput('reply', body)
    return
  }

  if (command.mode === 'approve') {
    if (!inputs.enableWriteActions) {
      throw new Error('Write actions are disabled. Set enable-write-actions: true to use /ai approve.')
    }

    const commentsResponse = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    })
    const pendingOperation = findLatestPendingOperationBody(
      commentsResponse.data,
      inputs.githubToken,
      command.text.trim() || undefined,
    )
    if (!pendingOperation) {
      throw new Error('No valid pending operation found to approve.')
    }

    const isPrAuthorOnSameRepoItem = Boolean(
      repoContext.pullRequest &&
        repoContext.pullRequest.authorLogin &&
        repoContext.pullRequest.authorLogin === repoContext.commentAuthor &&
        repoContext.pullRequest.headOwner === owner &&
        repoContext.pullRequest.headRepo === repo,
    )

    const approvalAllowed = canApprove({
      actor: repoContext.commentAuthor,
      association: repoContext.authorAssociation,
      allowUsers: inputs.allowUsers,
      allowAssociations: inputs.allowAssociations,
      isPrAuthorOnSameRepoItem,
    })
    if (!approvalAllowed) {
      throw new Error('This user is not authorized to approve the pending operation.')
    }

    const result = await executeApprovedOperation({
      octokit,
      operation: pendingOperation,
      context: repoContext,
      allowedOperations: inputs.allowedOperations,
    })

    await postIssueComment({ octokit, owner, repo, issueNumber, body: result })
    core.setOutput('reply', result)
    core.setOutput('operation-id', pendingOperation.id)
    return
  }

  const reply = await generateReadCommandReply({
    command,
    repoContext,
    inputs,
    octokit,
    client: createOpenAIClient({
      apiKey: inputs.openaiApiKey,
      baseURL: inputs.openaiBaseUrl,
    }),
  })

  const body = buildReplyBody(
    reply,
    reply.pendingOperation ? inputs.githubToken : undefined,
    repoContext.threadId
      ? {
          threadId: repoContext.threadId,
          requestedBy: repoContext.commentAuthor,
          mode: command.mode,
          replyToCommentId: repoContext.commentId,
        }
      : undefined,
  )
  await postIssueComment({ octokit, owner, repo, issueNumber, body })
  core.setOutput('reply', reply.body)
  if (reply.pendingOperation) {
    core.setOutput('operation-id', reply.pendingOperation.id)
  }
}

if (isExecutedDirectly()) {
  run().catch((error: unknown) => {
    core.setFailed(error instanceof Error ? error.message : String(error))
  })
}
