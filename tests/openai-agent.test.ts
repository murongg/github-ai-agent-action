import { expect, test, vi } from 'vitest'
import { runToolEnabledAgent } from '../src/openai/agent.js'

test('returns final text when the model does not request tools', async () => {
  const client = {
    responses: {
      create: vi.fn().mockResolvedValue({
        id: 'resp_1',
        output_text: 'plain reply',
        output: [],
      }),
    },
  }

  const result = await runToolEnabledAgent({
    client: client as never,
    model: 'gpt-5.4-mini',
    prompt: 'hello',
    tools: [],
    executeToolCall: async () => ({ ok: true, data: 'unused' }),
  })

  expect(result).toEqual({ body: 'plain reply', toolTrace: [] })
})

test('executes a tool call and returns the follow-up model text', async () => {
  const client = {
    responses: {
      create: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'resp_1',
          output: [
            {
              type: 'function_call',
              name: 'list_workflow_runs',
              call_id: 'call_1',
              arguments: '{"limit":1,"failingOnly":true}',
            },
          ],
        })
        .mockResolvedValueOnce({
          id: 'resp_2',
          output_text: 'CI failed in the test job.',
          output: [],
        }),
    },
  }
  const executeToolCall = vi.fn().mockResolvedValue({
    ok: true,
    data: [{ id: 101, name: 'CI', conclusion: 'failure' }],
  })

  const result = await runToolEnabledAgent({
    client: client as never,
    model: 'gpt-5.4-mini',
    prompt: 'diagnose ci',
    tools: [{ type: 'function', name: 'list_workflow_runs' }],
    executeToolCall,
  })

  expect(executeToolCall).toHaveBeenCalledWith('list_workflow_runs', { limit: 1, failingOnly: true })
  expect(result).toEqual({
    body: 'CI failed in the test job.',
    toolTrace: [{ name: 'list_workflow_runs', cacheHit: false }],
  })
})

test('reuses cached tool results for repeated identical calls', async () => {
  const client = {
    responses: {
      create: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'resp_1',
          output: [
            {
              type: 'function_call',
              name: 'get_issue_comments',
              call_id: 'call_1',
              arguments: '{"limit":2}',
            },
          ],
        })
        .mockResolvedValueOnce({
          id: 'resp_2',
          output: [
            {
              type: 'function_call',
              name: 'get_issue_comments',
              call_id: 'call_2',
              arguments: '{"limit":2}',
            },
          ],
        })
        .mockResolvedValueOnce({
          id: 'resp_3',
          output_text: 'I checked the same comments twice.',
          output: [],
        }),
    },
  }
  const executeToolCall = vi.fn().mockResolvedValue({
    ok: true,
    data: [{ id: 1, body: 'comment' }],
  })

  const result = await runToolEnabledAgent({
    client: client as never,
    model: 'gpt-5.4-mini',
    prompt: 'summarize thread',
    tools: [{ type: 'function', name: 'get_issue_comments' }],
    executeToolCall,
  })

  expect(executeToolCall).toHaveBeenCalledTimes(1)
  expect(result.toolTrace).toEqual([
    { name: 'get_issue_comments', cacheHit: false },
    { name: 'get_issue_comments', cacheHit: true },
  ])
})

test('returns a bounded error result when the tool budget is exhausted', async () => {
  const client = {
    responses: {
      create: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'resp_1',
          output: [
            {
              type: 'function_call',
              name: 'get_issue_comments',
              call_id: 'call_1',
              arguments: '{"limit":1}',
            },
          ],
        })
        .mockResolvedValueOnce({
          id: 'resp_2',
          output: [
            {
              type: 'function_call',
              name: 'list_pr_files',
              call_id: 'call_2',
              arguments: '{"limit":1,"includePatch":false}',
            },
          ],
        })
        .mockResolvedValueOnce({
          id: 'resp_3',
          output_text: 'I could only inspect the comments before hitting the tool budget.',
          output: [],
        }),
    },
  }
  const executeToolCall = vi.fn().mockResolvedValue({
    ok: true,
    data: [{ id: 1, body: 'comment' }],
  })

  const result = await runToolEnabledAgent({
    client: client as never,
    model: 'gpt-5.4-mini',
    prompt: 'review',
    tools: [{ type: 'function', name: 'get_issue_comments' }, { type: 'function', name: 'list_pr_files' }],
    executeToolCall,
    maxToolCalls: 1,
  })

  expect(executeToolCall).toHaveBeenCalledTimes(1)
  expect(result.body).toBe('I could only inspect the comments before hitting the tool budget.')
  expect(result.toolTrace).toEqual([
    { name: 'get_issue_comments', cacheHit: false },
    { name: 'list_pr_files', cacheHit: false, errorCode: 'budget_exceeded' },
  ])
})

test('returns an invalid argument result when tool arguments are not valid json', async () => {
  const client = {
    responses: {
      create: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'resp_1',
          output: [
            {
              type: 'function_call',
              name: 'get_issue_comments',
              call_id: 'call_1',
              arguments: '{not-json',
            },
          ],
        })
        .mockResolvedValueOnce({
          id: 'resp_2',
          output_text: 'The tool arguments were invalid, so I answered from existing context.',
          output: [],
        }),
    },
  }
  const executeToolCall = vi.fn()

  const result = await runToolEnabledAgent({
    client: client as never,
    model: 'gpt-5.4-mini',
    prompt: 'summarize thread',
    tools: [{ type: 'function', name: 'get_issue_comments' }],
    executeToolCall,
  })

  expect(executeToolCall).not.toHaveBeenCalled()
  expect(result.toolTrace).toEqual([
    { name: 'get_issue_comments', cacheHit: false, errorCode: 'invalid_arguments' },
  ])
  expect(result.body).toBe('The tool arguments were invalid, so I answered from existing context.')
})

test('stops the tool loop after the configured max iterations', async () => {
  const client = {
    responses: {
      create: vi.fn().mockResolvedValue({
        id: 'resp_loop',
        output: [
          {
            type: 'function_call',
            name: 'get_issue_comments',
            call_id: 'call_loop',
            arguments: '{"limit":1}',
          },
        ],
      }),
    },
  }

  const result = await runToolEnabledAgent({
    client: client as never,
    model: 'gpt-5.4-mini',
    prompt: 'summarize thread',
    tools: [{ type: 'function', name: 'get_issue_comments' }],
    executeToolCall: async () => ({ ok: true, data: [] }),
    maxIterations: 2,
  })

  expect(result.body).toMatch(/tool-call loop exceeded/i)
  expect(result.toolTrace.at(-1)).toEqual({
    name: 'agent_loop',
    cacheHit: false,
    errorCode: 'max_iterations_exceeded',
  })
})
