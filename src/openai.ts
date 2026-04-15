import OpenAI from 'openai'

export function extractTextResponse(response: { output_text?: string }): string {
  if (!response.output_text) {
    throw new Error('OpenAI response did not include output_text')
  }
  return response.output_text
}

export function createOpenAIClient(options: {
  apiKey: string
  baseURL?: string
}): OpenAI {
  return new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
  })
}

export async function generateAgentReply(options: {
  apiKey: string
  baseURL?: string
  model: string
  prompt: string
}): Promise<string> {
  const client = createOpenAIClient({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
  })
  const response = await client.responses.create({
    model: options.model,
    input: options.prompt,
  })
  return extractTextResponse(response)
}
