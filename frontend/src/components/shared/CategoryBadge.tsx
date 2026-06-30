import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TicketCategory } from '@/types/ticket';

const categoryConfig: Record<TicketCategory, { label: string }> = {
  hardware: { label: 'Hardware' },
  software: { label: 'Software' },
  network: { label: 'Network' },
  security: { label: 'Security' },
  access: { label: 'Access' },
  email: { label: 'Email' },
  other: { label: 'Other' },
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
