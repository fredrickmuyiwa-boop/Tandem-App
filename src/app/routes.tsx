import type { ComponentType } from 'react';
import {
  LayoutDashboard, Compass, Sparkles, Megaphone, CheckCheck, Handshake, Bookmark, Contact, MessageSquareText, Wallet, BarChart3, Users, Settings,
  Briefcase, Inbox, UserRound, BadgeCheck, Flag, ScrollText, Building2, ShieldCheck, LayoutGrid, Bell,
} from 'lucide-react';
import type { NavItem } from '../components/layout/AppShell';
import { roleCan } from '../server/access';
import type { OrgRole } from '../domain/types';

type Me = { user: { kind: string; platformRole: string; onboarded: boolean }; orgs: { id: string; type: string; role: OrgRole }[]; activeOrgId?: string; creatorId?: string };

export function homeFor(me: Me): string {
  if (me.user.platformRole === 'admin') return '/admin';
  if (me.user.kind === 'creator') return me.creatorId ? '/creator/dashboard' : '/onboarding';
  return me.orgs.length ? '/app/dashboard' : '/onboarding';
}

export function orgNav(role: OrgRole, orgType: string, counts: { approvals?: number; deals?: number }): NavItem[] {
  const all: (NavItem & { perm?: Parameters<typeof roleCan>[1]; types?: string[] })[] = [
    { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/app/discover', label: 'Discover creators', icon: Compass, perm: 'discover' },
    { to: '/app/match', label: 'AI matching', icon: Sparkles, perm: 'discover' },
    { to: '/app/campaigns', label: 'Campaigns', icon: Megaphone, perm: 'campaign.view', types: ['brand', 'client'] },
    { to: '/app/approvals', label: 'Approvals', icon: CheckCheck, badge: counts.approvals, types: ['brand', 'client'] },
    { to: '/app/collaborations', label: 'Collaborations', icon: Handshake, perm: 'budget.view', types: ['brand', 'client'] },
    { to: '/app/clients', label: 'Clients', icon: Building2, types: ['agency'] },
    { to: '/app/collections', label: 'Collections', icon: Bookmark, section: 'Relationships' },
    { to: '/app/crm', label: 'Creator CRM', icon: Contact, perm: 'crm.view', section: 'Relationships' },
    { to: '/app/strategist', label: 'AI strategist', icon: MessageSquareText, perm: 'strategist', section: 'Relationships' },
    { to: '/app/budget', label: 'Budget & payments', icon: Wallet, perm: 'budget.view', section: 'Business', types: ['brand', 'client'] },
    { to: '/app/analytics', label: 'Analytics', icon: BarChart3, perm: 'campaign.view', section: 'Business' },
    { to: '/app/team', label: 'Team', icon: Users, section: 'Business' },
    { to: '/app/settings', label: 'Settings', icon: Settings, section: 'Business' },
  ];
  return all.filter((n) => (!n.perm || roleCan(role, n.perm)) && (!n.types || n.types.includes(orgType)) && !(role === 'client_reviewer' && ['/app/team', '/app/analytics'].includes(n.to)));
}

export function creatorNav(counts: { deals?: number; revisions?: number }): NavItem[] {
  return [
    { to: '/creator/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/creator/opportunities', label: 'Opportunities', icon: LayoutGrid },
    { to: '/creator/deals', label: 'Invitations & offers', icon: Inbox, badge: counts.deals },
    { to: '/creator/collaborations', label: 'Collaborations', icon: Briefcase, badge: counts.revisions },
    { to: '/creator/earnings', label: 'Earnings', icon: Wallet },
    { to: '/creator/profile', label: 'My profile', icon: UserRound, section: 'Account' },
    { to: '/creator/notifications', label: 'Notifications', icon: Bell, section: 'Account' },
    { to: '/creator/settings', label: 'Settings', icon: Settings, section: 'Account' },
  ];
}

export function adminNav(counts: { verifications?: number; reports?: number }): NavItem[] {
  return [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard },
    { to: '/admin/accounts', label: 'Accounts', icon: Users },
    { to: '/admin/organizations', label: 'Organisations', icon: Building2 },
    { to: '/admin/campaigns', label: 'Campaigns', icon: Megaphone },
    { to: '/admin/verification', label: 'Verification', icon: BadgeCheck, badge: counts.verifications, section: 'Trust & safety' },
    { to: '/admin/moderation', label: 'Moderation', icon: Flag, badge: counts.reports, section: 'Trust & safety' },
    { to: '/admin/audit', label: 'Audit & security', icon: ShieldCheck, section: 'Trust & safety' },
    { to: '/admin/settings', label: 'Platform settings', icon: ScrollText, section: 'Configuration' },
  ];
}

export type PageComponent = ComponentType<{ params: Record<string, string> }>;
