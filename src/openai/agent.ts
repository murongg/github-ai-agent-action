import { createToolBudget } from '../tools/budget.js'
import { extractTextResponse } from '../openai.js'
import type { ReadToolName } from '../types.js'

interface FunctionCallLike {
  type: 'function_call'
  name: string
  call_id: string
  arguments: string
}

const readToolNames = new Set<ReadToolName>([
  'get_issue_comments',
  'get_review_comments',
  'list_workflow_runs',
  'get_workflow_run_logs',
  'list_pr_files',
])

function extractFunctionCalls(response: { output?: unknown[] }): FunctionCallLike[] {
  if (!Array.isArray(response.output)) return []
  return response.output.filter((item): item is FunctionCallLike => {
    if (!item || typeof item !== 'object') return false
    const candidate = item as Partial<FunctionCallLike>
    return candidate.type === 'function_call' &&
      typeof candidate.name === 'string' &&
      typeof candidate.call_id === 'string' &&
      typeof candidate.arguments === 'string'
  })
}

function isReadToolName(name: string): name is ReadToolName {
  return readToolNames.has(name as ReadToolName)
}

export async function runToolEnabledAgent(options: {
  client: {
    responses: {
      create: (args: Record<string, unknown>) => Promise<{
        id?: string
        output_text?: string
        output?: unknown[]
      }>
    }
  }
  model: string
  prompt: string
  tools: unknown[]
  executeToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>
  maxToolCalls?: number
  maxWorkflowLogCalls?: number
}): Promise<{
  body: string
  toolTrace: Array<{ name: string; cacheHit: boolean; errorCode?: string }>
}> {
  const toolTrace: Array<{ name: string; cacheHit: boolean; errorCode?: string }> = []
  const cache = new Map<string, unknown>()
  const budget = createToolBudget({
    maxCalls: options.maxToolCalls ?? 5,
    maxWorkflowLogCalls: options.maxWorkflowLogCalls ?? 1,
  })

  let response = await options.client.responses.create({
    model: options.model,
    input: options.prompt,
    tools: options.tools,
  })

  for (;;) {
    const functionCalls = extractFunctionCalls(response)
    if (functionCalls.length === 0) {
      return {
        body: extractTextResponse(response),
        toolTrace,
      }
    }

    if (!response.id) {
      throw new Error('OpenAI response did not include id for tool follow-up.')
    }

    const outputs = []
    for (const functionCall of functionCalls) {
      const cacheKey = `${functionCall.name}:${functionCall.arguments}`
      let cacheHit = false
      let toolResult: unknown

      if (cache.has(cacheKey)) {
        cacheHit = true
        toolResult = cache.get(cacheKey)
      } else if (!isReadToolName(functionCall.name)) {
        toolResult = {
          ok: false,
          errorCode: 'invalid_tool',
          message: `Unsupported tool: ${functionCall.name}.`,
        }
      } else {
        const budgetResult = budget.tryConsume(functionCall.name)
        if (!budgetResult.ok) {
          toolResult = budgetResult
        } else {
          const parsedArgs = JSON.parse(functionCall.arguments) as Record<string, unknown>
          toolResult = await options.executeToolCall(functionCall.name, parsedArgs)
          cache.set(cacheKey, toolResult)
        }
      }

      const errorCode =
        toolResult && typeof toolResult === 'object' && 'ok' in toolResult && (toolResult as { ok: boolean }).ok === false &&
          'errorCode' in toolResult && typeof (toolResult as { errorCode?: unknown }).errorCode === 'string'
          ? (toolResult as { errorCode: string }).errorCode
          : undefined

      toolTrace.push({
        name: functionCall.name,
        cacheHit,
        errorCode,
      })

      outputs.push({
        type: 'function_call_output',
        call_id: functionCall.call_id,
        output: JSON.stringify(toolResult),
      })
    }

    response = await options.client.responses.create({
      model: options.model,
      previous_response_id: response.id,
      input: outputs,
      tools: options.tools,
    })
  }
}
