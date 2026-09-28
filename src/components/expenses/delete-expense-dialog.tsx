'use client';

import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCents } from '@/lib/format';
import { useDeleteExpense } from '@/hooks/use-expenses';
import type { Expense } from '@/types/api';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function DeleteExpenseDialog({
  expense,
  open,
  onOpenChange,
}: {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteExpense = useDeleteExpense();

  async function handleDelete() {
    if (!expense) return;
    try {
      await deleteExpense.mutateAsync(expense.id);
      onOpenChange(false);
    } catch {
      toast.error('Could not delete the expense — try again');
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
          <AlertDialogDescription>
            {expense && (
              <>
                <span className="text-foreground font-medium">{expense.name}</span>
                {' — '}
                {formatCents(expense.amount)}. This permanently removes the expense and updates your
                monthly totals.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteExpense.isPending}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteExpense.isPending}>
            {deleteExpense.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
