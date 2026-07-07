import type { ReactNode } from 'react';
import { nextMonth, previousMonth } from '@budget/core';
import { monthLabel, todayISO } from '../lib/dates';

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-hairline bg-panel p-4 sm:p-5 ${className}`}>{children}</div>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.85em] text-ink">{children}</code>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-hairline bg-raised px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
      {children}
    </kbd>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm';
  return (
    <div className="inline-flex rounded-lg border border-hairline bg-raised p-0.5">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={active}
            className={`rounded-md transition-colors ${pad} ${
              active ? 'bg-panel font-medium text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function EditableText({ value, onCommit, className = '' }: { value: string; onCommit: (v: string) => void; className?: string }) {
  return (
    <input
      key={value}
      defaultValue={value}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v && v !== value) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={`rounded-md border border-transparent bg-transparent px-1.5 py-1 text-ink outline-none hover:border-hairline focus:border-ink/40 focus:bg-paper ${className}`}
    />
  );
}

export function MonthPicker({ ym, onChange }: { ym: string; onChange: (ym: string) => void }) {
  const currentYm = todayISO().slice(0, 7);
  return (
    <div className="inline-flex items-center gap-2">
      <div className="inline-flex items-center rounded-lg border border-hairline bg-raised">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => onChange(previousMonth(ym))}
          className="px-3 py-1.5 text-ink-muted transition-colors hover:text-ink"
        >
          ‹
        </button>
        <span className="min-w-[8.5rem] text-center font-serif text-sm text-ink">{monthLabel(ym)}</span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => onChange(nextMonth(ym))}
          className="px-3 py-1.5 text-ink-muted transition-colors hover:text-ink"
        >
          ›
        </button>
      </div>
      {ym !== currentYm && (
        <button
          type="button"
          onClick={() => onChange(currentYm)}
          className="text-xs text-ink-muted transition-colors hover:text-accent"
        >
          Today
        </button>
      )}
    </div>
  );
}

export function Stub({ title, phase }: { title: string; phase: string }) {
  return (
    <Panel>
      <h2 className="font-serif text-lg text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Coming in <span className="text-ink">{phase}</span>.
      </p>
    </Panel>
  );
}
