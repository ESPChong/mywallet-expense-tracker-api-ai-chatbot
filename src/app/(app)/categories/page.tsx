'use client';

import { useState } from 'react';
import { AlertCircle, Plus } from 'lucide-react';
import { useCategories } from '@/hooks/use-categories';
import { CategoryCreateDialog } from '@/components/categories/category-create-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function CategoriesPage() {
  const { data, isPending, isError, refetch } = useCategories();
  const [createOpen, setCreateOpen] = useState(false);

  const categories = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
          <p className="text-muted-foreground text-sm">
            {isPending
              ? 'How you group your expenses'
              : `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} · used to organize your expenses`}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Add category
        </Button>
      </div>

      {isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="text-destructive h-8 w-8" />
            <div>
              <p className="font-medium">Couldn&apos;t load your categories</p>
              <p className="text-muted-foreground text-sm">
                Something went wrong fetching your data.
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : isPending ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <span
                  key={c.id}
                  className="bg-muted inline-flex items-center rounded-full px-3 py-1 text-sm font-medium"
                >
                  {c.name}
                </span>
              ))}
            </div>
            <p className="text-muted-foreground mt-4 text-xs">
              Editing and deleting categories — with expense reassignment — is coming in a later API
              update.
            </p>
          </CardContent>
        </Card>
      )}

      <CategoryCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
