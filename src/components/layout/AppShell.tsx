import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Bell, ChevronsUpDown, LogOut, Menu as MenuIcon, Settings, X, Check, Building2, FlaskConical, HelpCircle } from 'lucide-react';
import { useRouter } from '../../lib/router';
import { useSession } from '../../app/session';
import { storageWarning } from '../../server/api';
import { cx } from '../../lib/utils';
import Logo from './Logo';
import { Avatar, Menu, MenuItem } from '../ui/misc';
import { ROLE_META } from '../../domain/constants';

export interface NavItem { to: string; label: string; icon: ComponentType<{ className?: string }>; badge?: number | null; section?: string }

export function isActive(path: string, to: string, exact = false) {
  return exact ? path === to : path === to || path.startsWith(`${to}/`);
}

export default function AppShell({ nav, children, home, kind }: { nav: NavItem[]; children: ReactNode; home: string; kind: 'org' | 'creator' | 'admin' }) {
  const { path, navigate } = useRouter();
  const { me, signOut, activeOrg, switchOrg } = useSession();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  if (!me) return null;
  const notifPath = kind === 'creator' ? '/creator/notifications' : kind === 'admin' ? '/admin/audit' : '/app/notifications';
  const settingsPath = kind === 'creator' ? '/creator/settings' : kind === 'admin' ? '/admin/settings' : '/app/settings';
  const sections = [...new Set(nav.map((n) => n.section ?? ''))];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <button onClick={() => navigate(home)} aria-label="Tandem home"><Logo /></button>
        <button className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-4" /></button>
      </div>
      {kind === 'org' && activeOrg && (
        <div className="px-3 pb-2">
          <Menu width="w-[232px]" align="left" trigger={({ toggle, open: o }) => (
            <button onClick={toggle} aria-expanded={o} className="flex w-full items-center gap-2.5 rounded-[10px] border border-ink-200 bg-surface px-2.5 py-2 text-left shadow-xs hover:border-ink-300">
              <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-ink-900 text-[11px] font-semibold text-white">{activeOrg.name.slice(0, 2).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink-900">{activeOrg.name}</span>
                <span className="block truncate text-[11px] text-ink-500">{activeOrg.type === 'client' ? 'Client workspace' : activeOrg.type === 'agency' ? 'Agency' : 'Brand'} · {ROLE_META[activeOrg.role].label}</span>
              </span>
              <ChevronsUpDown className="size-4 text-ink-400" />
            </button>
          )}>
            {(close) => (
              <>
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-ink-400">Workspaces</p>
                {me.orgs.map((o) => (
                  <MenuItem key={o.id} icon={Building2} active={o.id === activeOrg.id} onClick={async () => { close(); await switchOrg(o.id); navigate('/app/dashboard'); }}>
                    <span className="flex items-center justify-between gap-2">{o.parentOrgId ? `↳ ${o.name}` : o.name}{o.id === activeOrg.id && <Check className="size-3.5 text-accent-600" />}</span>
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto px-3 py-1 scroll-thin" aria-label="Workspace">
        {sections.map((sec) => (
          <div key={sec} className="mb-3">
            {sec && <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-ink-400">{sec}</p>}
            {nav.filter((n) => (n.section ?? '') === sec).map((n) => {
              const on = isActive(path, n.to);
              return (
                <button key={n.to} onClick={() => navigate(n.to)} aria-current={on ? 'page' : undefined} className={cx('group flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-[13.5px] font-medium transition-colors', on ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900')}>
                  <n.icon className={cx('size-[17px] shrink-0', on ? 'text-ink-900' : 'text-ink-400 group-hover:text-ink-600')} />
                  <span className="flex-1 text-left">{n.label}</span>
                  {!!n.badge && <span className="num rounded-full bg-accent-600 px-1.5 text-[10.5px] font-semibold text-white">{n.badge}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="m-3 rounded-[11px] border border-dashed border-ink-300 p-3 text-[11.5px] leading-snug text-ink-500">
        <p className="flex items-center gap-1.5 font-semibold text-ink-700"><FlaskConical className="size-3.5" /> Demo mode</p>
        <p className="mt-1">All creators, brands and figures are fictional. Nothing is sent or paid.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[256px] border-r border-ink-200 bg-paper lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/30 animate-in" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[272px] bg-paper shadow-lg animate-drawer">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-[256px]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-ink-200 bg-paper/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><MenuIcon className="size-5" /></button>
          <span className="lg:hidden"><Logo mark /></span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => navigate('/help')} className="hidden items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-[12.5px] font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-900 sm:flex"><HelpCircle className="size-4" /> How it works</button>
            <button onClick={() => navigate(notifPath)} className="relative rounded-[9px] p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label={`Notifications${me.unread ? `, ${me.unread} unread` : ''}`}>
              <Bell className="size-[18px]" />
              {me.unread > 0 && <span className="num absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-accent-600 px-1 text-[9.5px] font-semibold text-white">{me.unread > 9 ? '9+' : me.unread}</span>}
            </button>
            <Menu trigger={({ toggle }) => <button onClick={toggle} className="ml-1 rounded-full" aria-label="Account menu"><Avatar name={me.user.name} size="sm" hue={225} /></button>}>
              {(close) => (
                <>
                  <div className="px-2.5 py-2"><p className="truncate text-[13px] font-semibold">{me.user.name}</p><p className="truncate text-[12px] text-ink-500">{me.user.email}</p></div>
                  <div className="divider my-1" />
                  <MenuItem icon={Settings} onClick={() => { close(); navigate(settingsPath); }}>Settings</MenuItem>
                  <MenuItem icon={LogOut} danger onClick={() => { close(); void signOut(); }}>Sign out</MenuItem>
                </>
              )}
            </Menu>
          </div>
        </header>
        {storageWarning && <div className="border-b border-warn-600/20 bg-warn-50 px-6 py-2 text-[12.5px] text-warn-600">{storageWarning}</div>}
        <main id="main" className="mx-auto max-w-[1320px] px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
          <div key={path} className="page-enter">{children}</div>
        </main>
      </div>
    </div>
  );
}
