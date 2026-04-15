import type { ReadToolName } from '../types.js'

export function createToolBudget(options: {
  maxCalls: number
  maxWorkflowLogCalls: number
}): {
  tryConsume(toolName: ReadToolName): { ok: true } | { ok: false; errorCode: string; message: string }
} {
  let totalCalls = 0
  let workflowLogCalls = 0

  return {
    tryConsume(toolName) {
      if (toolName === 'get_workflow_run_logs') {
        if (workflowLogCalls >= options.maxWorkflowLogCalls) {
          return {
            ok: false,
            errorCode: 'budget_exceeded',
            message: 'Workflow log tool call budget exhausted.',
          }
        }
        workflowLogCalls += 1
      }

      if (totalCalls >= options.maxCalls) {
        return {
          ok: false,
          errorCode: 'budget_exceeded',
          message: 'Tool call budget exhausted.',
        }
      }

      totalCalls += 1
      return { ok: true }
    },
  }
}

export function createWorkflowRunAccessRegistry(): {
  allow(runIds: number[]): void
  has(runId: number): boolean
} {
  const runIds = new Set<number>()

  return {
    allow(values) {
      for (const value of values) {
        runIds.add(value)
      }
    },
    has(runId) {
      return runIds.has(runId)
    },
  }
}
