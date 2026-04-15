import OpenAI from 'openai'

export function extractTextResponse(response: { output_text?: string }): string {
  if (!response.output_text) {
    throw new Error('OpenAI response did not include output_text')
  }
  return response.output_text
}

export function createOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey })
}

export async function generateAgentReply(options: {
  apiKey: string
  model: string
  prompt: string
}): Promise<string> {
  const client = createOpenAIClient(options.apiKey)
  const response = await client.responses.create({
    model: options.model,
    input: options.prompt,
  })
  return extractTextResponse(response)
}
