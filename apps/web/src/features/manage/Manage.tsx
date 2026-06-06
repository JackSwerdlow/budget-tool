import { useState } from 'react';
import type { LedgerData } from '@budget/core';
import { Segmented } from '../../components/ui';
import { ManageEntries } from './ManageEntries';
import { ManageTaxonomy } from './ManageTaxonomy';
import { ManageIncome } from './ManageIncome';

type View = 'entries' | 'taxonomy' | 'income';

export function Manage({ data }: { data: LedgerData }) {
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
            { id: 'income', label: 'Income' },
          ]}
        />
      </div>
      {view === 'entries' && <ManageEntries data={data} />}
      {view === 'taxonomy' && <ManageTaxonomy data={data} />}
      {view === 'income' && <ManageIncome data={data} />}
    </div>
  );
}
