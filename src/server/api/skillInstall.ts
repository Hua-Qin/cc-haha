/**
 * Skill Install REST API
 *
 * POST /api/skills/install       — Install a skill from a URL or local path
 * GET  /api/skills/installable   — List installable skills from the catalog
 *
 * Body for POST:
 *   { source: string, overwrite?: boolean }
 *
 * On success returns { ok: true, name, path, warnings? }.
 * On failure returns { ok: false, error, code }.
 */

import { ApiError, errorResponse } from '../middleware/errorHandler.js'
import {
  installSkill,
  listInstallableSkills,
  type SkillInstallResult,
} from '../services/skillInstallService.js'

export async function handleSkillInstallApi(
  req: Request,
  _url: URL,
  segments: string[],
): Promise<Response> {
  try {
    const sub = segments[2]

    if (req.method === 'GET' && sub === 'installable') {
      return Response.json({ skills: listInstallableSkills() })
    }

    if (req.method === 'POST' && sub === 'install') {
      return await handleInstall(req)
    }

    throw new ApiError(
      405,
      `Method ${req.method} not allowed on /api/skills${sub ? `/${sub}` : ''}`,
      'METHOD_NOT_ALLOWED',
    )
  } catch (error) {
    return errorResponse(error)
  }
}

async function handleInstall(req: Request): Promise<Response> {
  const body = await parseJsonBody(req)
  const source = typeof body.source === 'string' ? body.source : ''
  const overwrite = body.overwrite === true

  const result: SkillInstallResult = await installSkill(source, { overwrite })
  if (result.ok) {
    return Response.json(result, { status: 200 })
  }

  // Map error codes to HTTP status codes.
  const status = statusForCode(result.code)
  return Response.json(result, { status })
}

function statusForCode(
  code:
    | 'INVALID_SOURCE'
    | 'PARSE_ERROR'
    | 'PERMISSION_DENIED'
    | 'IO_ERROR'
    | 'ALREADY_EXISTS',
): number {
  switch (code) {
    case 'INVALID_SOURCE':
    case 'PARSE_ERROR':
      return 400
    case 'PERMISSION_DENIED':
      return 403
    case 'ALREADY_EXISTS':
      return 409
    case 'IO_ERROR':
      return 500
  }
}

async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  if (
    !req.headers.get('content-length') &&
    !req.headers.get('transfer-encoding') &&
    !req.headers.get('content-type')
  ) {
    return {}
  }

  try {
    const body = await req.json()
    return body && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : {}
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }
}