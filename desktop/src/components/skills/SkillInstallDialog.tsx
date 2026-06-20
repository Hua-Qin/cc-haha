import { useState } from 'react'
import { PackagePlus, Loader2 } from 'lucide-react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { useTranslation } from '../../i18n'
import { useSkillStore } from '../../stores/skillStore'

type InstallStatus =
  | { kind: 'idle' }
  | { kind: 'installing' }
  | { kind: 'success'; name: string; warnings?: string[] }
  | { kind: 'error'; error: string; code?: string }

type Props = {
  open: boolean
  onClose: () => void
}

export function SkillInstallDialog({ open, onClose }: Props) {
  const t = useTranslation()
  const installSkill = useSkillStore((s) => s.installSkill)
  const [source, setSource] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [status, setStatus] = useState<InstallStatus>({ kind: 'idle' })

  const reset = () => {
    setSource('')
    setOverwrite(false)
    setStatus({ kind: 'idle' })
  }

  const handleClose = () => {
    if (status.kind === 'installing') return
    reset()
    onClose()
  }

  const handleInstall = async () => {
    const trimmed = source.trim()
    if (!trimmed) return
    setStatus({ kind: 'installing' })
    try {
      const result = await installSkill(trimmed, { overwrite })
      if (result.ok) {
        setStatus({
          kind: 'success',
          name: result.name ?? trimmed,
          warnings: result.warnings,
        })
      } else {
        setStatus({
          kind: 'error',
          error: result.error ?? 'Installation failed',
          code: result.code,
        })
      }
    } catch (err) {
      setStatus({
        kind: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const isInstalling = status.kind === 'installing'
  const isFinished = status.kind === 'success' || status.kind === 'error'

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('skills.install.title')}
      footer={
        <>
          {!isFinished && (
            <Button variant="ghost" onClick={handleClose} disabled={isInstalling}>
              {t('common.cancel')}
            </Button>
          )}
          {isFinished ? (
            <Button variant="primary" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleInstall}
              disabled={!source.trim() || isInstalling}
              loading={isInstalling}
            >
              {t('skills.install.button')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="skill-install-source"
            className="text-sm font-medium text-[var(--color-text-primary)]"
          >
            {t('skills.install.sourceLabel')}
          </label>
          <input
            id="skill-install-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder={t('skills.install.sourcePlaceholder')}
            disabled={isInstalling || isFinished}
            className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none transition-colors focus:border-[var(--color-border-focus)] focus:shadow-[var(--shadow-focus-ring)] disabled:opacity-60"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(event) => setOverwrite(event.target.checked)}
            disabled={isInstalling || isFinished}
            className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-brand)] focus:ring-[var(--color-brand)]"
          />
          {t('skills.install.overwrite')}
        </label>

        {isInstalling && (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-3 py-3 text-sm text-[var(--color-text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-brand)]" />
            {t('skills.install.installing')}
          </div>
        )}

        {status.kind === 'success' && (
          <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-success)] bg-[var(--color-success-container)] px-3 py-3 text-sm text-[var(--color-success)]">
            <PackagePlus className="h-4 w-4" />
            <span>{t('skills.install.success', { name: status.name })}</span>
            {status.warnings && status.warnings.length > 0 && (
              <ul className="ml-4 list-disc text-xs">
                {status.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {status.kind === 'error' && (
          <div className="flex flex-col gap-1 rounded-lg border border-[var(--color-error)] bg-[var(--color-error-container)] px-3 py-3 text-sm text-[var(--color-error)]">
            <span>{t('skills.install.error')}</span>
            <span className="text-xs">{status.error}</span>
            {status.code && (
              <span className="text-[10px] uppercase tracking-wider opacity-80">
                {status.code}
              </span>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
