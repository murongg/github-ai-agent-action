import { expect, test } from 'vitest'
import { parseCommand } from '../src/commands.js'
import { parseInputsFromObject } from '../src/inputs.js'

test('parseCommand ignores non-ai comments', () => {
  expect(parseCommand('hello')).toBeUndefined()
})

test('parseCommand supports common modes and freeform conversation', () => {
  expect(parseCommand('/ai diagnose-ci')).toEqual({ mode: 'diagnose-ci', rawBody: '/ai diagnose-ci', text: '' })
  expect(parseCommand('/ai review focus on security')).toEqual({ mode: 'review', rawBody: '/ai review focus on security', text: 'focus on security' })
  expect(parseCommand('/ai explain this diff')).toEqual({ mode: 'explain', rawBody: '/ai explain this diff', text: 'this diff' })
  expect(parseCommand('/ai plan add validation')).toEqual({ mode: 'plan', rawBody: '/ai plan add validation', text: 'add validation' })
  expect(parseCommand('/ai approve')).toEqual({ mode: 'approve', rawBody: '/ai approve', text: '' })
  expect(parseCommand('/ai what failed here?')).toEqual({ mode: 'conversation', rawBody: '/ai what failed here?', text: 'what failed here?' })
})

test('parseInputsFromObject applies defaults', () => {
  const inputs = parseInputsFromObject({
    'openai-api-key': 'sk-test',
    'github-token': 'ghs-test',
    model: '',
    'allow-users': 'alice, bob',
    'allow-associations': '',
    'enable-write-actions': '',
    'max-diff-chars': '',
    'max-log-chars': '',
    'allowed-operations': '',
  })

  expect(inputs.allowUsers).toEqual(['alice', 'bob'])
  expect(inputs.allowAssociations).toEqual(['OWNER', 'MEMBER', 'COLLABORATOR'])
  expect(inputs.enableWriteActions).toBe(false)
  expect(inputs.allowedOperations).toContain('add-labels')
})
