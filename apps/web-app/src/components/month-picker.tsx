'use client';

import { useMemo } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, currentMonthString, monthLabel } from '@/lib/format';
import { Button } from '@/components/ui/button';

const MONTHS_BACK = 36;

export function MonthPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (month: string) => void;
}) {
  const current = currentMonthString();

  const options = useMemo(() => {
    const start = addMonths(current, -MONTHS_BACK);
    const list: string[] = [];
    for (let m = start; m <= current; m = addMonths(m, 1)) list.push(m);
    // A URL month outside the generated range still gets an option so the
    // select shows something instead of going blank.
    if (!list.includes(value)) list.unshift(value);
    return list;
  }, [current, value]);

  // Plain string compare — valid because YYYY-MM is zero-padded (see format.ts)
  const canGoNext = value < current;

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon"
        aria-label="Previous month"
        onClick={() => onChange(addMonths(value, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Select month"
          className="bg-background focus-visible:ring-ring h-9 cursor-pointer appearance-none rounded-lg border py-1 pr-8 pl-3 text-sm font-medium outline-none focus-visible:ring-2"
        >
          {options.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2" />
      </div>

      <Button
        variant="outline"
        size="icon"
        aria-label="Next month"
        disabled={!canGoNext}
        onClick={() => onChange(addMonths(value, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {value !== current && (
        <Button variant="ghost" size="sm" onClick={() => onChange(current)}>
          Today
        </Button>
      )}
    </div>
  );
}
