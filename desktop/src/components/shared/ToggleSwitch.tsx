export function ToggleSwitch({
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
        checked ? 'bg-[var(--color-switch-checked-bg)]' : 'bg-[var(--color-border)]'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-6 w-6 transform rounded-full bg-[var(--color-switch-thumb)] shadow-sm transition-transform ${
          checked ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
  )
}