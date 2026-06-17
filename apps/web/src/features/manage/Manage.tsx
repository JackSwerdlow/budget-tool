import { useState } from 'react';
import type { LedgerData } from '@budget/core';
import { Segmented } from '../../components/ui';
import { ManageEntries } from './ManageEntries';
import { ManageTaxonomy } from './ManageTaxonomy';
import { ImportDatabase } from './ImportDatabase';

type View = 'entries' | 'taxonomy';

export function Manage({ data, ym, onYmChange }: { data: LedgerData; ym: string; onYmChange: (ym: string) => void }) {
  const [view, setView] = useState<View>('entries');
  return (
    <div>
      <div className="mb-6">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { id: 'entries', label: 'Entries' },
            { id: 'taxonomy', label: 'Taxonomy' },
          ]}
        />
      </div>
      {view === 'entries' && <ManageEntries data={data} ym={ym} onYmChange={onYmChange} />}
      {view === 'taxonomy' && <ManageTaxonomy data={data} />}
      <ImportDatabase />
    </div>
  );
}
