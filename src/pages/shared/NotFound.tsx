import { Compass } from 'lucide-react';
import { useRouter } from '../../lib/router';
import { useSession } from '../../app/session';
import { homeFor } from '../../app/routes';
import { EmptyState } from '../../components/ui/misc';
import Button from '../../components/ui/Button';

export default function NotFound() {
  const { navigate, path } = useRouter();
  const { me } = useSession();
  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState icon={Compass} title="Page not found" message={`There’s nothing at “${path}”.`} action={<Button variant="dark" onClick={() => navigate(me ? homeFor(me) : '/')}>Go home</Button>} />
    </div>
  );
}
