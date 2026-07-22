import { useCallback, useState } from 'react';
import type { LedgerData } from '@budget/core';
import { PinnedTabBar } from '../../components/PinnedTabBar';
import { SubTabPager } from '../../components/SubTabPager';
import { ManageEntries } from './ManageEntries';
import { ManageTaxonomy } from './ManageTaxonomy';
import { ManageViews } from './ManageViews';
import { DatabaseTools } from './DatabaseTools';
import { ExportData } from './ExportData';

// Named ManageTab (not View) — this app's core `View` type (a saved category-hide preset,
// see ManageViews.tsx) is a distinct concept from this tab selector.
type ManageTab = 'entries' | 'taxonomy' | 'views' | 'data';
// Slide order for the pager, and what maps its index back to a tab id.
const MANAGE_TABS = ['entries', 'taxonomy', 'views', 'data'] as const satisfies readonly ManageTab[];

// Manage's month picker stays inside ManageEntries rather than moving to the bar's right slot:
// it's paired with that screen's "all months" toggle and disappears with it, so it isn't the
// tab-level control that slot is for.
export function Manage({ data, ym, onYmChange }: { data: LedgerData; ym: string; onYmChange: (ym: string) => void }) {
  const [tab, setTab] = useState<ManageTab>('entries');
  const onIndexChange = useCallback((i: number) => setTab(MANAGE_TABS[i]), []);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PinnedTabBar
        value={tab}
        onChange={setTab}
        options={[
          { id: 'entries', label: 'Entries' },
          { id: 'taxonomy', label: 'Taxonomy' },
          { id: 'views', label: 'Views' },
          { id: 'data', label: 'Data' },
        ]}
      />
      <SubTabPager index={MANAGE_TABS.indexOf(tab)} onIndexChange={onIndexChange}>
        {[
          <ManageEntries key="entries" data={data} ym={ym} onYmChange={onYmChange} />,
          <ManageTaxonomy key="taxonomy" data={data} />,
          <ManageViews key="views" data={data} />,
          // Export and the database tools used to render under every sub-tab. Now that panels
          // scroll themselves there is nowhere for always-on sections to live, and putting the
          // destructive database actions behind their own tab means you arrive there deliberately.
          <div key="data" className="flex flex-col gap-8">
            <ExportData data={data} />
            <DatabaseTools />
          </div>,
        ]}
      </SubTabPager>
    </div>
  );
}
