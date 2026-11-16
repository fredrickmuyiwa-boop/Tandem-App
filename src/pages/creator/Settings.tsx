import { useState } from 'react';
import { NotificationPrefsPanel, SecurityPanel, DataPanel } from '../../components/app/AccountPanels';
import { PageHeader, Tabs } from '../../components/ui/misc';

type Tab = 'notifications' | 'security' | 'data';
export default function Settings() {
  const [tab, setTab] = useState<Tab>('notifications');
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'notifications', label: 'Notifications' }, { id: 'security', label: 'Security' }, { id: 'data', label: 'Data & privacy' }]} />
      {tab === 'notifications' && <NotificationPrefsPanel />}
      {tab === 'security' && <SecurityPanel />}
      {tab === 'data' && <DataPanel />}
    </div>
  );
}
