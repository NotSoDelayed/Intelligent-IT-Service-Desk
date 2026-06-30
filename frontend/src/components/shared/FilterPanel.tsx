import type { ReactNode } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface FilterOption {
  label: string;
  value: string;
}

interface FilterField {
  id: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  /** The value that represents "no filter" — defaults to "all" */
  allValue?: string;
}

interface FilterPanelProps {
  filters: FilterField[];
  onReset?: () => void;
  className?: string;
  /** Extra content rendered after filters (e.g. search bar) */
  trailing?: ReactNode;
}

export function FilterPanel({ filters, onReset, className, trailing }: FilterPanelProps) {
  const hasActiveFilter = filters.some((f) => f.value !== (f.allValue ?? 'all'));

  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Filter className="size-4" />
        <span className="hidden sm:inline">Filters</span>
      </div>

      {filters.map((filter) => (
        <Select key={filter.id} value={filter.value} onValueChange={filter.onChange}>
          <SelectTrigger className="h-8 w-auto min-w-[120px] gap-1 text-xs">
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={filter.allValue ?? 'all'}>All {filter.label}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {hasActiveFilter && onReset && (
        <Button variant="ghost" size="xs" onClick={onReset}>
          <X data-icon="inline-start" className="size-3" />
          Clear
        </Button>
      )}

      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  );
}
