import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TicketCategory } from '@/types/ticket';

const categoryConfig: Record<TicketCategory, { label: string }> = {
  category1: { label: 'Category 1' },
  category2: { label: 'Category 2' },
  category3: { label: 'Category 3' },
};

interface CategoryBadgeProps {
  category: TicketCategory;
  className?: string;
}

export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  const config = categoryConfig[category];

  return (
    <Badge variant="secondary" className={cn('text-xs font-medium', className)}>
      {config.label}
    </Badge>
  );
}
