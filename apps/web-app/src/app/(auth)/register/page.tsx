'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { registerSchema } from '@/lib/validations';
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

// Client-only extension of the shared server schema: confirm-password
const registerFormSchema = registerSchema
  .extend({ confirmPassword: z.string().min(1, 'Please confirm your password') })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type RegisterFormValues = z.infer<typeof registerFormSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(values: RegisterFormValues) {
    setServerError(null);
    try {
      await api('/api/auth/register', {
        method: 'POST',
        // confirmPassword never leaves the client
        body: { name: values.name, email: values.email, password: values.password },
      });
      toast.success('Account created — welcome!');
      router.push('/');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(fieldErrorsFromApi(error))) {
          (form.setError as (f: string, e: { message: string }) => void)(field, { message });
        }
        if (error.status === 409) setServerError(error.message);
      }
    }
  }

  const passwordInput = (field: {
    name: string;
    onChange: () => void;
    onBlur: () => void;
    value: string;
    disabled?: boolean;
  }) => (
    <div className="relative">
      <Input
        type={showPassword ? 'text' : 'password'}
        autoComplete="new-password"
        className="pr-10"
        {...field}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShowPassword((s) => !s)}
        className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
        aria-label={showPassword ? 'Hide password' : 'Show password'}
      >
        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <div className="bg-primary/10 text-primary mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl">
          <Wallet className="h-5 w-5" />
        </div>
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>Start tracking your spending in minutes</CardDescription>
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Jane Doe" autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                  <FormControl>{passwordInput(field)}</FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm password</FormLabel>
                  <FormControl>{passwordInput(field)}</FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create account
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="text-muted-foreground justify-center text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-primary ml-1 font-medium hover:underline">
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
