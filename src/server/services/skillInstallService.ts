/**
 * Skill Install Service — handles online skill installation from a URL or
 * local path. The install flow is:
 *   1. Determine source type (URL vs local path).
 *   2. For URLs, fetch the zip into a temp directory (50MB limit).
 *   3. For local paths, verify the path is absolute and either a directory
 *      containing SKILL.md or a zip file.
 *   4. Locate SKILL.md, parse its frontmatter, and validate the schema.
 *   5. Review allowed-tools (warning, not a block).
 *   6. Check for existing installation conflicts.
 *   7. Copy contents to ~/.claude/skills/<name>/.
 *   8. Clear memoized skill/command caches.
 *
 * Temp files are always cleaned up in a finally block.
 */

import { createWriteStream } from 'node:fs'
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, parse as parsePath } from 'node:path'
import { clearCommandMemoizationCaches } from '../../commands.js'
import { logForDebugging } from '../../utils/debug.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { isENOENT } from '../../utils/errors.js'
import {
  type FrontmatterData,
  parseFrontmatter,
} from '../../utils/frontmatterParser.js'
import { parseSkillFrontmatterFields } from '../../skills/loadSkillsDir.js'
import { parseZipModes, unzipFile } from '../../utils/dxt/zip.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SkillInstallErrorCode =
  | 'INVALID_SOURCE'
  | 'PARSE_ERROR'
  | 'PERMISSION_DENIED'
  | 'IO_ERROR'
  | 'ALREADY_EXISTS'

export type SkillInstallSuccess = {
  ok: true
  name: string
  path: string
  warnings?: string[]
}

export type SkillInstallFailure = {
  ok: false
  error: string
  code: SkillInstallErrorCode
}

export type SkillInstallResult = SkillInstallSuccess | SkillInstallFailure

export type SkillInstallOptions = {
  /** Overwrite an existing skill with the same name. */
  overwrite?: boolean
}

export type InstallableSkill = {
  name: string
  description: string
  source: string
  version?: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024 // 50MB
const KEBAB_CASE_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Install a skill from a URL (http/https) or local absolute path.
 *
 * @param source   The URL or local absolute path to install from.
 * @param options  Optional install behavior (overwrite).
 */
export async function installSkill(
  source: string,
  options: SkillInstallOptions = {},
): Promise<SkillInstallResult> {
  const trimmed = source?.trim()
  if (!trimmed) {
    return failure('INVALID_SOURCE', 'Source is required')
  }

  let tempDir: string | undefined
  try {
    if (isHttpUrl(trimmed)) {
      const createdTempDir = await mkdtemp(join(tmpdir(), 'skill-install-'))
      tempDir = createdTempDir
      const zipPath = await downloadZip(trimmed, createdTempDir)
      return await installFromZip(zipPath, options)
    }

    if (isAbsolute(trimmed)) {
      const stats = await stat(trimmed).catch((err: unknown) => {
        if (isENOENT(err)) {
          throw installError(
            'INVALID_SOURCE',
            `Local path does not exist: ${trimmed}`,
          )
        }
        throw installError('IO_ERROR', errMessage(err))
      })

      if (stats.isDirectory()) {
        return await installFromDirectory(trimmed, options)
      }

      if (stats.isFile()) {
        const ext = parsePath(trimmed).ext.toLowerCase()
        if (ext === '.zip' || ext === '.mcpb') {
          return await installFromZip(trimmed, options)
        }
        throw installError(
          'INVALID_SOURCE',
          `Local file must be a zip archive (.zip/.mcpb) or directory: ${trimmed}`,
        )
      }

      throw installError(
        'INVALID_SOURCE',
        `Unsupported local path entry: ${trimmed}`,
      )
    }

    return failure(
      'INVALID_SOURCE',
      'Source must be an http(s) URL or an absolute local path',
    )
  } catch (error) {
    return toFailure(error)
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {
        /* best-effort cleanup */
      })
    }
  }
}

/**
 * Returns metadata for installable skills from a curated catalog. Currently
 * no catalog is configured, so we return an empty array. Reserved for future
 * use.
 */
export function listInstallableSkills(): InstallableSkill[] {
  return []
}

// ─── URL install path ───────────────────────────────────────────────────────

async function downloadZip(url: string, tempDir: string): Promise<string> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw installError(
      'INVALID_SOURCE',
      `Failed to download skill archive: HTTP ${response.status}`,
    )
  }

  const contentLength = response.headers.get('content-length')
  if (contentLength) {
    const declared = Number(contentLength)
    if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES) {
      throw installError(
        'INVALID_SOURCE',
        `Skill archive too large: ${declared} bytes (max ${MAX_DOWNLOAD_BYTES})`,
      )
    }
  }

  const targetPath = join(tempDir, 'skill.zip')
  const fileStream = createWriteStream(targetPath)
  let totalBytes = 0

  try {
    const reader = (response.body as ReadableStream<Uint8Array>).getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue
      totalBytes += value.byteLength
      if (totalBytes > MAX_DOWNLOAD_BYTES) {
        await reader.cancel().catch(() => {})
        throw installError(
          'INVALID_SOURCE',
          `Skill archive exceeded ${MAX_DOWNLOAD_BYTES} bytes`,
        )
      }
      const ok = fileStream.write(Buffer.from(value))
      if (!ok) {
        await new Promise<void>(resolve => fileStream.once('drain', () => resolve()))
      }
    }
    await new Promise<void>((resolve, reject) => {
      fileStream.end((err?: Error | null) => (err ? reject(err) : resolve()))
    })
  } catch (error) {
    await rm(targetPath, { force: true }).catch(() => {})
    throw error
  }

  return targetPath
}

// ─── Zip install path ────────────────────────────────────────────────────────

async function installFromZip(
  zipPath: string,
  options: SkillInstallOptions,
): Promise<SkillInstallResult> {
  const zipBytes = await readFile(zipPath)
  let entries: Record<string, Uint8Array>
  try {
    entries = await unzipFile(zipBytes)
  } catch (error) {
    throw installError(
      'PARSE_ERROR',
      `Failed to extract archive: ${errMessage(error)}`,
    )
  }

  let modes: Record<string, number> = {}
  try {
    modes = parseZipModes(new Uint8Array(zipBytes))
  } catch {
    modes = {}
  }

  const skillRoot = pickSkillRootFromZipEntries(entries)
  if (!skillRoot) {
    throw installError(
      'PARSE_ERROR',
      'Archive does not contain a SKILL.md at the root or in a single subdirectory',
    )
  }

  return await finalizeInstall(skillRoot, entries, modes, options)
}

// ─── Directory install path ──────────────────────────────────────────────────

async function installFromDirectory(
  dirPath: string,
  options: SkillInstallOptions,
): Promise<SkillInstallResult> {
  const skillMdPath = join(dirPath, 'SKILL.md')
  try {
    await stat(skillMdPath)
  } catch (error) {
    if (isENOENT(error)) {
      throw installError(
        'PARSE_ERROR',
        `Source directory does not contain SKILL.md: ${dirPath}`,
      )
    }
    throw installError('IO_ERROR', errMessage(error))
  }

  // Pack the directory into the same in-memory record shape zip entries use,
  // so the downstream validation/copy path is unified. Entries are keyed by
  // paths relative to dirPath, so we pass '' as the skillRootKey.
  const entries = await collectDirectoryEntries(dirPath, dirPath)
  const modes: Record<string, number> = {}
  return await finalizeInstall('', entries, modes, options)
}

async function collectDirectoryEntries(
  rootDir: string,
  currentDir: string,
  prefix: string = '',
): Promise<Record<string, Uint8Array>> {
  const result: Record<string, Uint8Array> = {}
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(currentDir, { withFileTypes: true })
  } catch (error) {
    throw installError('IO_ERROR', errMessage(error))
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = join(currentDir, entry.name)
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      const nested = await collectDirectoryEntries(rootDir, fullPath, relPath)
      Object.assign(result, nested)
    } else if (entry.isFile()) {
      const buffer = await readFile(fullPath)
      result[relPath] = new Uint8Array(buffer)
    }
  }

  return result
}

function pickSkillRootFromZipEntries(
  entries: Record<string, Uint8Array>,
): string | null {
  // First try entries directly at the zip root.
  if (entries['SKILL.md']) return ''

  // Otherwise find a single top-level subdirectory containing SKILL.md.
  const topLevelDirs = new Set<string>()
  for (const name of Object.keys(entries)) {
    const slash = name.indexOf('/')
    if (slash === -1) continue
    topLevelDirs.add(name.slice(0, slash))
  }

  if (topLevelDirs.size === 1) {
    const onlyDir = [...topLevelDirs][0]!
    const skillPath = `${onlyDir}/SKILL.md`
    if (entries[skillPath]) return onlyDir
  }

  // Look for a SKILL.md anywhere — disambiguate by prefix depth.
  for (const name of Object.keys(entries)) {
    if (name.endsWith('/SKILL.md')) {
      return name.slice(0, -'/SKILL.md'.length)
    }
  }

  return null
}

// ─── Shared finalize step ────────────────────────────────────────────────────

async function finalizeInstall(
  skillRootKey: string,
  entries: Record<string, Uint8Array>,
  modes: Record<string, number>,
  options: SkillInstallOptions,
): Promise<SkillInstallResult> {
  const warnings: string[] = []

  // Locate the SKILL.md bytes. skillRootKey is '' for entries at zip root.
  const skillMdKey = skillRootKey
    ? `${skillRootKey}/SKILL.md`
    : 'SKILL.md'
  const skillMdBytes = entries[skillMdKey]
  if (!skillMdBytes) {
    throw installError(
      'PARSE_ERROR',
      `Could not find SKILL.md inside archive at ${skillMdKey}`,
    )
  }

  const markdownContent = Buffer.from(skillMdBytes).toString('utf-8')
  const parsed = parseFrontmatter(markdownContent)
  const frontmatter: FrontmatterData = parsed.frontmatter || {}

  // Step 5: Validate schema.
  const name = typeof frontmatter.name === 'string' ? frontmatter.name.trim() : ''
  const description = typeof frontmatter.description === 'string'
    ? frontmatter.description.trim()
    : ''

  if (!name || !KEBAB_CASE_REGEX.test(name)) {
    throw installError(
      'PARSE_ERROR',
      'Skill frontmatter is missing a valid kebab-case "name" field',
    )
  }
  if (!description) {
    throw installError(
      'PARSE_ERROR',
      'Skill frontmatter is missing a non-empty "description" field',
    )
  }

  // Step 6: Permission review — record warnings but do not block.
  const skillFields = parseSkillFrontmatterFields(
    frontmatter,
    parsed.content,
    name,
  )
  if (skillFields.allowedTools.length > 0) {
    warnings.push(
      `Skill "${name}" requests allowed-tools: ${skillFields.allowedTools.join(', ')}. Review these before invoking.`,
    )
    logForDebugging(
      `[skill-install] Skill "${name}" declares allowed-tools: ${skillFields.allowedTools.join(', ')}`,
    )
  }

  // Step 7: Existence check.
  const targetDir = join(getClaudeConfigHomeDir(), 'skills', name)
  let existing: import('node:fs').Stats | null = null
  try {
    existing = await stat(targetDir)
  } catch (error) {
    if (!isENOENT(error)) {
      throw installError('IO_ERROR', errMessage(error))
    }
  }

  if (existing && !options.overwrite) {
    throw installError(
      'ALREADY_EXISTS',
      `Skill "${name}" already exists at ${targetDir}. Pass overwrite=true to replace it.`,
    )
  }

  // Step 8: Write into ~/.claude/skills/<name>/.
  if (existing) {
    await rm(targetDir, { recursive: true, force: true }).catch((err: unknown) => {
      throw installError(
        'PERMISSION_DENIED',
        `Unable to remove existing skill directory: ${errMessage(err)}`,
      )
    })
  }

  await mkdir(targetDir, { recursive: true }).catch((err: unknown) => {
    throw installError(
      'PERMISSION_DENIED',
      `Unable to create skill directory ${targetDir}: ${errMessage(err)}`,
    )
  })

  const rootPrefix = skillRootKey ? `${skillRootKey}/` : ''
  for (const [relPath, data] of Object.entries(entries)) {
    if (!relPath.startsWith(rootPrefix)) continue
    const trimmedRel = relPath.slice(rootPrefix.length)
    if (!trimmedRel || trimmedRel.startsWith('.') || trimmedRel.includes('..')) {
      continue
    }
    const targetPath = join(targetDir, trimmedRel)
    const targetParent = dirname(targetPath)
    await mkdir(targetParent, { recursive: true }).catch((err: unknown) => {
      throw installError('IO_ERROR', `mkdir ${targetParent}: ${errMessage(err)}`)
    })
    await writeFile(targetPath, data).catch((err: unknown) => {
      throw installError('IO_ERROR', `writeFile ${targetPath}: ${errMessage(err)}`)
    })

    const mode = modes[relPath]
    if (mode && (mode & 0o100)) {
      // Preserve executable bit (any of user/group/other execute).
      await chmod(targetPath, mode & 0o777).catch(() => {
        /* best-effort */
      })
    }
  }

  // When installing from a local directory, files are read with native FS mode
  // bits already; nothing to copy here.

  // Step 9: Clear command memoization caches so the new skill is picked up.
  try {
    clearCommandMemoizationCaches()
  } catch (error) {
    logForDebugging(
      `[skill-install] clearCommandMemoizationCaches failed: ${errMessage(error)}`,
    )
  }

  return {
    ok: true,
    name,
    path: targetDir,
    ...(warnings.length > 0 ? { warnings } : {}),
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function failure(code: SkillInstallErrorCode, error: string): SkillInstallFailure {
  return { ok: false, code, error }
}

function installError(code: SkillInstallErrorCode, message: string): SkillInstallError {
  const err = new Error(message) as SkillInstallError
  err.installCode = code
  return err
}

type SkillInstallError = Error & { installCode: SkillInstallErrorCode }

function toFailure(error: unknown): SkillInstallResult {
  if (error && typeof error === 'object' && 'installCode' in error) {
    const e = error as SkillInstallError
    return failure(e.installCode, e.message)
  }
  return failure('IO_ERROR', errMessage(error))
}

function errMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}