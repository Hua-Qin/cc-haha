import { api } from './client'
import type {
  SkillMeta,
  SkillDetail,
  SkillInstallResult,
  InstallableSkill,
} from '../types/skill'

export const skillsApi = {
  list: (cwd?: string) => {
    const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''
    return api.get<{ skills: SkillMeta[] }>(`/api/skills${query}`, { timeout: 120_000 })
  },

  detail: (source: string, name: string, cwd?: string) => {
    const query = new URLSearchParams({
      source,
      name,
    })
    if (cwd) query.set('cwd', cwd)

    return api.get<{ detail: SkillDetail }>(
      `/api/skills/detail?${query.toString()}`,
      { timeout: 120_000 },
    )
  }

  install: (source: string, options?: { overwrite?: boolean }) => {
    return api.post<SkillInstallResult>('/api/skills/install', {
      source,
      overwrite: options?.overwrite ?? false,
    })
  },

  listInstallable: () => {
    return api.get<{ skills: InstallableSkill[] }>('/api/skills/installable', {
      timeout: 120_000,
    })
  },
}
