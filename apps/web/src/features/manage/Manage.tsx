import { useState } from 'react';
import type { LedgerData } from '@budget/core';
import { Segmented } from '../../components/ui';
import { ManageEntries } from './ManageEntries';
import { ManageTaxonomy } from './ManageTaxonomy';
import { ManageViews } from './ManageViews';
import { DatabaseTools } from './DatabaseTools';

// Named ManageTab (not View) — this app's core `View` type (a saved category-hide preset,
// see ManageViews.tsx) is a distinct concept from this tab selector.
type ManageTab = 'entries' | 'taxonomy' | 'views';

export function Manage({ data, ym, onYmChange }: { data: LedgerData; ym: string; onYmChange: (ym: string) => void }) {
  const [tab, setTab] = useState<ManageTab>('entries');
  return (
    <div>
      <div className="mb-6">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: 'entries', label: 'Entries' },
            { id: 'taxonomy', label: 'Taxonomy' },
            { id: 'views', label: 'Views' },
          ]}
        />
      </div>
      {tab === 'entries' && <ManageEntries data={data} ym={ym} onYmChange={onYmChange} />}
      {tab === 'taxonomy' && <ManageTaxonomy data={data} />}
      {tab === 'views' && <ManageViews data={data} />}
      <DatabaseTools />
    </div>
  );
}
