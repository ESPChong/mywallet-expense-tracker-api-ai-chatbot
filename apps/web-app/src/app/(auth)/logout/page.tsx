'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function LogoutPage() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setIsPending(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
      toast.success('Logged out');
    } catch {
      // Session row deletion is best-effort in the API; even on failure the
      // cookie is cleared server-side. Surface it but still leave.
      toast.error('Could not fully log out — your session may persist');
    } finally {
      router.replace('/login');
      router.refresh(); // re-render server layouts with the cleared session
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="bg-primary/10 text-primary mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl">
            <Wallet className="h-5 w-5" />
          </div>
          <CardTitle className="text-xl">Log out</CardTitle>
          <CardDescription>Are you sure you want to sign out of your account?</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleLogout} disabled={isPending} className="w-full">
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            {isPending ? 'Signing out…' : 'Yes, log me out'}
          </Button>
        </CardContent>
        <CardFooter className="text-muted-foreground justify-center text-sm">
          Changed your mind? Just close this page or navigate anywhere else.
        </CardFooter>
      </Card>
    </div>
  );
}
