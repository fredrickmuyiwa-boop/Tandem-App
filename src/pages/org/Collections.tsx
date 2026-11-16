import { useState } from 'react';
import { Bookmark, Plus, Download, Trash2, X, Share2 } from 'lucide-react';
import { api } from '../../server/api';
import { useOrg } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { roleCan } from '../../server/access';
import { avgEngagement, statsSource, totalFollowers } from '../../domain/creatorStats';
import { categoryLabel, SOURCE_META } from '../../domain/constants';
import { compact, timeAgo } from '../../lib/utils';
import { copyText, downloadText, toCsv } from '../../lib/csv';
import Button, { IconButton } from '../../components/ui/Button';
import { Field, Input, Textarea, Toggle } from '../../components/ui/Field';
import { Drawer, Modal, Confirm } from '../../components/ui/Modal';
import { Avatar, EmptyState, PageHeader, PageSkeleton } from '../../components/ui/misc';
import { useToast } from '../../components/ui/Toast';

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const { ctx, orgId, role, org } = useOrg();
  const { navigate } = useRouter();
  const toast = useToast();
  const act = useAction();
  const q = useQuery(() => api.crm.getCollection(ctx, orgId, id), [ctx, orgId, id]);
  const [del, setDel] = useState(false);
  const edit = roleCan(role, 'collections.edit') && q.data?.editable;
  const exportCsv = async () => {
    if (!q.data) return;
    const csv = toCsv(q.data.creators.map((c) => ({ name: c.displayName, handle: `@${c.handle}`, country: c.country, categories: c.categories.map(categoryLabel).join('; '), followers: totalFollowers(c) ?? '', engagement_rate: avgEngagement(c)?.toFixed(1) ?? '', figures_source: SOURCE_META[statsSource(c) ?? 'creator_submitted'].label, sample_profile: c.sample ? 'yes' : 'no' })));
    if (downloadText(`${q.data.collection.name.replace(/\W+/g, '-').toLowerCase()}.csv`, csv)) toast.success('Export started', `${q.data.creators.length} creators`);
    else if (await copyText(csv)) toast.success('Copied as CSV');
  };
  return (
    <Drawer open onClose={onClose} title={q.data?.collection.name ?? 'Collection'} subtitle={q.data?.collection.description} footer={q.data && <><Button icon={Download} onClick={exportCsv} disabled={!q.data.creators.length}>Export CSV</Button>{edit && <Button variant="danger" icon={Trash2} onClick={() => setDel(true)}>Delete</Button>}</>}>
      {!q.data ? <div className="skeleton h-40" /> : (
        <div className="space-y-4">
          {edit && org.type === 'client' && <label className="flex items-center justify-between gap-3 rounded-[12px] border border-ink-200 p-3 text-[13px]"><span><span className="flex items-center gap-1.5 font-medium"><Share2 className="size-4" />Visible to client reviewers</span><span className="text-[12px] text-ink-500">Let the client see this list.</span></span><Toggle label="Visible to client" checked={q.data.collection.sharedWithClients} onChange={(v) => act.run('s', () => api.crm.updateCollection(ctx, orgId, id, { sharedWithClients: v }))} /></label>}
          <ul className="divide-y divide-ink-150">
            {q.data.creators.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <button onClick={() => navigate(`/app/creators/${c.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><Avatar name={c.displayName} hue={c.avatarHue} url={c.avatarUrl} size="sm" /><span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold">{c.displayName}</span><span className="block truncate text-[12px] text-ink-500">{compact(totalFollowers(c))} · {c.categories.map(categoryLabel).join(', ')}</span></span></button>
                {edit && <IconButton size="sm" icon={X} label={`Remove ${c.displayName}`} onClick={() => act.run('rm', () => api.crm.toggleInCollection(ctx, orgId, id, c.id, false))} />}
              </li>
            ))}
          </ul>
          {!q.data.creators.length && <p className="text-[13px] text-ink-500">Empty. Save creators from Discover or a profile.</p>}
        </div>
      )}
      <Confirm open={del} onClose={() => setDel(false)} title="Delete this collection?" message="Creators stay in your CRM; only the list is removed." confirmLabel="Delete" onConfirm={async () => { const r = await act.run('d', () => api.crm.deleteCollection(ctx, orgId, id), { title: 'Collection deleted' }); if (r) { setDel(false); onClose(); } }} />
    </Drawer>
  );
}

export default function Collections() {
  const { ctx, orgId, role } = useOrg();
  const act = useAction();
  const q = useQuery(() => api.crm.listCollections(ctx, orgId), [ctx, orgId]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [v, setV] = useState({ name: '', description: '' });
  if (!q.data) return <PageSkeleton />;
  return (
    <div>
      <PageHeader title="Collections" description="Shortlists for campaigns, ideas and approved creators. Agency collections are shared across every client workspace." actions={roleCan(role, 'collections.edit') && <Button variant="dark" icon={Plus} onClick={() => setCreating(true)}>New collection</Button>} />
      {q.data.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.map(({ collection: c, inherited, ownerName }) => (
            <button key={c.id} onClick={() => setOpen(c.id)} className="panel p-4 text-left transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2"><p className="text-[14px] font-semibold">{c.name}</p>{inherited && <span className="rounded-md bg-accent-50 px-1.5 py-0.5 text-[11px] font-medium text-accent-700">{ownerName}</span>}</div>
              {c.description && <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-500">{c.description}</p>}
              <p className="mt-3 text-[12px] text-ink-500"><span className="num font-semibold text-ink-800">{c.creatorIds.length}</span> creators · created {timeAgo(c.createdAt)}{c.sharedWithClients ? ' · shared with client' : ''}</p>
            </button>
          ))}
        </div>
      ) : <div className="panel"><EmptyState icon={Bookmark} title="No collections yet" message="Save creators while you browse to build shortlists." /></div>}
      {open && <Detail id={open} onClose={() => setOpen(null)} />}
      <Modal open={creating} onClose={() => setCreating(false)} size="sm" title="New collection" footer={<><Button onClick={() => setCreating(false)}>Cancel</Button><Button variant="dark" loading={act.busy === 'c'} onClick={async () => { const r = await act.run('c', () => api.crm.createCollection(ctx, orgId, v), { title: 'Collection created' }); if (r) { setCreating(false); setV({ name: '', description: '' }); } }}>Create</Button></>}>
        <div className="space-y-3"><Field label="Name" error={act.fields.name}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={act.fields.name} /></Field><Field label="Description"><Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} className="min-h-[60px]" /></Field></div>
      </Modal>
    </div>
  );
}
