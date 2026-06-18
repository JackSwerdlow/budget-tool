import { useState } from 'react';
import { formatGBP, listTotals, type LedgerData } from '@budget/core';
import { createList } from '../api';
import { useData } from '../data';
import { ListForm } from './ListForm';

export function AddList({ data }: { data: LedgerData }) {
  const { refresh } = useData();
  const [saved, setSaved] = useState<string | null>(null);
  // Remount the form after a successful save to reset every field for the next list.
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      {saved && <p className="text-sm text-under">{saved}</p>}
      <ListForm
        key={formKey}
        data={data}
        submitLabel="Save list"
        onSubmit={async (input) => {
          const created = await createList(input);
          await refresh();
          setSaved(`Saved — ${formatGBP(listTotals(created).mine)} filed to your share.`);
          setFormKey((k) => k + 1);
        }}
      />
    </div>
  );
}
