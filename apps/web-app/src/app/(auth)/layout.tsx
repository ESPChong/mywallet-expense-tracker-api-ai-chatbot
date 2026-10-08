import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Real session check — safe to redirect here: if the session is valid, the
  // (app) layout will accept it too. Stale cookies render the login page normally.
  const user = await getCurrentUser();
  if (user) redirect('/');

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center p-6">
      {/* Subtle brand glow — one restrained decorative element */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="bg-primary/15 absolute -top-48 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full blur-[120px]" />
        <div className="bg-primary/10 absolute right-0 -bottom-64 h-96 w-96 rounded-full blur-[100px]" />
      </div>
      {children}
    </div>
  );
}
