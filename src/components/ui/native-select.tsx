'use client';

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NativeSelectProps {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  // Compatibility with our <FormControl> wrapper, which clones these onto its
  // child for label association + error announcements (see ui/form.tsx).
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function NativeSelect({
  value,
  onChange,
  children,
  className,
  ariaLabel,
  disabled,
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: NativeSelectProps) {
  return (
    <div className={cn('relative', className)}>
      <select
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-background focus-visible:ring-ring h-9 w-full cursor-pointer appearance-none rounded-lg border py-1 pr-8 pl-3 text-sm font-medium outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {children}
      </select>
      <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2" />
    </div>
  );
}
