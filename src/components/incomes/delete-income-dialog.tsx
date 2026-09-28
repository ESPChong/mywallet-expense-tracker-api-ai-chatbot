'use client';

import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCents, ordinalDay } from '@/lib/format';
import { useDeleteIncome, useToggleIncome } from '@/hooks/use-incomes';
import type { Income } from '@/types/api';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function DeleteIncomeDialog({
  income,
  open,
  onOpenChange,
}: {
  income: Income | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteIncome = useDeleteIncome();
  const pauseIncome = useToggleIncome();

  async function handleDelete() {
    if (!income) return;
    try {
      await deleteIncome.mutateAsync(income.id);
      onOpenChange(false);
    } catch {
      toast.error('Could not delete — try again');
    }
  }

  // The soft-delete path: keeps history, stops future postings
  async function handleStopInstead() {
    if (!income) return;
    try {
      await pauseIncome.mutateAsync({ id: income.id, active: false });
      toast.success('Income paused — history preserved');
      onOpenChange(false);
    } catch {
      toast.error('Could not pause — try again');
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this recurring income?</AlertDialogTitle>
          <AlertDialogDescription render={(props) => <div {...props} />}>
            {income && (
              <>
                <span className="text-foreground font-medium">
                  {income.name ?? 'Recurring income'}
                </span>
                {' — '}
                {formatCents(income.amount)} monthly, posting on the {ordinalDay(income.dayOfMonth)}
                .
              </>
            )}
            <div className="mt-2">
              Deleting permanently removes this template{' '}
              <strong>and all of its past income entries</strong>, which changes your all-time
              savings. If you just want it to stop posting, pause it instead.
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteIncome.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={handleStopInstead}
            disabled={deleteIncome.isPending || pauseIncome.isPending}
          >
            {pauseIncome.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Stop instead
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteIncome.isPending}>
            {deleteIncome.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
