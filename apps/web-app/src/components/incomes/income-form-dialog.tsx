'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { ApiError } from '@/lib/api-client';
import { fieldErrorsFromApi } from '@/lib/form-errors';
import { useCreateIncome, useUpdateIncome } from '@/hooks/use-incomes';
import { ordinalDay } from '@/lib/format';
import type { Income } from '@/types/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

const incomeFormSchema = z.object({
  name: z.string().trim().max(100, 'Name is too long'),
  amount: z
    .string()
    .trim()
    .min(1, 'Amount is required')
    .refine(
      (v) => /^\$?(\d+(\.\d{1,2})?|\.\d{1,2})$/.test(v),
      'Enter a valid amount, e.g. 2500.00',
    ),
  dayOfMonth: z.string().regex(/^([1-9]|[12]\d|3[01])$/, 'Pick a day'),
});

type IncomeFormValues = z.infer<typeof incomeFormSchema>;

function dollarsToCents(raw: string): number {
  return Math.round(parseFloat(raw.trim().replace(/^\$/, '')) * 100);
}

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => String(i + 1));

function IncomeForm({ income, onClose }: { income: Income | null; onClose: () => void }) {
  const createIncome = useCreateIncome();
  const updateIncome = useUpdateIncome();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<IncomeFormValues>({
    resolver: zodResolver(incomeFormSchema),
    defaultValues: {
      name: income?.name ?? '',
      amount: income ? (income.amount / 100).toFixed(2) : '',
      dayOfMonth: income ? String(income.dayOfMonth) : '1',
    },
  });

  const isEdit = Boolean(income);
  const isSubmitting = createIncome.isPending || updateIncome.isPending;

  async function onSubmit(values: IncomeFormValues) {
    setServerError(null);
    const amount = dollarsToCents(values.amount);
    const dayOfMonth = Number(values.dayOfMonth);
    try {
      if (income) {
        await updateIncome.mutateAsync({
          id: income.id,
          input: { name: values.name.trim() || null, amount, dayOfMonth },
        });
      } else {
        await createIncome.mutateAsync({
          ...(values.name.trim() ? { name: values.name.trim() } : {}),
          amount,
          dayOfMonth,
        });
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const fields = fieldErrorsFromApi(error);
        for (const [field, message] of Object.entries(fields)) {
          (form.setError as (f: string, e: { message: string }) => void)(field, { message });
        }
        if (Object.keys(fields).length === 0) setServerError(error.message);
      }
    }
  }

  return (
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
              <FormLabel>
                Name <span className="text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input placeholder="e.g. Salary" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <Input inputMode="decimal" placeholder="0.00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dayOfMonth"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Posts on</FormLabel>
                <FormControl>
                  <NativeSelect
                    value={field.value}
                    onChange={field.onChange}
                    ariaLabel="Day of month"
                  >
                    {DAY_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        The {ordinalDay(Number(d))}
                      </option>
                    ))}
                  </NativeSelect>
                </FormControl>
                <FormDescription>
                  Days past a month&apos;s end post on its last day.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Add income'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function IncomeFormDialog({
  open,
  onOpenChange,
  income,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  income: Income | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{income ? 'Edit income' : 'Add income'}</DialogTitle>
          <DialogDescription>Recurring incomes post automatically every month.</DialogDescription>
        </DialogHeader>
        <IncomeForm
          key={income?.id ?? 'create'}
          income={income}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
