import { api } from './client'

export type CommandSource = 'builtin' | 'skill' | 'plugin' | 'mcp' | 'bundled'

export type CommandMeta = {
  name: string
  description: string
  source: CommandSource
  category: string
  userInvocable: boolean
}

export type CommandsListResponse = {
  commands: CommandMeta[]
}

export const commandsApi = {
  list: () => api.get<CommandsListResponse>('/api/commands'),
}