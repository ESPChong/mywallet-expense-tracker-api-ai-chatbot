'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, LogOut, Menu, Receipt, Tags, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme-toggle';
import { ChatbotDrawer } from '@/components/chatbot/chatbot-drawer';

interface AppShellProps {
  user: { id: string; name: string; email: string };
  children: React.ReactNode;
}

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/expenses', label: 'Expenses', icon: Receipt },
  { href: '/incomes', label: 'Incomes', icon: TrendingUp },
  { href: '/categories', label: 'Categories', icon: Tags },
];

function initials(name: string) {
  return (
    name
      .split(' ')
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ user }: { user: AppShellProps['user'] }) {
  const router = useRouter();

  async function handleLogout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      toast.success('Logged out');
      router.replace('/login');
      router.refresh();
    } catch {
      toast.error('Could not log out — try again');
    }
  }

  return (
    <div className="space-y-3 border-t p-4">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
          {initials(user.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="text-muted-foreground truncate text-xs">{user.email}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Log out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <div className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg">
        <Wallet className="h-4 w-4" />
      </div>
      <span className="font-semibold tracking-tight">MyWallet</span>
    </Link>
  );
}

export function AppShell({ user, children }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-svh">
      {/* Desktop sidebar */}
      <aside className="bg-card hidden w-60 shrink-0 flex-col border-r md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <BrandMark />
        </div>
        <div className="flex-1 p-3">
          <NavLinks />
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <span className="text-muted-foreground text-xs">Theme</span>
          <ThemeToggle />
        </div>
        <SidebarFooter user={user} />
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-h-svh w-full flex-col md:w-auto">
        <header className="bg-background/95 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4 backdrop-blur md:hidden">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="flex h-14 items-center border-b px-4">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <BrandMark />
              </div>
              <div className="p-3">
                <NavLinks onNavigate={() => setMobileNavOpen(false)} />
              </div>
              <SidebarFooter user={user} />
            </SheetContent>
          </Sheet>
          <BrandMark />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1">
          {/* bottom padding on mobile keeps content clear of the chatbot FAB */}
          <div className="mx-auto w-full max-w-6xl p-4 pb-24 md:p-6 md:pb-6">{children}</div>
        </main>
      </div>

      {/* Persists across page navigation because it mounts in the layout —
          the conversation survives switching between pages */}
      <ChatbotDrawer />
    </div>
  );
}
