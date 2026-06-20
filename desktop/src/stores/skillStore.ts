import { create } from 'zustand'
import { skillsApi } from '../api/skills'
import type {
  SkillMeta,
  SkillDetail,
  SkillInstallResult,
  InstallableSkill,
} from '../types/skill'

export type SkillDetailReturnTab = 'skills' | 'plugins'

type SkillStore = {
  skills: SkillMeta[]
  selectedSkill: SkillDetail | null
  selectedSkillReturnTab: SkillDetailReturnTab
  isLoading: boolean
  isDetailLoading: boolean
  error: string | null

  fetchSkills: (cwd?: string) => Promise<void>
  fetchSkillDetail: (
    source: string,
    name: string,
    cwd?: string,
    returnTab?: SkillDetailReturnTab,
  ) => Promise<void>
  installSkill: (
    source: string,
    options?: { overwrite?: boolean },
  ) => Promise<SkillInstallResult>
  listInstallable: () => Promise<InstallableSkill[]>
  clearSelection: () => void
}

export const useSkillStore = create<SkillStore>((set, get) => ({
  skills: [],
  selectedSkill: null,
  selectedSkillReturnTab: 'skills',
  isLoading: false,
  isDetailLoading: false,
  error: null,

  fetchSkills: async (cwd) => {
    set({ isLoading: true, error: null })
    try {
      const { skills } = await skillsApi.list(cwd)
      set({ skills, isLoading: false })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      })
    }
  },

  fetchSkillDetail: async (source, name, cwd, returnTab = 'skills') => {
    set({ isDetailLoading: true, error: null })
    try {
      const { detail } = await skillsApi.detail(source, name, cwd)
      set({
        selectedSkill: detail,
        selectedSkillReturnTab: returnTab,
        isDetailLoading: false,
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isDetailLoading: false,
      })
    }
  },

  installSkill: async (source, options) => {
    const result = await skillsApi.install(source, options)
    if (result.ok) {
      // Refresh the skill list so newly installed skills appear immediately.
      const currentCwd = get().selectedSkill?.skillRoot
      await get().fetchSkills(currentCwd)
    }
    return result
  },

  listInstallable: async () => {
    const { skills } = await skillsApi.listInstallable()
    return skills
  },

  clearSelection: () => set({ selectedSkill: null, selectedSkillReturnTab: 'skills' }),
}))
