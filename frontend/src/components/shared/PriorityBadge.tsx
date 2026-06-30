import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TicketPriority } from '@/types/ticket';

const priorityConfig: Record<TicketPriority, { label: string; className: string }> = {
  low: {
    label: 'Low',
    className:
      'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-400 dark:border-slate-400/20',
  },
  medium: {
    label: 'Medium',
    className:
      'bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-400 dark:border-sky-400/20',
  },
  high: {
    label: 'High',
    className:
      'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-400 dark:border-orange-400/20',
  },
  critical: {
    label: 'Critical',
    className:
      'bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-400 dark:border-red-400/20',
  },
};

interface PriorityBadgeProps {
  priority: TicketPriority;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const config = priorityConfig[priority];

  return (
    <Badge variant="outline" className={cn('text-xs font-medium', config.className, className)}>
      {config.label}
    </Badge>
  );
}
