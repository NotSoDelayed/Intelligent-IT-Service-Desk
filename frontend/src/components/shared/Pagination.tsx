import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Total item count — displayed as "Showing X of Y" */
  totalItems?: number;
  /** Items per page — used for "Showing X–Y of Z" display */
  pageSize?: number;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const rangeStart = totalItems && pageSize ? (page - 1) * pageSize + 1 : null;
  const rangeEnd = totalItems && pageSize ? Math.min(page * pageSize, totalItems) : null;

  return (
    <div className="flex items-center justify-between gap-4 pt-4">
      <div className="text-sm text-muted-foreground">
        {rangeStart !== null && rangeEnd !== null && totalItems ? (
          <>
            Showing {rangeStart}–{rangeEnd} of {totalItems}
          </>
        ) : (
          <>
            Page {page} of {totalPages}
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>

        {generatePageNumbers(page, totalPages).map((pageNum, i) =>
          pageNum === null ? (
            <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={pageNum}
              variant={pageNum === page ? 'default' : 'outline'}
              size="icon-sm"
              onClick={() => onPageChange(pageNum)}
              aria-label={`Page ${pageNum}`}
              aria-current={pageNum === page ? 'page' : undefined}
            >
              {pageNum}
            </Button>
          )
        )}

        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Generates an array of page numbers with ellipsis gaps.
 * Always shows first, last, and pages around current.
 * Example: [1, null, 4, 5, 6, null, 10]
 */
function generatePageNumbers(current: number, total: number): (number | null)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | null)[] = [];
  const showStart = Math.max(2, current - 1);
  const showEnd = Math.min(total - 1, current + 1);

  pages.push(1);

  if (showStart > 2) {
    pages.push(null);
  }

  for (let i = showStart; i <= showEnd; i++) {
    pages.push(i);
  }

  if (showEnd < total - 1) {
    pages.push(null);
  }

  pages.push(total);

  return pages;
}
