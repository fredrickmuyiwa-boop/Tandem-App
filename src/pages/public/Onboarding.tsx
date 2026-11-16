import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useRouter } from '../../lib/router';
import { useAction } from '../../app/hooks';
import { CATEGORIES, COUNTRIES, FORMATS, LANGUAGES } from '../../domain/constants';
import type { Category, ContentFormat } from '../../domain/types';
import Logo from '../../components/layout/Logo';
import Button from '../../components/ui/Button';
import { ChipSelect, Field, Input, Select, Textarea } from '../../components/ui/Field';
import { homeFor } from '../../app/routes';

export default function Onboarding() {
  const { me, ctx, signOut } = useSession();
  const { navigate } = useRouter();
  const act = useAction();
  const [org, setOrg] = useState({ name: '', country: 'Nigeria', industry: '', website: '', description: '' });
  const [cr, setCr] = useState({ displayName: me?.user.name ?? '', handle: '', country: 'Nigeria', city: '', bio: '', categories: [] as Category[], languages: ['English'], formats: ['short_video'] as ContentFormat[] });
  const done = !!me && (me.user.platformRole === 'admin' || !!(me.user.kind === 'creator' ? me.creatorId : me.orgs.length));
  useEffect(() => { if (me && done) navigate(homeFor(me), { replace: true }); }, [me, done, navigate]);
  if (!me || done) return null;
  const creator = me.user.kind === 'creator';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = creator
      ? await act.run('go', () => api.orgs.onboardCreator(ctx, cr), { title: 'Profile created', body: 'Add social accounts and rates so brands can find you.' })
      : await act.run('go', () => api.orgs.onboardOrganization(ctx, org), { title: 'Workspace created', body: 'You’re on a 14-day Growth trial (demo — no billing).' });
    if (ok) navigate(creator ? '/creator/profile' : '/app/dashboard', { replace: true });
  };
  const f = act.fields;
  return (
    <div className="min-h-screen px-4 py-6 sm:px-10">
      <div className="flex items-center justify-between"><Logo /><button onClick={() => void signOut()} className="text-[13px] text-ink-500 hover:text-ink-900">Sign out</button></div>
      <form onSubmit={submit} noValidate className="mx-auto mt-10 max-w-xl space-y-5 page-enter">
        <div>
          <p className="eyebrow mb-1">Step 2 of 2</p>
          <h1 className="text-[26px] font-semibold tracking-tight">{creator ? 'Set up your creator profile' : me.user.kind === 'agency' ? 'Create your agency workspace' : 'Create your brand workspace'}</h1>
          <p className="mt-1 text-[14px] text-ink-500">{creator ? 'You can change everything later, including what brands can see.' : 'You can add products, teammates and clients next.'}</p>
        </div>
        {creator ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Display name" required error={f.displayName}><Input value={cr.displayName} onChange={(e) => setCr({ ...cr, displayName: e.target.value })} error={f.displayName} /></Field>
              <Field label="Handle" required error={f.handle} hint="Your Tandem profile name, e.g. ifeglows"><Input value={cr.handle} onChange={(e) => setCr({ ...cr, handle: e.target.value })} error={f.handle} placeholder="yourhandle" /></Field>
              <Field label="Country" required><Select options={COUNTRIES} value={cr.country} onChange={(e) => setCr({ ...cr, country: e.target.value })} /></Field>
              <Field label="City"><Input value={cr.city} onChange={(e) => setCr({ ...cr, city: e.target.value })} /></Field>
            </div>
            <Field label="Content categories" required error={f.categories} hint="Up to 5"><ChipSelect options={CATEGORIES.map((c) => c.id)} labels={Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]))} value={cr.categories} onChange={(v) => setCr({ ...cr, categories: v })} max={5} size="sm" /></Field>
            <Field label="Languages you create in"><ChipSelect options={LANGUAGES} value={cr.languages} onChange={(v) => setCr({ ...cr, languages: v })} size="sm" /></Field>
            <Field label="Formats you make"><ChipSelect options={FORMATS.map((x) => x.id)} labels={Object.fromEntries(FORMATS.map((x) => [x.id, x.label]))} value={cr.formats} onChange={(v) => setCr({ ...cr, formats: v })} size="sm" /></Field>
            <Field label="Short bio" hint="What you make and who watches it."><Textarea value={cr.bio} onChange={(e) => setCr({ ...cr, bio: e.target.value })} maxLength={1200} /></Field>
          </>
        ) : (
          <>
            <Field label={me.user.kind === 'agency' ? 'Agency name' : 'Brand or company name'} required error={f.name}><Input value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} error={f.name} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Country" required><Select options={COUNTRIES} value={org.country} onChange={(e) => setOrg({ ...org, country: e.target.value })} /></Field>
              <Field label="Industry"><Input value={org.industry} onChange={(e) => setOrg({ ...org, industry: e.target.value })} placeholder="e.g. Beauty & skincare" /></Field>
            </div>
            <Field label="Website" error={f.website}><Input value={org.website} onChange={(e) => setOrg({ ...org, website: e.target.value })} placeholder="https://" error={f.website} /></Field>
            <Field label="What you do"><Textarea value={org.description} onChange={(e) => setOrg({ ...org, description: e.target.value })} maxLength={800} /></Field>
          </>
        )}
        <Button type="submit" variant="dark" size="lg" className="w-full" loading={act.busy === 'go'}>{creator ? 'Create profile' : 'Create workspace'}</Button>
      </form>
    </div>
  );
}
