import { expect, test } from 'vitest'
import { createOpenAIClient, extractTextResponse } from '../src/openai.js'
import { buildReplyBody } from '../src/comment.js'

test('extractTextResponse handles output_text', () => {
  expect(extractTextResponse({ output_text: 'hello' })).toBe('hello')
})

test('buildReplyBody appends read-only marker when no pending operation exists', () => {
  const body = buildReplyBody(
    { body: 'Analysis here.' },
    undefined,
    {
      threadId: 'issue-42:alice',
      requestedBy: 'alice',
      mode: 'review',
      replyToCommentId: 123,
    },
  )
  expect(body).toMatch(/github-ai-agent-action:reply/)
  expect(body).toMatch(/issue-42:alice/)
  expect(body).toMatch(/"requestedBy":"alice"/)
  expect(body).toMatch(/Analysis here/)
  expect(body).toMatch(/No repository changes were made/)
})

test('createOpenAIClient supports overriding baseURL', () => {
  const client = createOpenAIClient({
    apiKey: 'sk-test',
    baseURL: 'https://example.com/v1',
  })

  expect(client.baseURL).toBe('https://example.com/v1')
})
