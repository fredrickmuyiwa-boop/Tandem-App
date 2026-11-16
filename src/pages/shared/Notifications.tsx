import { Bell, CheckCheck, Mail } from 'lucide-react';
import { api } from '../../server/api';
import { useSession } from '../../app/session';
import { useAction, useQuery } from '../../app/hooks';
import { useRouter } from '../../lib/router';
import { cx, timeAgo } from '../../lib/utils';
import { EmptyState, PageHeader, PageSkeleton } from '../../components/ui/misc';
import Button from '../../components/ui/Button';

export default function Notifications() {
  const { ctx, me } = useSession();
  const { navigate } = useRouter();
  const act = useAction();
  const q = useQuery(() => api.notifications.listNotifications(ctx), [ctx]);
  if (!q.data) return <PageSkeleton />;
  const prefsPath = me?.creatorId ? '/creator/settings' : '/app/settings?tab=notifications';
  return (
    <div>
      <PageHeader title="Notifications" description="Updates on invitations, offers, content and payments." actions={<><Button size="sm" onClick={() => navigate(prefsPath)}>Preferences</Button><Button size="sm" icon={CheckCheck} disabled={!q.data.some((n) => !n.read)} onClick={() => act.run('all', () => api.notifications.markRead(ctx))}>Mark all read</Button></>} />
      <div className="panel divide-y divide-ink-150">
        {q.data.length ? q.data.map((n) => (
          <button key={n.id} onClick={() => { void api.notifications.markRead(ctx, n.id); if (n.link) navigate(n.link); }} className={cx('flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-ink-50', !n.read && 'bg-accent-50/40')}>
            <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-accent-600')} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-ink-900">{n.title}</span>
              <span className="block text-[13px] text-ink-600">{n.body}</span>
              <span className="mt-1 flex items-center gap-2 text-[11.5px] text-ink-400">{timeAgo(n.createdAt)}{n.emailQueued && <span className="inline-flex items-center gap-1" title="An email would be sent once an email provider is connected"><Mail className="size-3" />Email queued (not sent in demo)</span>}</span>
            </span>
          </button>
        )) : <EmptyState icon={Bell} title="You’re all caught up" message="New activity will appear here." />}
      </div>
    </div>
  );
}
