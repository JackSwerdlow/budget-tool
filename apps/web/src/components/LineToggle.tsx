// Pill toggle for a chart reference line — same pressed/idle look as the
// category-filter buttons (CategoryVisibilityPanel). Shared by RunningChart and TrendsBars.
export function LineToggle({ label, pressed, color, onClick }: {
  label: string; pressed: boolean; color: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`px-2.5 py-1 text-xs transition-all duration-100 ${
        pressed ? 'rounded-full text-ink' : 'rounded-md text-ink-faint hover:text-ink-muted'
      }`}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} ${pressed ? 32 : 8}%, var(--color-panel))`,
        boxShadow: pressed ? `inset 0 0 0 1px ${color}` : undefined,
      }}
    >
      {label}
    </button>
  );
}
