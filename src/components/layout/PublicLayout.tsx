import { useState, type ReactNode } from 'react';
import { Menu as MenuIcon, X } from 'lucide-react';
import { Link, useRouter } from '../../lib/router';
import { useSession } from '../../app/session';
import Logo from './Logo';
import Button from '../ui/Button';
import { homeFor } from '../../app/routes';

const NAV = [
  { to: '/#brands', label: 'For brands' },
  { to: '/#agencies', label: 'For agencies' },
  { to: '/#creators', label: 'For creators' },
  { to: '/pricing', label: 'Pricing' },
];

export default function PublicLayout({ children }: { children: ReactNode }) {
  const { navigate } = useRouter();
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const go = (to: string) => {
    setOpen(false);
    if (to.startsWith('/#')) {
      navigate('/');
      setTimeout(() => document.getElementById(to.slice(2))?.scrollIntoView({ behavior: 'smooth' }), 60);
    } else navigate(to);
  };
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-ink-150/80 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" aria-label="Tandem home"><Logo /></Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => <button key={n.to} onClick={() => go(n.to)} className="rounded-[8px] px-3 py-1.5 text-[13.5px] font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900">{n.label}</button>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {me ? <Button variant="dark" size="sm" onClick={() => navigate(homeFor(me))}>Open workspace</Button> : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate('/signin')} className="hidden sm:inline-flex">Sign in</Button>
                <Button variant="dark" size="sm" onClick={() => navigate('/signup')}>Get started</Button>
              </>
            )}
            <button className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>{open ? <X className="size-5" /> : <MenuIcon className="size-5" />}</button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-ink-150 px-4 py-3 md:hidden animate-up" aria-label="Mobile">
            {[...NAV, ...(me ? [] : [{ to: '/signin', label: 'Sign in' }])].map((n) => <button key={n.to} onClick={() => go(n.to)} className="block w-full rounded-[8px] px-3 py-2.5 text-left text-[14px] font-medium text-ink-700 hover:bg-ink-100">{n.label}</button>)}
          </nav>
        )}
      </header>
      <main>{children}</main>
      <footer className="border-t border-ink-150">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.5fr_1fr_1fr] sm:px-6">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-ink-500">The right brands. The right creators. Better campaigns. Less operational friction.</p>
          </div>
          <div className="space-y-2 text-[13px]">
            <p className="eyebrow">Product</p>
            <button onClick={() => go('/pricing')} className="block text-ink-600 hover:text-ink-900">Pricing</button>
            <button onClick={() => go('/signup')} className="block text-ink-600 hover:text-ink-900">Create an account</button>
          </div>
          <div className="space-y-2 text-[13px]">
            <p className="eyebrow">Trust</p>
            <button onClick={() => go('/privacy')} className="block text-ink-600 hover:text-ink-900">Privacy & data</button>
            <p className="text-ink-500">Demo build — sample data only.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
