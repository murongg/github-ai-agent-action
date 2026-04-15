const secretPatterns: Array<[RegExp, string]> = [
  [/Authorization:\s*(?:Bearer|token|Basic)\s+[^\s]+/gi, 'authorization header'],
  [/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, 'github token'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, 'github token'],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, 'openai api key'],
  [/\b(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE|AZURE|AWS|GITHUB|GH)_[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*([^\s]+)/gi, 'environment secret'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, 'private key'],
]

export function redactText(input: string): string {
  return secretPatterns.reduce((current, [pattern, label]) => current.replace(pattern, `<redacted:${label}>`), input)
}

export function truncateText(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input
  return `${input.slice(0, maxChars)}\n\n[truncated ${input.length - maxChars} characters]`
}
