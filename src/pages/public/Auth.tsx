import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Building2, Camera, Users, MailCheck, KeyRound, Eye, EyeOff } from 'lucide-react';
import { api } from '../../server/api';
import { useRouter, Link } from '../../lib/router';
import { useSession } from '../../app/session';
import { errorMessage } from '../../app/hooks';
import { homeFor } from '../../app/routes';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../data/seed';
import { check, rules } from '../../lib/validate';
import { cx } from '../../lib/utils';
import Logo from '../../components/layout/Logo';
import Button from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { Notice } from '../../components/ui/misc';
import type { AccountKind } from '../../domain/types';

function Frame({ title, subtitle, children, aside }: { title: string; subtitle?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_440px]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Link to="/" aria-label="Tandem home"><Logo /></Link>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[14px] text-ink-500">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </div>
      <aside className="hidden border-l border-ink-200 bg-surface lg:block">{aside}</aside>
    </div>
  );
}

function PasswordInput({ value, onChange, error, autoComplete, id }: { value: string; onChange: (v: string) => void; error?: string; autoComplete: string; id: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} error={error} autoComplete={autoComplete} className="pr-10" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
    </div>
  );
}

export function SignIn() {
  const { navigate, query } = useRouter();
  const { setToken } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const go = async (e: string, p: string, key: string) => {
    setBusy(key); setError(null);
    try {
      const { token } = await api.auth.signIn({ email: e, password: p, userAgent: navigator.userAgent.slice(0, 80) });
      setToken(token);
      const me = api.auth.me({ token });
      const next = query.next && query.next.startsWith('/') && !query.next.startsWith('//') ? query.next : homeFor(me);
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const f = check({ email, password }, { email: [rules.required('Email'), rules.email()], password: [rules.required('Password')] });
    setFields(f);
    if (!Object.keys(f).length) void go(email, password, 'form');
  };

  return (
    <Frame title="Sign in" subtitle={<>New to Tandem? <Link to="/signup" className="link">Create an account</Link></>}
      aside={
        <div className="flex h-full flex-col p-8">
          <p className="eyebrow">Demo accounts</p>
          <p className="mt-1 text-[13px] text-ink-500">One click signs you in. Each account sees a different workspace.</p>
          <ul className="mt-5 space-y-2">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button onClick={() => go(a.email, DEMO_PASSWORD, a.email)} disabled={!!busy} className="flex w-full items-center gap-3 rounded-[12px] border border-ink-200 bg-paper px-3.5 py-3 text-left transition hover:border-ink-400 disabled:opacity-60">
                  <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-semibold">{a.label}</span><span className="block truncate text-[12px] text-ink-500">{a.description}</span></span>
                  {busy === a.email ? <span className="text-[12px] text-ink-500">Signing in…</span> : <ArrowRight className="size-4 text-ink-400" />}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-auto pt-6 text-[12px] leading-relaxed text-ink-500">Password for all demo accounts: <code className="font-mono text-ink-800">{DEMO_PASSWORD}</code>. Data lives in this browser only and can be reset from Settings.</p>
        </div>
      }>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="Email" error={fields.email} htmlFor="email"><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} /></Field>
        <Field label={<span className="flex justify-between"><span>Password</span><Link to="/forgot" className="link font-normal">Forgot password?</Link></span>} error={fields.password} htmlFor="password"><PasswordInput id="password" value={password} onChange={setPassword} error={fields.password} autoComplete="current-password" /></Field>
        <Button type="submit" variant="dark" className="w-full" size="lg" loading={busy === 'form'}>Sign in</Button>
      </form>
      <div className="mt-8 lg:hidden">
        <p className="eyebrow mb-2">Or use a demo account</p>
        <div className="grid grid-cols-2 gap-2">{DEMO_ACCOUNTS.map((a) => <Button key={a.email} size="sm" onClick={() => go(a.email, DEMO_PASSWORD, a.email)} loading={busy === a.email}>{a.label}</Button>)}</div>
      </div>
    </Frame>
  );
}

const KINDS: { id: Exclude<AccountKind, 'admin'>; label: string; text: string; icon: typeof Building2 }[] = [
  { id: 'brand', label: 'Brand', text: 'Run campaigns for your own products.', icon: Building2 },
  { id: 'agency', label: 'Agency', text: 'Manage creator campaigns for clients.', icon: Users },
  { id: 'creator', label: 'Creator', text: 'Build a profile and get paid for your content.', icon: Camera },
];

export function SignUp() {
  const { navigate, query } = useRouter();
  const [kind, setKind] = useState<Exclude<AccountKind, 'admin'>>((['brand', 'agency', 'creator'].includes(query.kind) ? query.kind : 'brand') as 'brand');
  const [v, setV] = useState({ name: '', email: '', password: '' });
  const [consent, setConsent] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const f = check({ ...v }, { name: [rules.required('Name'), rules.minLen('Name', 2)], email: [rules.required('Email'), rules.email()], password: [rules.password()] });
    if (!consent) f.consent = 'Please accept the terms and privacy summary.';
    setFields(f);
    if (Object.keys(f).length) return;
    setBusy(true); setError(null);
    try {
      const r = await api.auth.register({ ...v, kind });
      navigate(`/verify?email=${encodeURIComponent(v.email)}&demo=${r.demoVerifyToken}`);
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <Frame title="Create your account" subtitle={<>Already have one? <Link to="/signin" className="link">Sign in</Link></>}
      aside={<div className="p-8"><p className="eyebrow">What happens next</p><ol className="mt-4 space-y-4 text-[13.5px] text-ink-600">{['Verify your email address.', kind === 'creator' ? 'Set up your creator profile and choose what brands can see.' : `Create your ${kind === 'agency' ? 'agency' : 'brand'} workspace.`, kind === 'creator' ? 'Browse open campaigns or wait for invitations.' : 'Describe a campaign and review explainable creator matches.'].map((s, i) => <li key={s} className="flex gap-3"><span className="num grid size-6 shrink-0 place-items-center rounded-full bg-ink-100 text-[12px] font-semibold">{i + 1}</span>{s}</li>)}</ol></div>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Notice tone="bad">{error}</Notice>}
        <fieldset>
          <legend className="label">I’m signing up as</legend>
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <button type="button" key={k.id} onClick={() => setKind(k.id)} aria-pressed={kind === k.id} className={cx('rounded-[12px] border p-3 text-left transition', kind === k.id ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-surface hover:border-ink-300')}>
                <k.icon className={cx('size-4', kind === k.id ? 'text-white' : 'text-ink-500')} />
                <span className="mt-2 block text-[13px] font-semibold">{k.label}</span>
                <span className={cx('mt-0.5 hidden text-[11.5px] leading-snug sm:block', kind === k.id ? 'text-white/70' : 'text-ink-500')}>{k.text}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Full name" error={fields.name} htmlFor="name"><Input id="name" autoComplete="name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={fields.name} /></Field>
        <Field label="Work email" error={fields.email} htmlFor="email"><Input id="email" type="email" autoComplete="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} error={fields.email} /></Field>
        <Field label="Password" error={fields.password} hint="At least 10 characters, with letters and numbers." htmlFor="password"><PasswordInput id="password" value={v.password} onChange={(p) => setV({ ...v, password: p })} error={fields.password} autoComplete="new-password" /></Field>
        <div>
          <label className="flex items-start gap-2.5 text-[13px] text-ink-600"><input type="checkbox" className="mt-0.5 size-4 accent-accent-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I agree to the terms and have read the <Link to="/privacy" className="link">privacy summary</Link>.</label>
          {fields.consent && <p className="mt-1 text-[12px] font-medium text-bad-600">{fields.consent}</p>}
        </div>
        <Button type="submit" variant="dark" size="lg" className="w-full" loading={busy}>Create account</Button>
      </form>
    </Frame>
  );
}

export function Verify() {
  const { query, navigate } = useRouter();
  const { setToken } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verify = async () => {
    setBusy(true); setError(null);
    try { const { token } = await api.auth.verifyEmail(query.demo ?? ''); setToken(token); navigate('/onboarding', { replace: true }); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Frame title="Check your email" subtitle={<>If <strong className="text-ink-800">{query.email || 'that address'}</strong> can be used, we’ve sent a verification link.</>}>
      <div className="space-y-4">
        <MailCheck className="size-8 text-ink-400" />
        {error && <Notice tone="bad">{error}</Notice>}
        <Notice tone="info">Demo mode has no email provider, so no email was sent. Use the button below in place of the link in the email.</Notice>
        <Button variant="dark" size="lg" className="w-full" loading={busy} onClick={verify}>Open verification link (demo)</Button>
        <p className="text-[12.5px] text-ink-500">Already verified? <Link to="/signin" className="link">Sign in</Link></p>
      </div>
    </Frame>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const f = check({ email }, { email: [rules.required('Email'), rules.email()] });
    setErr(f.email ?? '');
    if (f.email) return;
    setBusy(true);
    const r = await api.auth.requestPasswordReset(email);
    setBusy(false);
    setSent(r.demoResetToken);
  };
  return (
    <Frame title="Reset your password" subtitle="We’ll email you a link to choose a new one.">
      {sent ? (
        <div className="space-y-4">
          <Notice tone="ok">If an account exists for {email}, a reset link is on its way. The link expires in 30 minutes.</Notice>
          <Notice tone="info">Demo mode: no email is sent. <Link to={`/reset?token=${sent}`} className="link">Open the reset link</Link>.</Notice>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Email" error={err} htmlFor="email"><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={err} /></Field>
          <Button type="submit" variant="dark" size="lg" className="w-full" loading={busy}>Send reset link</Button>
          <p className="text-[12.5px] text-ink-500"><Link to="/signin" className="link">Back to sign in</Link></p>
        </form>
      )}
    </Frame>
  );
}

export function Reset() {
  const { query, navigate } = useRouter();
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.auth.resetPassword(query.token ?? '', pw); navigate('/signin?reset=1', { replace: true }); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <Frame title="Choose a new password" subtitle="This signs you out everywhere else.">
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Notice tone="bad">{error}</Notice>}
        <Field label="New password" hint="At least 10 characters, with letters and numbers." htmlFor="pw"><PasswordInput id="pw" value={pw} onChange={setPw} autoComplete="new-password" /></Field>
        <Button type="submit" variant="dark" size="lg" className="w-full" icon={KeyRound} loading={busy}>Save new password</Button>
      </form>
    </Frame>
  );
}
