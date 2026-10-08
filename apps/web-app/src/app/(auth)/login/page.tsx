'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { loginSchema } from '@/lib/validations';
import { api, ApiError } from '@/lib/api-client';
import { fieldErrorsFromApi } from '@/lib/form-errors';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginValues) {
    setServerError(null);
    try {
      const res = await api<{ user: { name: string } }>('/api/auth/login', {
        method: 'POST',
        body: values,
      });
      toast.success(`Welcome back, ${res.user.name.split(' ')[0]}`);
      router.push('/');
      router.refresh(); // re-render server layouts with the new session
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          setServerError('Invalid email or password');
          return;
        }
        // 400s: map Zod details to field-level errors
        for (const [field, message] of Object.entries(fieldErrorsFromApi(error))) {
          (form.setError as (f: string, e: { message: string }) => void)(field, { message });
        }
        setServerError(Object.keys(fieldErrorsFromApi(error)).length ? null : error.message);
      }
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="bg-primary/10 text-primary mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl">
          <Wallet className="h-5 w-5" />
        </div>
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
              <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
                {serverError}
              </p>
            )}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="text-muted-foreground justify-center text-sm">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-primary ml-1 font-medium hover:underline">
          Register
        </Link>
      </CardFooter>
    </Card>
  );
}
