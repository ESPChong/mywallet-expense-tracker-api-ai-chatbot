'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { ApiError } from '@/lib/api-client';
import { fieldErrorsFromApi } from '@/lib/form-errors';
import { useCategories } from '@/hooks/use-categories';
import { useCreateExpense, useUpdateExpense } from '@/hooks/use-expenses';
import type { Expense } from '@/types/api';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

const expenseFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  amount: z
    .string()
    .trim()
    .min(1, 'Amount is required')
    .refine((v) => /^\$?(\d+(\.\d{1,2})?|\.\d{1,2})$/.test(v), 'Enter a valid amount, e.g. 49.99'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  categoryId: z.string(), // '' = uncategorized
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

function todayInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dollarsToCents(raw: string): number {
  return Math.round(parseFloat(raw.trim().replace(/^\$/, '')) * 100);
}

// Inner component: mounts fresh every time the dialog opens (DialogContent
// unmounts when closed), so defaultValues double as per-open seeding —
// no reset effect, no setState-in-effect.
function ExpenseForm({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const { data: catData } = useCategories();
  const categories = catData?.data ?? [];
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      name: expense?.name ?? '',
      amount: expense ? (expense.amount / 100).toFixed(2) : '',
      date: expense ? expense.date.slice(0, 10) : todayInputValue(),
      categoryId: expense?.categoryId ?? '',
    },
  });

  const isEdit = Boolean(expense);
  const isSubmitting = createExpense.isPending || updateExpense.isPending;

  async function onSubmit(values: ExpenseFormValues) {
    setServerError(null);
    const amount = dollarsToCents(values.amount);
    try {
      if (expense) {
        await updateExpense.mutateAsync({
          id: expense.id,
          input: {
            name: values.name.trim(),
            amount,
            date: values.date,
            categoryId: values.categoryId || null, // '' explicitly clears
          },
        });
      } else {
        await createExpense.mutateAsync({
          name: values.name.trim(),
          amount,
          date: values.date,
          ...(values.categoryId ? { categoryId: values.categoryId } : {}),
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
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Weekly groceries" {...field} />
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
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" className="dark:scheme-dark" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <FormControl>
                <NativeSelect value={field.value} onChange={field.onChange} ariaLabel="Category">
                  <option value="">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Add expense'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? 'Edit expense' : 'Add expense'}</DialogTitle>
          <DialogDescription>
            {expense ? 'Update the details of this expense.' : 'Record a new expense.'}
          </DialogDescription>
        </DialogHeader>
        {/* key forces a fresh instance per target (create vs a specific expense) */}
        <ExpenseForm
          key={expense?.id ?? 'create'}
          expense={expense}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
