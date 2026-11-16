import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { RouterProvider, matchPath, useRouter } from './lib/router';
import { ToastProvider } from './components/ui/Toast';
import { SessionProvider, useSession } from './app/session';
import { initBackend, api, resetDemo, IS_DEMO } from './server/api';
import { adminNav, creatorNav, homeFor, orgNav, type PageComponent } from './app/routes';
import AppShell from './components/layout/AppShell';
import PublicLayout from './components/layout/PublicLayout';
import Logo from './components/layout/Logo';
import { PageSkeleton } from './components/ui/misc';
import { useQuery } from './app/hooks';

const L = (f: () => Promise<{ default: PageComponent }>) => lazy(f);
const N = <K extends string>(f: () => Promise<Record<K, PageComponent>>, k: K) => lazy(() => f().then((m) => ({ default: m[k] })));

const auth = () => import('./pages/public/Auth');
const PUBLIC: [string, PageComponent][] = [
  ['/', L(() => import('./pages/public/Landing'))],
  ['/pricing', L(() => import('./pages/public/Pricing'))],
  ['/privacy', L(() => import('./pages/public/Privacy'))],
  ['/signin', N(auth, 'SignIn')],
  ['/signup', N(auth, 'SignUp')],
  ['/verify', N(auth, 'Verify')],
  ['/forgot', N(auth, 'Forgot')],
  ['/reset', N(auth, 'Reset')],
];

const ORG: [string, PageComponent][] = [
  ['/app/dashboard', L(() => import('./pages/org/Dashboard'))],
  ['/app/discover', L(() => import('./pages/org/Discover'))],
  ['/app/creators/:id', L(() => import('./pages/org/CreatorProfile'))],
  ['/app/match', L(() => import('./pages/org/Match'))],
  ['/app/campaigns', L(() => import('./pages/org/Campaigns'))],
  ['/app/campaigns/new', L(() => import('./pages/org/CampaignEditor'))],
  ['/app/campaigns/:id/edit', L(() => import('./pages/org/CampaignEditor'))],
  ['/app/campaigns/:id', L(() => import('./pages/org/CampaignDetail'))],
  ['/app/collaborations', L(() => import('./pages/org/Collaborations'))],
  ['/app/collaborations/:id', L(() => import('./pages/org/CollaborationDetail'))],
  ['/app/approvals', L(() => import('./pages/org/Approvals'))],
  ['/app/budget', L(() => import('./pages/org/Budget'))],
  ['/app/analytics', L(() => import('./pages/org/Analytics'))],
  ['/app/crm', L(() => import('./pages/org/Crm'))],
  ['/app/collections', L(() => import('./pages/org/Collections'))],
  ['/app/strategist', L(() => import('./pages/org/Strategist'))],
  ['/app/team', L(() => import('./pages/org/Team'))],
  ['/app/clients', L(() => import('./pages/org/Clients'))],
  ['/app/settings', L(() => import('./pages/org/Settings'))],
  ['/app/notifications', L(() => import('./pages/shared/Notifications'))],
];

const CREATOR: [string, PageComponent][] = [
  ['/creator/dashboard', L(() => import('./pages/creator/Dashboard'))],
  ['/creator/profile', L(() => import('./pages/creator/Profile'))],
  ['/creator/opportunities', L(() => import('./pages/creator/Opportunities'))],
  ['/creator/opportunities/:id', L(() => import('./pages/creator/OpportunityDetail'))],
  ['/creator/deals', L(() => import('./pages/creator/Deals'))],
  ['/creator/deals/:id', L(() => import('./pages/creator/DealThread'))],
  ['/creator/collaborations', L(() => import('./pages/creator/Collaborations'))],
  ['/creator/collaborations/:id', L(() => import('./pages/creator/CollaborationDetail'))],
  ['/creator/earnings', L(() => import('./pages/creator/Earnings'))],
  ['/creator/notifications', L(() => import('./pages/shared/Notifications'))],
  ['/creator/settings', L(() => import('./pages/creator/Settings'))],
];

const ADMIN: [string, PageComponent][] = [
  ['/admin', L(() => import('./pages/admin/Overview'))],
  ['/admin/accounts', L(() => import('./pages/admin/Accounts'))],
  ['/admin/organizations', L(() => import('./pages/admin/Organizations'))],
  ['/admin/campaigns', L(() => import('./pages/admin/Campaigns'))],
  ['/admin/verification', L(() => import('./pages/admin/Verification'))],
  ['/admin/moderation', L(() => import('./pages/admin/Moderation'))],
  ['/admin/audit', L(() => import('./pages/admin/Audit'))],
  ['/admin/settings', L(() => import('./pages/admin/Settings'))],
];

const Onboarding = L(() => import('./pages/public/Onboarding'));
const Help = L(() => import('./pages/public/Help'));
const NotFound = L(() => import('./pages/shared/NotFound'));

function find(table: [string, PageComponent][], path: string) {
  for (const [pattern, C] of table) {
    const params = matchPath(pattern, path);
    if (params) return { C, params };
  }
  return null;
}

class Boundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /dynamically imported module|Failed to fetch/i.test(this.state.error.message);
    return (
      <div className="panel mx-auto mt-10 max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto size-7 text-warn-600" />
        <h2 className="mt-3 text-[16px] font-semibold">{chunk ? 'You appear to be offline' : 'This page hit a problem'}</h2>
        <p className="mt-1 text-[13px] text-ink-500">{chunk ? 'Part of the app could not be downloaded. Check your connection and try again.' : this.state.error.message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button className="h-9 rounded-[10px] border border-ink-200 px-3.5 text-[13.5px] font-medium" onClick={() => (chunk ? window.location.reload() : this.setState({ error: null }))}>Try again</button>
          {!chunk && <button className="h-9 rounded-[10px] bg-ink-900 px-3.5 text-[13.5px] font-medium text-white" onClick={async () => { await resetDemo(); window.location.hash = '#/'; window.location.reload(); }}>Reset demo data</button>}
        </div>
      </div>
    );
  }
}

function Redirect({ to }: { to: string }) {
  const { navigate } = useRouter();
  useEffect(() => navigate(to, { replace: true }), [to, navigate]);
  return null;
}

function OrgArea({ path }: { path: string }) {
  const { me, ctx, activeOrg } = useSession();
  const counts = useQuery(async () => {
    if (!activeOrg || activeOrg.type === 'agency') return { approvals: 0 };
    const q = await api.collaborations.approvalQueue(ctx, activeOrg.id);
    return { approvals: q.filter((x) => x.canAct).length };
  }, [ctx, activeOrg?.id]);
  if (!me) return <Redirect to={`/signin?next=${encodeURIComponent(path)}`} />;
  if (!activeOrg) return <Redirect to={homeFor(me)} />;
  const hit = find(ORG, path);
  const nav = orgNav(activeOrg.role, activeOrg.type, counts.data ?? {});
  const allowed = !hit || nav.some((n) => path === n.to || path.startsWith(`${n.to}/`)) || ['/app/creators/', '/app/notifications'].some((p) => path.startsWith(p));
  return (
    <AppShell nav={nav} home="/app/dashboard" kind="org">
      {hit && allowed ? <hit.C params={hit.params} /> : hit ? <NotAllowed /> : <NotFound params={{}} />}
    </AppShell>
  );
}

function NotAllowed() {
  return <div className="panel mx-auto mt-6 max-w-lg p-8 text-center"><h2 className="text-[16px] font-semibold">This area isn’t available to your role</h2><p className="mt-1 text-[13px] text-ink-500">Ask a workspace owner if you need access.</p></div>;
}

function CreatorArea({ path }: { path: string }) {
  const { me, ctx } = useSession();
  const counts = useQuery(async () => {
    if (!me?.creatorId) return {};
    const [deals, collabs] = await Promise.all([api.deals.creatorDeals(ctx), api.collaborations.listCreatorCollaborations(ctx)]);
    return { deals: deals.filter((d) => d.stage === 'offer_received').length, revisions: collabs.reduce((s, c) => s + c.revisions, 0) };
  }, [ctx, me?.creatorId]);
  useEffect(() => { if (me?.creatorId) try { api.notifications.runDeadlineReminders(ctx); } catch { /* ignore */ } }, [ctx, me?.creatorId]);
  if (!me) return <Redirect to={`/signin?next=${encodeURIComponent(path)}`} />;
  if (!me.creatorId) return <Redirect to={homeFor(me)} />;
  const hit = find(CREATOR, path);
  return <AppShell nav={creatorNav(counts.data ?? {})} home="/creator/dashboard" kind="creator">{hit ? <hit.C params={hit.params} /> : <NotFound params={{}} />}</AppShell>;
}

function AdminArea({ path }: { path: string }) {
  const { me, ctx } = useSession();
  const counts = useQuery(async () => (me?.user.platformRole === 'admin' ? api.admin.overview(ctx) : null), [ctx, me?.user.platformRole]);
  if (!me) return <Redirect to={`/signin?next=${encodeURIComponent(path)}`} />;
  if (me.user.platformRole !== 'admin') return <Redirect to={homeFor(me)} />;
  const hit = find(ADMIN, path);
  return <AppShell nav={adminNav({ verifications: counts.data?.pendingVerifications, reports: counts.data?.openReports })} home="/admin" kind="admin">{hit ? <hit.C params={hit.params} /> : <NotFound params={{}} />}</AppShell>;
}

function Routes() {
  const { path } = useRouter();
  const { me } = useSession();
  const page = useMemo(() => {
    if (path === '/app' || path === '/creator') return me ? <Redirect to={homeFor(me)} /> : <Redirect to="/signin" />;
    if (path.startsWith('/app/')) return <OrgArea path={path} />;
    if (path.startsWith('/creator/')) return <CreatorArea path={path} />;
    if (path === '/admin' || path.startsWith('/admin/')) return <AdminArea path={path} />;
    if (path === '/onboarding') return me ? <Onboarding params={{}} /> : <Redirect to="/signin" />;
    if (path === '/help') return me ? <AppShellFor><Help params={{}} /></AppShellFor> : <PublicLayout><Help params={{}} /></PublicLayout>;
    const hit = find(PUBLIC, path);
    if (hit) return ['/signin', '/signup', '/verify', '/forgot', '/reset'].includes(path) ? <hit.C params={hit.params} /> : <PublicLayout><hit.C params={hit.params} /></PublicLayout>;
    return <PublicLayout><NotFound params={{}} /></PublicLayout>;
  }, [path, me]);
  return <Boundary resetKey={path}><Suspense fallback={<div className="mx-auto max-w-5xl p-8"><PageSkeleton /></div>}>{page}</Suspense></Boundary>;
}

function AppShellFor({ children }: { children: ReactNode }) {
  const { me, activeOrg } = useSession();
  if (!me) return null;
  if (me.user.platformRole === 'admin') return <AppShell nav={adminNav({})} home="/admin" kind="admin">{children}</AppShell>;
  if (me.creatorId) return <AppShell nav={creatorNav({})} home="/creator/dashboard" kind="creator">{children}</AppShell>;
  if (activeOrg) return <AppShell nav={orgNav(activeOrg.role, activeOrg.type, {})} home="/app/dashboard" kind="org">{children}</AppShell>;
  return <>{children}</>;
}

function Boot({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { initBackend().then(() => setReady(true), (e: Error) => setError(e.message)); }, []);
  if (error) return <div className="grid min-h-screen place-items-center p-6 text-center"><div><p className="font-semibold">Tandem couldn’t start</p><p className="mt-1 text-[13px] text-ink-500">{error}</p></div></div>;
  if (!ready) return <div className="grid min-h-screen place-items-center" aria-busy="true"><div className="flex flex-col items-center gap-3 animate-in"><Logo /><p className="text-[12.5px] text-ink-500">{IS_DEMO ? 'Preparing your demo workspace…' : 'Loading…'}</p></div></div>;
  return <>{children}</>;
}

export default function App() {
  return (
    <RouterProvider>
      <ToastProvider>
        <Boot>
          <SessionProvider>
            <Routes />
          </SessionProvider>
        </Boot>
      </ToastProvider>
    </RouterProvider>
  );
}
