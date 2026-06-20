/**
 * Prompt Optimization REST API
 *
 * POST /api/prompt-optimize — Send the user's draft prompt to a small/fast
 * model (Haiku by default) for rewriting. The call is dispatched through
 * `queryWithModel` so Trace capture, cost tracking, and provider routing
 * happen automatically.
 */

import { APIUserAbortError } from '@anthropic-ai/sdk'
import { queryWithModel } from '../../services/api/claude.js'
import { logError } from '../../utils/log.js'
import { getAssistantMessageText } from '../../utils/messages.js'
import {
  getMainLoopModel,
  getSmallFastModel,
  parseUserSpecifiedModel,
} from '../../utils/model/model.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import { ApiError, errorResponse } from '../middleware/errorHandler.js'
import { SettingsService } from '../services/settingsService.js'
import { ProviderService } from '../services/providerService.js'
import type { PromptOptimizationSettings } from '../services/settingsService.js'

const DEFAULT_OPTIMIZE_PROMPT =
  "You are a prompt engineering assistant. Improve the user's prompt to be clearer, more specific, and more effective. Preserve intent. Return ONLY the improved prompt, no explanation."

const DEFAULT_OPTIMIZE_MODEL = 'haiku'
const DEFAULT_OPTIMIZE_TEMPERATURE = 0.3
const DEFAULT_OPTIMIZE_MAX_TOKENS = 1024

const MAX_INPUT_TEXT_LENGTH = 32_000
const MAX_CONTEXT_MESSAGES = 10
const REQUEST_TIMEOUT_MS = 30_000

type OptimizeRequestBody = {
  text?: unknown
  sessionId?: unknown
  context?: {
    recentMessages?: Array<{ role?: unknown; content?: unknown }>
  }
}

type OptimizeResponse = {
  optimizedText: string
  usage?: { inputTokens: number; outputTokens: number }
}

export async function handlePromptOptimizeApi(
  req: Request,
  _url: URL,
  _segments: string[],
): Promise<Response> {
  if (req.method !== 'POST') {
    return errorResponse(
      new ApiError(
        405,
        `Method ${req.method} not allowed on /api/prompt-optimize`,
        'METHOD_NOT_ALLOWED',
      ),
    )
  }

  try {
    const body = await parseBody(req)
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) {
      throw ApiError.badRequest('Missing or empty "text" in request body')
    }
    if (text.length > MAX_INPUT_TEXT_LENGTH) {
      throw ApiError.badRequest(
        `"text" exceeds maximum length of ${MAX_INPUT_TEXT_LENGTH} characters`,
      )
    }

    const recentMessages = sanitizeRecentMessages(body.context?.recentMessages)
    const settings = await loadOptimizationSettings()

    if (!settings.enabled) {
      throw ApiError.badRequest('Prompt optimization is disabled in user settings')
    }

    const optimizedText = await optimizePrompt({
      text,
      recentMessages,
      settings,
    })

    return Response.json({
      optimizedText,
    } satisfies OptimizeResponse)
  } catch (error) {
    return errorResponse(error)
  }
}

async function parseBody(req: Request): Promise<OptimizeRequestBody> {
  if (
    !req.headers.get('content-length') &&
    !req.headers.get('transfer-encoding') &&
    !req.headers.get('content-type')
  ) {
    throw ApiError.badRequest('Missing JSON body')
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }

  if (!raw || typeof raw !== 'object') {
    throw ApiError.badRequest('Request body must be a JSON object')
  }

  return raw as OptimizeRequestBody
}

function sanitizeRecentMessages(
  messages: unknown,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(messages)) {
    return []
  }

  const cleaned: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const entry of messages.slice(-MAX_CONTEXT_MESSAGES)) {
    if (!entry || typeof entry !== 'object') continue
    const role = entry.role === 'assistant' ? 'assistant' : 'user'
    if (typeof entry.content !== 'string') continue
    const content = entry.content.trim()
    if (!content) continue
    cleaned.push({ role, content: content.slice(0, 2_000) })
  }
  return cleaned
}

async function loadOptimizationSettings(): Promise<PromptOptimizationSettings> {
  const settingsService = new SettingsService()
  const userSettings = await settingsService.getUserSettings()
  const raw = (userSettings as Record<string, unknown>).promptOptimization

  const enabled = isPlainObject(raw) && raw.enabled !== false
  const optimizePrompt = pickString(raw, 'optimizePrompt') || DEFAULT_OPTIMIZE_PROMPT
  // Empty string means "use the currently active model" (getMainLoopModel)
  const modelInput = pickString(raw, 'model') ?? ''
  const temperature = pickNumber(raw, 'temperature', DEFAULT_OPTIMIZE_TEMPERATURE)
  const maxTokens = pickNumber(raw, 'maxTokens', DEFAULT_OPTIMIZE_MAX_TOKENS)

  return {
    enabled,
    optimizePrompt,
    model: modelInput,
    temperature,
    maxTokens,
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function pickString(
  source: unknown,
  key: string,
): string | null {
  if (!isPlainObject(source)) return null
  const value = source[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function pickNumber(
  source: unknown,
  key: string,
  fallback: number,
): number {
  if (!isPlainObject(source)) return fallback
  const value = source[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return fallback
}

async function optimizePrompt(params: {
  text: string
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  settings: PromptOptimizationSettings
}): Promise<string> {
  const { text, recentMessages, settings } = params

  // Use providerService.checkAuthStatus() which checks cc-haha provider config,
  // env vars, and original settings — more accurate than env-only checks.
  const providerService = new ProviderService()
  const authStatus = await providerService.checkAuthStatus()
  if (!authStatus.hasAuth) {
    throw ApiError.badRequest(
      '请先登录或在服务商设置中配置 API Key 后再使用提示词优化',
    )
  }

  // When no explicit model is configured, use the currently active model.
  const model = settings.model ? resolveModel(settings.model) : getMainLoopModel()
  const userPrompt = buildUserPrompt(text, recentMessages)
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  try {
    const response = await queryWithModel({
      systemPrompt: asSystemPrompt([settings.optimizePrompt]),
      userPrompt,
      signal,
      options: {
        getToolPermissionContext: async () => getEmptyToolPermissionContext(),
        model,
        isNonInteractiveSession: true,
        hasAppendSystemPrompt: false,
        agents: [],
        mcpTools: [],
        querySource: 'prompt_optimize',
        temperatureOverride: clampTemperature(settings.temperature),
        maxOutputTokensOverride: Math.max(
          64,
          Math.floor(settings.maxTokens ?? DEFAULT_OPTIMIZE_MAX_TOKENS),
        ),
        enablePromptCaching: false,
      },
    })

    if (response.isApiErrorMessage) {
      const message = getAssistantMessageText(response) || 'Model returned an error'
      throw ApiError.internal(`Prompt optimization failed: ${message}`)
    }

    const optimized = getAssistantMessageText(response)
    if (!optimized) {
      throw ApiError.internal('Prompt optimization returned no text')
    }
    return optimized.trim()
  } catch (error) {
    if (error instanceof APIUserAbortError) {
      throw ApiError.internal('Prompt optimization request was aborted')
    }
    if (error instanceof ApiError) {
      throw error
    }
    logError(toError(error))
    throw ApiError.internal(
      `Prompt optimization failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

function resolveModel(modelInput: string): string {
  if (!modelInput || modelInput.trim().length === 0) {
    return getSmallFastModel()
  }
  try {
    return parseUserSpecifiedModel(modelInput)
  } catch {
    return getSmallFastModel()
  }
}

function clampTemperature(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_OPTIMIZE_TEMPERATURE
  // Anthropic API accepts temperatures in [0, 1]; clamp to be safe.
  return Math.min(1, Math.max(0, value))
}

function buildUserPrompt(
  text: string,
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
): string {
  const contextBlock = recentMessages.length
    ? `${recentMessages
        .map(
          m =>
            `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`,
        )
        .join('\n')}\n\n`
    : ''

  return [
    contextBlock
      ? 'Recent conversation context (for reference only — do not continue it):'
      : '',
    contextBlock,
    'Draft prompt to improve:',
    '"""',
    text,
    '"""',
  ]
    .filter(Boolean)
    .join('\n')
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

// Exposed for unit tests / shared utilities. Not used by the router directly.
export const __testing = {
  buildUserPrompt,
  clampTemperature,
  resolveModel,
  sanitizeRecentMessages,
  loadOptimizationSettings,
  DEFAULT_OPTIMIZE_PROMPT,
  DEFAULT_OPTIMIZE_MODEL,
  DEFAULT_OPTIMIZE_TEMPERATURE,
  DEFAULT_OPTIMIZE_MAX_TOKENS,
}
