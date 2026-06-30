import { useCallback, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Pagination } from './Pagination';

// ─── Types ───────────────────────────────────────────

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: string;
  direction: SortDirection;
}

export interface DataTableColumn<T> {
  id: string;
  header: string;
  /** Render the cell value */
  cell: (row: T) => ReactNode;
  /** Whether this column is sortable */
  sortable?: boolean;
  /** Column width class, e.g. "w-[200px]" */
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /** Unique key extractor for each row */
  getRowKey: (row: T) => string;
  /** Current sort state */
  sort?: SortState;
  /** Called when a sortable column header is clicked */
  onSortChange?: (sort: SortState) => void;
  /** Row click handler */
  onRowClick?: (row: T) => void;
  /** Loading state — shows skeleton rows */
  loading?: boolean;
  /** Number of skeleton rows to show */
  skeletonRows?: number;
  /** Error state */
  error?: string | null;
  /** Retry callback for error state */
  onRetry?: () => void;
  /** Empty state configuration */
  emptyState?: {
    title: string;
    description?: string;
    icon?: ReactNode;
    action?: ReactNode;
  };
  /** Pagination */
  pagination?: {
    page: number;
    totalPages: number;
    totalItems?: number;
    pageSize?: number;
    onPageChange: (page: number) => void;
  };
}

// ─── Component ───────────────────────────────────────

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  sort,
  onSortChange,
  onRowClick,
  loading = false,
  skeletonRows = 5,
  error,
  onRetry,
  emptyState,
  pagination,
}: DataTableProps<T>) {
  const handleSort = useCallback(
    (columnId: string) => {
      if (!onSortChange) return;

      if (sort?.column === columnId) {
        onSortChange({
          column: columnId,
          direction: sort.direction === 'asc' ? 'desc' : 'asc',
        });
      } else {
        onSortChange({ column: columnId, direction: 'asc' });
      }
    },
    [sort, onSortChange]
  );

  // Error state
  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  // Empty state (only when not loading)
  if (!loading && data.length === 0 && emptyState) {
    return (
      <EmptyState
        title={emptyState.title}
        description={emptyState.description}
        icon={emptyState.icon}
        action={emptyState.action}
      />
    );
  }

  return (
    <div>
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead key={col.id} className={cn('h-10', col.className)}>
                  {col.sortable ? (
                    <button
                      className="inline-flex items-center gap-1 text-xs font-medium hover:text-foreground"
                      onClick={() => handleSort(col.id)}
                    >
                      {col.header}
                      <SortIcon columnId={col.id} sort={sort} />
                    </button>
                  ) : (
                    <span className="text-xs font-medium">{col.header}</span>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: skeletonRows }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    {columns.map((col) => (
                      <TableCell key={col.id}>
                        <Skeleton className="h-4 w-3/4" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : data.map((row) => (
                  <TableRow
                    key={getRowKey(row)}
                    className={cn(onRowClick && 'cursor-pointer')}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((col) => (
                      <TableCell key={col.id} className={col.className}>
                        {col.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={pagination.onPageChange}
        />
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────

function SortIcon({ columnId, sort }: { columnId: string; sort?: SortState }) {
  if (sort?.column !== columnId) {
    return <ArrowUpDown className="size-3 text-muted-foreground/50" />;
  }
  return sort.direction === 'asc' ? (
    <ArrowUp className="size-3" />
  ) : (
    <ArrowDown className="size-3" />
  );
}
