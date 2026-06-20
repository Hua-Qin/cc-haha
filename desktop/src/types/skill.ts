export type SkillSource = 'user' | 'project' | 'plugin' | 'mcp' | 'bundled'

export type SkillMeta = {
  name: string
  displayName?: string
  description: string
  source: SkillSource
  userInvocable: boolean
  version?: string
  contentLength: number
  hasDirectory: boolean
  pluginName?: string
}

export type FileTreeNode = {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
}

export type SkillFrontmatter = Record<string, unknown>

export type SkillFile = {
  path: string
  content: string
  language: string
  frontmatter?: SkillFrontmatter
  body?: string
  isEntry?: boolean
}

export type SkillDetail = {
  meta: SkillMeta
  tree: FileTreeNode[]
  files: SkillFile[]
  skillRoot: string
}

export type SkillInstallSourceType = 'url' | 'local'

export type SkillInstallErrorCode =
  | 'INVALID_SOURCE'
  | 'PARSE_ERROR'
  | 'PERMISSION_DENIED'
  | 'IO_ERROR'
  | 'ALREADY_EXISTS'

export type SkillInstallResult = {
  ok: boolean
  name?: string
  path?: string
  warnings?: string[]
  error?: string
  code?: SkillInstallErrorCode
}

export type SkillInstallError = {
  ok: false
  error: string
  code: SkillInstallErrorCode
}

export type InstallableSkill = {
  name: string
  description: string
  source: string
  sourceType: SkillInstallSourceType
  version?: string
}
