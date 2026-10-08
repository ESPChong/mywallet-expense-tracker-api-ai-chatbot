'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { ApiError } from '@/lib/api-client';
import { fieldErrorsFromApi } from '@/lib/form-errors';
import { useCreateCategory } from '@/hooks/use-categories';
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

const categoryFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

function CategoryForm({ onClose }: { onClose: () => void }) {
  const createCategory = useCreateCategory();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: '' },
  });

  async function onSubmit(values: CategoryFormValues) {
    setServerError(null);
    try {
      await createCategory.mutateAsync(values.name.trim());
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
                <Input placeholder="e.g. hobbies" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={createCategory.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={createCategory.isPending}>
            {createCategory.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Add category
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function CategoryCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add category</DialogTitle>
          <DialogDescription>A new way to group your expenses.</DialogDescription>
        </DialogHeader>
        {/* No entity target here — the open-state key guarantees a fresh
            instance per open even if DialogContent were kept mounted. */}
        <CategoryForm key={open ? 'open' : 'closed'} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
