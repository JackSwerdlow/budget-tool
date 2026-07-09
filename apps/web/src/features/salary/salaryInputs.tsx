export const labelClass = 'block text-xs uppercase tracking-wide text-ink-faint mb-1';
export const poundInputClass = 'w-full rounded-md border border-hairline bg-paper py-2 pl-7 pr-3 text-sm text-ink outline-none focus:border-ink/40';
export const inputClass = 'w-full rounded-md border border-hairline bg-paper py-2 px-3 text-sm text-ink outline-none focus:border-ink/40';

export function PoundInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  // Full-height flex column with the input pushed to the bottom: grid cells in a row share the
  // tallest cell's height, so a label that wraps to two lines (e.g. "Untaxed income (this month)")
  // no longer shoves its input out of line with its single-line neighbour.
  return (
    <div className="flex h-full flex-col">
      <label className={labelClass}>{label}</label>
      <div className="relative mt-auto">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">£</span>
        <input className={poundInputClass} value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder="0.00" />
      </div>
    </div>
  );
}

export function PctInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <input className="w-full rounded-md border border-hairline bg-paper py-2 pl-3 pr-7 text-sm text-ink outline-none focus:border-ink/40" value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder="0" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">%</span>
      </div>
    </div>
  );
}
