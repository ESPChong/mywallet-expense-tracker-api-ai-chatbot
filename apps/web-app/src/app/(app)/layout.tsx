import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AppShell } from '@/components/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The real gate: middleware only checks cookie presence; this validates the
  // session against the DB and redirects if it's stale or missing.
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return <AppShell user={user}>{children}</AppShell>;
}
