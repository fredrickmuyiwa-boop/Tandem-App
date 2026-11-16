import { Plus, Trash2 } from 'lucide-react';
import type { Campaign, ContentFormat, Platform, Terms } from '../../domain/types';
import { FORMATS, PLATFORMS } from '../../domain/constants';
import { uid } from '../../lib/utils';
import { Field, Input, Select, Textarea, Checkbox } from '../ui/Field';
import { IconButton } from '../ui/Button';

export function defaultTerms(c: Pick<Campaign, 'currency' | 'deliverables' | 'endDate' | 'compensationModel'>, fee = 0): Terms {
  const deadline = new Date(Math.max(new Date(c.endDate).getTime() - 5 * 86_400_000, Date.now() + 7 * 86_400_000)).toISOString().slice(0, 10);
  return {
    fee: Math.round(fee), currency: c.currency, deliverables: c.deliverables.map((d) => ({ ...d, id: uid('dlv') })), deadline,
    usageRights: 'Organic use on brand channels for 6 months', exclusivity: 'None', revisionLimit: 2,
    bonus: c.compensationModel === 'fixed_plus_bonus' ? { amount: Math.round(fee * 0.2), condition: 'Main post reaches the agreed engagement target' } : null,
    milestones: c.compensationModel === 'milestone' ? [{ label: 'On content approval', pct: 50 }, { label: 'After posting', pct: 50 }] : undefined,
    gifting: c.compensationModel === 'gifting' ? 'Product bundle' : undefined,
  };
}

export default function TermsEditor({ value, onChange, errors = {}, lockDeliverables }: { value: Terms; onChange: (t: Terms) => void; errors?: Record<string, string>; lockDeliverables?: boolean }) {
  const set = (p: Partial<Terms>) => onChange({ ...value, ...p });
  const setDel = (i: number, p: Partial<Terms['deliverables'][number]>) => set({ deliverables: value.deliverables.map((d, j) => (j === i ? { ...d, ...p } : d)) });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={`Fee (${value.currency})`} error={errors.fee} required>
          <Input type="number" min={0} inputMode="numeric" value={value.fee || ''} onChange={(e) => set({ fee: Number(e.target.value) })} error={errors.fee} />
        </Field>
        <Field label="Deadline" error={errors.deadline} required>
          <Input type="date" value={value.deadline} onChange={(e) => set({ deadline: e.target.value })} error={errors.deadline} />
        </Field>
        <Field label="Revision rounds">
          <Input type="number" min={0} max={10} value={value.revisionLimit} onChange={(e) => set({ revisionLimit: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="rounded-[12px] border border-ink-200 p-3">
        <Checkbox label="Performance bonus" description="Optional, on top of the guaranteed fee." checked={!!value.bonus} onChange={(on) => set({ bonus: on ? { amount: Math.round(value.fee * 0.2), condition: '' } : null })} />
        {value.bonus && (
          <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr]">
            <Input type="number" min={0} aria-label="Bonus amount" value={value.bonus.amount || ''} onChange={(e) => set({ bonus: { ...value.bonus!, amount: Number(e.target.value) } })} />
            <Input aria-label="Bonus condition" placeholder="e.g. 500 tracked link clicks" value={value.bonus.condition} onChange={(e) => set({ bonus: { ...value.bonus!, condition: e.target.value } })} />
          </div>
        )}
      </div>
      {value.milestones && (
        <div className="rounded-[12px] border border-ink-200 p-3">
          <p className="text-[13px] font-medium">Milestones <span className="font-normal text-ink-500">— must add up to 100%</span></p>
          <div className="mt-2 space-y-2">{value.milestones.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px] gap-2">
              <Input aria-label="Milestone" value={m.label} onChange={(e) => set({ milestones: value.milestones!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <Input aria-label="Percent" type="number" value={m.pct} onChange={(e) => set({ milestones: value.milestones!.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) } : x)) })} />
            </div>
          ))}</div>
        </div>
      )}
      {value.gifting !== undefined && <Field label="Gifted product"><Input value={value.gifting} onChange={(e) => set({ gifting: e.target.value })} /></Field>}
      <div>
        <p className="label">Deliverables</p>
        <div className="space-y-2">
          {value.deliverables.map((d, i) => (
            <div key={d.id} className="grid grid-cols-[1fr_1fr_64px_auto] items-center gap-2">
              <Select aria-label="Platform" disabled={lockDeliverables} options={PLATFORMS.map((p) => p.id)} labels={Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label]))} value={d.platform} onChange={(e) => setDel(i, { platform: e.target.value as Platform })} />
              <Select aria-label="Format" disabled={lockDeliverables} options={FORMATS.map((f) => f.id)} labels={Object.fromEntries(FORMATS.map((f) => [f.id, f.label]))} value={d.format} onChange={(e) => setDel(i, { format: e.target.value as ContentFormat })} />
              <Input aria-label="Quantity" disabled={lockDeliverables} type="number" min={1} max={50} value={d.quantity} onChange={(e) => setDel(i, { quantity: Number(e.target.value) })} />
              <IconButton icon={Trash2} size="sm" label="Remove deliverable" disabled={lockDeliverables || value.deliverables.length === 1} onClick={() => set({ deliverables: value.deliverables.filter((_, j) => j !== i) })} />
            </div>
          ))}
        </div>
        {!lockDeliverables && <button type="button" onClick={() => set({ deliverables: [...value.deliverables, { id: uid('dlv'), platform: 'instagram', format: 'story', quantity: 1 }] })} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-600"><Plus className="size-3.5" />Add deliverable</button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Usage rights"><Textarea className="min-h-[60px]" value={value.usageRights} onChange={(e) => set({ usageRights: e.target.value })} /></Field>
        <Field label="Exclusivity"><Textarea className="min-h-[60px]" value={value.exclusivity} onChange={(e) => set({ exclusivity: e.target.value })} /></Field>
      </div>
    </div>
  );
}
