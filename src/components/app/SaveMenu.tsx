import { useState } from 'react';
import { Bookmark, Check, Plus } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { Menu } from '../ui/misc';
import Button from '../ui/Button';
import { roleCan } from '../../server/access';

export default function SaveMenu({ creatorId, compact }: { creatorId: string; compact?: boolean }) {
  const { ctx, orgId, role } = useOrg();
  const act = useAction();
  const cols = useQuery(() => api.crm.listCollections(ctx, orgId), [ctx, orgId]);
  const [name, setName] = useState('');
  if (!roleCan(role, 'collections.edit')) return null;
  const saved = (cols.data ?? []).some((c) => c.collection.creatorIds.includes(creatorId));
  return (
    <Menu width="w-64" trigger={({ toggle }) => <Button size={compact ? 'sm' : 'md'} icon={Bookmark} variant={saved ? 'soft' : 'secondary'} onClick={toggle}>{saved ? 'Saved' : 'Save'}</Button>}>
      {() => (
        <div className="p-1">
          <p className="px-2 pb-1 pt-1 text-[11px] font-medium text-ink-400">Save to collection</p>
          {(cols.data ?? []).map(({ collection: c, inherited, ownerName }) => {
            const on = c.creatorIds.includes(creatorId);
            return (
              <button key={c.id} onClick={() => act.run('t', () => api.crm.toggleInCollection(ctx, orgId, c.id, creatorId, !on))} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] hover:bg-ink-50">
                <span className={`grid size-4 place-items-center rounded border ${on ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-300'}`}>{on && <Check className="size-3" />}</span>
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {inherited && <span className="text-[10.5px] text-ink-400">{ownerName}</span>}
              </button>
            );
          })}
          <form className="mt-1 flex gap-1 border-t border-ink-150 p-1 pt-2" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; const r = await act.run('c', () => api.crm.createCollection(ctx, orgId, { name, creatorIds: [creatorId] })); if (r) setName(''); }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New collection" className="input h-8 text-[12.5px]" aria-label="New collection name" />
            <button type="submit" className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-ink-900 text-white" aria-label="Create collection"><Plus className="size-4" /></button>
          </form>
        </div>
      )}
    </Menu>
  );
}
