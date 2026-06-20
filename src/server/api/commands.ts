/**
 * Commands REST API
 *
 * GET /api/commands — List all user-invocable commands available to the client.
 *
 * Returns command metadata for the command management UI:
 *   - builtin slash commands
 *   - skills (loaded from disk / bundled / plugins)
 *   - plugin commands
 *   - MCP-provided commands
 *
 * Commands with `userInvocable === false` are excluded.
 */

import { ApiError, errorResponse } from '../middleware/errorHandler.js'
import { getCwd } from '../../utils/cwd.js'
import {
  formatDescriptionWithSource,
  getCommands,
} from '../../commands.js'
import { getCommandName } from '../../types/command.js'

type CommandResponseSource = 'builtin' | 'skill' | 'plugin' | 'mcp' | 'bundled'

type CommandResponseItem = {
  name: string
  description: string
  source: CommandResponseSource
  category: string
  userInvocable: boolean
}

/**
 * Maps a Command's internal `source` / `loadedFrom` fields into the public
 * `CommandResponseSource` enum used by the desktop UI.
 */
function resolveSource(cmd: {
  type?: string
  loadedFrom?:
    | 'commands_DEPRECATED'
    | 'skills'
    | 'plugin'
    | 'managed'
    | 'bundled'
    | 'mcp'
  source?: string
}): CommandResponseSource {
  const loadedFrom = cmd.loadedFrom
  if (loadedFrom === 'mcp') return 'mcp'
  if (loadedFrom === 'plugin') return 'plugin'
  if (loadedFrom === 'bundled') return 'bundled'
  if (
    loadedFrom === 'skills' ||
    loadedFrom === 'commands_DEPRECATED' ||
    loadedFrom === 'managed'
  ) {
    return 'skill'
  }

  const source = cmd.source
  if (source === 'mcp') return 'mcp'
  if (source === 'plugin') return 'plugin'
  if (source === 'bundled') return 'bundled'
  return 'builtin'
}

/**
 * Best-effort category for a command based on its source. Plugins may have
 * additional grouping information in `pluginInfo`, but for now we keep this
 * simple and stable for the UI.
 */
function resolveCategory(cmd: {
  type?: string
  loadedFrom?: string
  source?: string
}): string {
  return resolveSource(cmd)
}

export async function handleCommandsApi(
  req: Request,
  url: URL,
  _segments: string[],
): Promise<Response> {
  try {
    if (req.method !== 'GET') {
      throw new ApiError(
        405,
        `Method ${req.method} not allowed`,
        'METHOD_NOT_ALLOWED',
      )
    }

    const cwd = url.searchParams.get('cwd') || getCwd()
    const allCommands = await getCommands(cwd)

    const commands: CommandResponseItem[] = []
    const seen = new Set<string>()

    for (const cmd of allCommands) {
      if (cmd.userInvocable === false) continue

      const name = getCommandName(cmd)
      if (seen.has(name)) continue
      seen.add(name)

      commands.push({
        name,
        description: formatDescriptionWithSource(cmd),
        source: resolveSource(cmd),
        category: resolveCategory(cmd),
        userInvocable: cmd.userInvocable !== false,
      })
    }

    commands.sort((a, b) => a.name.localeCompare(b.name))

    return Response.json({ commands })
  } catch (error) {
    return errorResponse(error)
  }
}
