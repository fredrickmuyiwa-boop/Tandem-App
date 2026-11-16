import { useEffect, useState } from 'react';
import { Plus, Trash2, Eye, BadgeCheck, Link2, Image as ImageIcon, Camera } from 'lucide-react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { CATEGORIES, COUNTRIES, CURRENCIES, FORMATS, LANGUAGES, PLATFORMS, formatLabel, platformLabel } from '../../domain/constants';
import type { Category, ContentFormat, CreatorProfile, Currency, Platform, RateCard } from '../../domain/types';
import { compact, money } from '../../lib/utils';
import { completeness } from '../../domain/creatorStats';
import Button, { IconButton } from '../../components/ui/Button';
import { Checkbox, ChipSelect, Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { Avatar, Meter, Notice, PageHeader, PageSkeleton, Section } from '../../components/ui/misc';
import { SourceTag } from '../../components/ui/Badge';
import FileDrop, { type PickedFile } from '../../components/app/FileDrop';
import { useToast } from '../../components/ui/Toast';

function Basics({ c }: { c: CreatorProfile }) {
  const { ctx } = useSession();
  const act = useAction();
  const [v, setV] = useState({ displayName: c.displayName, bio: c.bio, country: c.country, city: c.city ?? '', languages: c.languages, categories: c.categories, formats: c.formats, preferredCollabs: c.preferredCollabs.join(', '), availability: c.availability });
  return (
    <Section title="About you">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void act.run('b', () => api.creators.updateMyProfile(ctx, { ...v, preferredCollabs: v.preferredCollabs.split(',').map((x) => x.trim()) }), { title: 'Profile saved' }); }}>
        <Field label="Display name" error={act.fields.displayName}><Input value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} error={act.fields.displayName} /></Field>
        <Field label="Availability"><Select options={['available', 'limited', 'unavailable'] as const} labels={{ available: 'Available for new work', limited: 'Limited availability', unavailable: 'Not taking new work' }} value={v.availability} onChange={(e) => setV({ ...v, availability: e.target.value as CreatorProfile['availability'] })} /></Field>
        <Field label="Country"><Select options={COUNTRIES} value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })} /></Field>
        <Field label="City"><Input value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} /></Field>
        <Field label="Bio" className="sm:col-span-2" hint={`${v.bio.length}/1200 · What you make, who watches, and what you won’t promote.`}><Textarea value={v.bio} onChange={(e) => setV({ ...v, bio: e.target.value })} maxLength={1200} /></Field>
        <Field label="Content categories (up to 5)" className="sm:col-span-2" error={act.fields.categories}><ChipSelect size="sm" options={CATEGORIES.map((x) => x.id)} labels={Object.fromEntries(CATEGORIES.map((x) => [x.id, x.label]))} value={v.categories} onChange={(x) => setV({ ...v, categories: x as Category[] })} max={5} /></Field>
        <Field label="Languages" className="sm:col-span-2"><ChipSelect size="sm" options={LANGUAGES} value={v.languages} onChange={(x) => setV({ ...v, languages: x })} /></Field>
        <Field label="Formats" className="sm:col-span-2"><ChipSelect size="sm" options={FORMATS.map((x) => x.id)} labels={Object.fromEntries(FORMATS.map((x) => [x.id, x.label]))} value={v.formats} onChange={(x) => setV({ ...v, formats: x as ContentFormat[] })} /></Field>
        <Field label="Preferred collaborations" className="sm:col-span-2" hint="Comma separated, e.g. product reviews, long-term ambassadorships"><Input value={v.preferredCollabs} onChange={(e) => setV({ ...v, preferredCollabs: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Button type="submit" variant="dark" loading={act.busy === 'b'}>Save</Button></div>
      </form>
    </Section>
  );
}

function Privacy({ c }: { c: CreatorProfile }) {
  const { ctx } = useSession();
  const act = useAction();
  const set = (k: keyof CreatorProfile['visibility'], val: boolean) => act.run('v', () => api.creators.updateMyProfile(ctx, { visibility: { [k]: val } }), { title: 'Privacy updated' });
  return (
    <Section title="What brands can see" description="Enforced on Tandem’s servers — hidden details never reach a brand’s browser." action={<Eye className="size-4 text-ink-400" />}>
      <div className="space-y-3">
        <Checkbox label="List me in creator discovery" description="Turn off to be visible only to brands you already work with." checked={c.visibility.listed} onChange={(v) => set('listed', v)} />
        <Checkbox label="Show my city and country" checked={c.visibility.showLocation} onChange={(v) => set('showLocation', v)} />
        <Checkbox label="Show my indicative rates" description="If off, brands see “Rates on request”." checked={c.visibility.showRates} onChange={(v) => set('showRates', v)} />
        <Checkbox label="Show my audience statistics" checked={c.visibility.showAudience} onChange={(v) => set('showAudience', v)} />
        <Checkbox label="Show my completed Tandem collaborations" checked={c.visibility.showCollabHistory} onChange={(v) => set('showCollabHistory', v)} />
      </div>
      <p className="mt-3 text-[12px] text-ink-500">Your email and phone are never shown. Brands contact you through Tandem.</p>
    </Section>
  );
}

function Socials({ c }: { c: CreatorProfile }) {
  const { ctx } = useSession();
  const act = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ platform: 'instagram' as Platform, handle: '', followers: '', engagementRate: '' });
  return (
    <Section title="Social accounts" description="Figures you enter are labelled ‘Self-reported’. Verified figures require an authorised platform connection." action={<Button size="sm" icon={Plus} onClick={() => setOpen(true)}>Add account</Button>}>
      <ul className="divide-y divide-ink-150">{c.socials.map((s) => <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[13px]"><span className="w-24 font-semibold">{platformLabel(s.platform)}</span><span className="text-ink-500">@{s.handle}</span><span className="num ml-auto">{compact(s.followers)} followers</span><span className="num">{s.engagementRate != null ? `${s.engagementRate}%` : '—'}</span><SourceTag source={s.source} /><IconButton size="sm" icon={Trash2} label="Remove account" onClick={() => act.run('r', () => api.creators.removeSocial(ctx, s.id))} /></li>)}</ul>
      {!c.socials.length && <p className="text-[13px] text-ink-500">Add at least one account so brands can understand your audience.</p>}
      <Notice className="mt-3" tone="neutral">Connecting Instagram, TikTok or YouTube for verified statistics needs each platform’s approved API access. That isn’t available in this demo.</Notice>
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Add a social account" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="dark" loading={act.busy === 'a'} onClick={async () => { const r = await act.run('a', () => api.creators.saveSocial(ctx, { platform: v.platform, handle: v.handle, followers: v.followers ? Number(v.followers) : null, engagementRate: v.engagementRate ? Number(v.engagementRate) : null }), { title: 'Account added' }); if (r) { setOpen(false); setV({ platform: 'instagram', handle: '', followers: '', engagementRate: '' }); } }}>Add</Button></>}>
        <div className="grid gap-3">
          <Field label="Platform"><Select options={PLATFORMS.map((p) => p.id)} labels={Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label]))} value={v.platform} onChange={(e) => setV({ ...v, platform: e.target.value as Platform })} /></Field>
          <Field label="Handle" error={act.fields.handle}><Input value={v.handle} onChange={(e) => setV({ ...v, handle: e.target.value })} error={act.fields.handle} placeholder="@yourhandle" /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Followers" error={act.fields.followers}><Input type="number" min={0} value={v.followers} onChange={(e) => setV({ ...v, followers: e.target.value })} /></Field><Field label="Engagement rate %" error={act.fields.engagementRate} hint="From your insights"><Input type="number" min={0} max={100} step={0.1} value={v.engagementRate} onChange={(e) => setV({ ...v, engagementRate: e.target.value })} /></Field></div>
        </div>
      </Modal>
    </Section>
  );
}

function Audience({ c }: { c: CreatorProfile }) {
  const { ctx } = useSession();
  const act = useAction();
  const bands = ['18-24', '25-34', '35-44', '45+'];
  const [v, setV] = useState({ female: c.audience.female?.toString() ?? '', ages: Object.fromEntries(bands.map((b) => [b, c.audience.ageBands?.find((a) => a.band === b)?.pct?.toString() ?? ''])), countries: [0, 1, 2].map((i) => ({ country: c.audience.topCountries?.[i]?.country ?? '', pct: c.audience.topCountries?.[i]?.pct?.toString() ?? '' })) });
  return (
    <Section title="Audience statistics" description="Copy these from your platform insights. They’re shown as self-reported." action={<SourceTag source="creator_submitted" />}>
      <div className="grid gap-5 md:grid-cols-3">
        <Field label="Women in audience %"><Input type="number" min={0} max={100} value={v.female} onChange={(e) => setV({ ...v, female: e.target.value })} /></Field>
        <div><p className="label">Age bands %</p><div className="grid grid-cols-2 gap-2">{bands.map((b) => <Input key={b} aria-label={`Age ${b}`} type="number" min={0} max={100} placeholder={b} value={v.ages[b]} onChange={(e) => setV({ ...v, ages: { ...v.ages, [b]: e.target.value } })} />)}</div></div>
        <div><p className="label">Top countries %</p><div className="space-y-2">{v.countries.map((t, i) => <div key={i} className="grid grid-cols-[1fr_70px] gap-2"><Select aria-label="Country" options={COUNTRIES} placeholder="—" value={t.country} onChange={(e) => setV({ ...v, countries: v.countries.map((x, j) => (j === i ? { ...x, country: e.target.value } : x)) })} /><Input aria-label="Percent" type="number" min={0} max={100} value={t.pct} onChange={(e) => setV({ ...v, countries: v.countries.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)) })} /></div>)}</div></div>
      </div>
      <Button className="mt-4" variant="dark" loading={act.busy === 's'} onClick={() => act.run('s', () => api.creators.saveAudience(ctx, { female: v.female ? Number(v.female) : null, male: v.female ? Math.max(0, 100 - Number(v.female)) : null, ageBands: bands.map((b) => ({ band: b, pct: Number(v.ages[b] || 0) })), topCountries: v.countries.filter((t) => t.country).map((t) => ({ country: t.country, pct: Number(t.pct || 0) })) }), { title: 'Audience saved' })}>Save audience</Button>
    </Section>
  );
}

function Rates({ c }: { c: CreatorProfile }) {
  const { ctx } = useSession();
  const act = useAction();
  const [rates, setRates] = useState<RateCard[]>(c.rates);
  const local: Currency = (['NGN', 'GHS', 'KES', 'ZAR', 'GBP'] as Currency[]).find((x) => ({ Nigeria: 'NGN', Ghana: 'GHS', Kenya: 'KES', 'South Africa': 'ZAR', 'United Kingdom': 'GBP' } as Record<string, Currency>)[c.country] === x) ?? 'USD';
  return (
    <Section title="Indicative rates" description="Starting points brands see before negotiating. You always agree the final fee per collaboration.">
      <div className="space-y-2">
        {rates.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[130px_150px_1fr_1fr_90px_auto]">
            <Select aria-label="Platform" options={PLATFORMS.map((p) => p.id)} labels={Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label]))} value={r.platform} onChange={(e) => setRates(rates.map((x, j) => (j === i ? { ...x, platform: e.target.value as Platform } : x)))} />
            <Select aria-label="Format" options={FORMATS.map((f) => f.id)} labels={Object.fromEntries(FORMATS.map((f) => [f.id, f.label]))} value={r.format} onChange={(e) => setRates(rates.map((x, j) => (j === i ? { ...x, format: e.target.value as ContentFormat } : x)))} />
            <Input aria-label="Minimum" type="number" min={0} value={r.min} onChange={(e) => setRates(rates.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)))} />
            <Input aria-label="Maximum" type="number" min={0} value={r.max} onChange={(e) => setRates(rates.map((x, j) => (j === i ? { ...x, max: Number(e.target.value) } : x)))} />
            <Select aria-label="Currency" options={CURRENCIES} value={r.currency} onChange={(e) => setRates(rates.map((x, j) => (j === i ? { ...x, currency: e.target.value as Currency } : x)))} />
            <IconButton icon={Trash2} label="Remove rate" onClick={() => setRates(rates.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>
      {!rates.length && <p className="text-[13px] text-ink-500">No rates yet.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" icon={Plus} onClick={() => setRates([...rates, { platform: c.socials[0]?.platform ?? 'instagram', format: 'short_video', min: 0, max: 0, currency: local }])}>Add rate</Button>
        <Button size="sm" variant="dark" loading={act.busy === 'r'} onClick={() => act.run('r', () => api.creators.saveRates(ctx, rates), { title: 'Rates saved' })}>Save rates</Button>
      </div>
      {c.rates.length > 0 && <p className="mt-3 text-[12px] text-ink-500">Brands currently see: {c.rates.map((r) => `${formatLabel(r.format)} on ${platformLabel(r.platform)} ${money(r.min, r.currency)}–${money(r.max, r.currency)}`).join(' · ')}</p>}
    </Section>
  );
}

function Portfolio({ c, urls }: { c: CreatorProfile; urls: Record<string, string | undefined> }) {
  const { ctx } = useSession();
  const act = useAction();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ title: '', kind: 'link' as 'link' | 'image', url: '', caption: '', brand: '' });
  const [files, setFiles] = useState<PickedFile[]>([]);
  return (
    <Section title="Portfolio" description="Up to 12 samples. Links must start with https://." action={<Button size="sm" icon={Plus} onClick={() => setOpen(true)} disabled={c.portfolio.length >= 12}>Add sample</Button>}>
      {c.portfolio.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{c.portfolio.map((p) => (
          <div key={p.id} className="overflow-hidden rounded-[12px] border border-ink-200">
            {p.fileRef && urls[p.id] ? <img src={urls[p.id]} alt={p.title} className="aspect-[4/3] w-full object-cover" /> : <div className="grid aspect-[4/3] place-items-center bg-ink-50 text-ink-300">{p.kind === 'link' ? <Link2 className="size-6" /> : <ImageIcon className="size-6" />}</div>}
            <div className="flex items-start gap-2 p-3"><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{p.title}</p>{p.url && <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="link block truncate text-[12px]">{p.url}</a>}</div><IconButton size="sm" icon={Trash2} label="Remove sample" onClick={() => act.run('rm', () => api.creators.removePortfolioItem(ctx, p.id))} /></div>
          </div>
        ))}</div>
      ) : <p className="text-[13px] text-ink-500">Show brands your best work.</p>}
      <Modal open={open} onClose={() => setOpen(false)} title="Add portfolio sample" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="dark" loading={act.busy === 'add'} onClick={async () => { const r = await act.run('add', () => api.creators.addPortfolioItem(ctx, { ...v, file: v.kind === 'image' ? files[0] : undefined }), { title: 'Sample added' }); if (r) { setOpen(false); setFiles([]); setV({ title: '', kind: 'link', url: '', caption: '', brand: '' }); } }}>Add</Button></>}>
        <div className="grid gap-3">
          <Field label="Title" error={act.fields.title}><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} error={act.fields.title} /></Field>
          <Field label="Type"><Select options={['link', 'image'] as const} labels={{ link: 'Link to a post', image: 'Upload an image' }} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as 'link' | 'image' })} /></Field>
          {v.kind === 'link' ? <Field label="Link" error={act.fields.url}><Input value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://" error={act.fields.url} /></Field> : <FileDrop files={files} onChange={setFiles} maxFiles={1} maxMb={1} accept={['image/jpeg', 'image/png', 'image/webp']} onError={(m) => toast.error('Can’t add that file', m)} label="Choose an image (max 1 MB in Demo mode)" />}
          <Field label="Brand (optional)"><Input value={v.brand} onChange={(e) => setV({ ...v, brand: e.target.value })} /></Field>
          <Field label="Caption (optional)"><Textarea value={v.caption} onChange={(e) => setV({ ...v, caption: e.target.value })} className="min-h-[60px]" /></Field>
        </div>
      </Modal>
    </Section>
  );
}

function Verification({ c }: { c: CreatorProfile }) {
  const { ctx } = useSession();
  const act = useAction();
  const [ev, setEv] = useState('');
  return (
    <Section title="Identity verification" action={<BadgeCheck className="size-4 text-sage-600" />} description="Confirms you are who you say you are. It does not verify your audience figures.">
      {c.identityVerification === 'verified' ? <Notice tone="ok">Your identity is verified. Brands see an “ID verified” badge.</Notice> : c.identityVerification === 'pending' ? <Notice tone="info">Your request is with our trust & safety team.</Notice> : (
        <div className="space-y-2">
          {c.identityVerification === 'rejected' && <Notice tone="warn">Your last request wasn’t approved. You can try again with more detail.</Notice>}
          <Field label="How can we confirm it’s you?" error={act.fields.evidence}><Textarea value={ev} onChange={(e) => setEv(e.target.value)} placeholder="e.g. add the code TANDEM to your Instagram bio, or link your official website" error={act.fields.evidence} /></Field>
          <Button loading={act.busy === 'v'} onClick={() => act.run('v', () => api.creators.requestVerification(ctx, ev), { title: 'Verification requested' })}>Request verification</Button>
        </div>
      )}
    </Section>
  );
}

export default function Profile() {
  const { ctx } = useSession();
  const act = useAction();
  const toast = useToast();
  const q = useQuery(() => api.creators.myProfile(ctx), [ctx]);
  const [key, setKey] = useState(0);
  useEffect(() => setKey((k) => k + 1), [q.data?.creator.updatedAt]);
  if (!q.data) return <PageSkeleton />;
  const c = q.data.creator;
  const comp = completeness(c);
  return (
    <div className="space-y-5">
      <PageHeader title="My profile" description="How brands see you. You decide what’s public." />
      <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="relative">
          <Avatar name={c.displayName} hue={c.avatarHue} url={q.data.avatarUrl} size="xl" />
          <label className="absolute -bottom-1 -right-1 grid size-8 cursor-pointer place-items-center rounded-full border border-ink-200 bg-surface shadow-sm hover:bg-ink-50" title="Change photo">
            <Camera className="size-4 text-ink-600" />
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Upload profile photo" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (f.size > 1024 * 1024) return toast.error('Photo too large', 'Use an image of 1 MB or less in Demo mode.'); const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); }); await act.run('av', () => api.creators.setAvatar(ctx, { name: f.name, type: f.type, size: f.size, dataUrl }), { title: 'Photo updated' }); }} />
          </label>
        </div>
        <div className="min-w-0 flex-1"><p className="text-[18px] font-semibold">{c.displayName}</p><p className="text-[13px] text-ink-500">@{c.handle}</p><div className="mt-2 flex items-center gap-3"><Meter value={comp.score * 100} tone={comp.score > 0.7 ? 'ok' : 'warn'} className="w-40" /><span className="text-[12px] text-ink-500">{Math.round(comp.score * 100)}% complete{comp.missing.length ? ` · add ${comp.missing.slice(0, 2).join(', ')}` : ''}</span></div></div>
      </div>
      <div key={key} className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5"><Basics c={c} /><Socials c={c} /><Audience c={c} /><Rates c={c} /><Portfolio c={c} urls={q.data.portfolioUrls} /></div>
        <aside className="space-y-5"><Privacy c={c} /><Verification c={c} /></aside>
      </div>
    </div>
  );
}
