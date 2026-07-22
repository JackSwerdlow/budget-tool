import type { ReactNode } from 'react';
import { Segmented } from './ui';

// The bar every tab pins above its SubTabPager panels (see MOBILE.md). One definition so the
// tabs can't drift apart: on a phone it sits in the shell's fixed region and the panels scroll
// under it, ending exactly on its bottom border; from `sm` up it's a plain row in the page.
//
// Row one is a two-slot flex row that deliberately **cannot wrap**: sub-tabs hard left, the
// tab's own control (a month picker, usually) hard right. Everything shared one `flex-wrap` row
// before, so at ~360px the left group filled it and pushed the month control onto its own line.
// Anything that doesn't fit that shape goes in `secondRow`.
export function PinnedTabBar<T extends string>({ value, onChange, options, right, secondRow, below }: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
  // Right-hand slot of row one — a month picker or similar. Omitted when a tab has no such control.
  right?: ReactNode;
  // Secondary controls under row one. Also a non-wrapping row: a control that reflowed onto a
  // line of its own moved the panels below it, so what fits is budgeted (see App.tsx's view
  // presets) rather than left to wrap.
  secondRow?: ReactNode;
  // Full-width content under both rows, inside the bar (Overview's Categories checklist), so it
  // opens attached to the controls it filters.
  below?: ReactNode;
}) {
  return (
    <div className="-mx-3 shrink-0 border-b border-hairline bg-paper px-3 max-sm:pb-1.5 max-sm:pt-1 sm:mx-0 sm:mb-6 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="min-w-0 shrink">
          <Segmented value={value} onChange={onChange} options={options} />
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {secondRow && <div className="mt-1.5 flex min-w-0 items-center gap-2 sm:mt-2 sm:gap-3">{secondRow}</div>}
      {below}
    </div>
  );
}
