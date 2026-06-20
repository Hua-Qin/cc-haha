import { api } from './client'

export type PromptOptimizeRequest = {
  text: string
  sessionId?: string
  context?: {
    recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  }
}

export type PromptOptimizeUsage = {
  inputTokens?: number
  outputTokens?: number
}

export type PromptOptimizeResponse = {
  optimizedText: string
  usage?: PromptOptimizeUsage
}

export const promptOptimizeApi = {
  optimize(payload: PromptOptimizeRequest) {
    return api.post<PromptOptimizeResponse>('/api/prompt-optimize', payload)
  },
}
