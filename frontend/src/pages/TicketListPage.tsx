import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpDown,
  ClipboardList,
  Clock3,
  ChevronDown,
  TicketCheck,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, EmptyState, FilterPanel, MetricCard, PageHeader, SearchBar } from '@/components/shared';
import { CategoryBadge } from '@/components/shared/CategoryBadge';
import { PriorityBadge } from '@/components/shared/PriorityBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { cn } from '@/lib/utils';
import type { Ticket, TicketCategory, TicketPriority, TicketStatus } from '@/types/ticket';

type SortKey = 'updatedAt' | 'createdAt' | 'priority' | 'status';

const tickets: Ticket[] = [];

const pageSize = 10;

const statusOptions: Array<{ label: string; value: TicketStatus | 'all' }> = [
  { label: 'Open', value: 'open' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' },
];

const priorityOptions: Array<{ label: string; value: TicketPriority | 'all' }> = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
];

const categoryOptions: Array<{ label: string; value: TicketCategory | 'all' }> = [
  { label: 'Hardware', value: 'hardware' },
  { label: 'Software', value: 'software' },
  { label: 'Network', value: 'network' },
  { label: 'Security', value: 'security' },
  { label: 'Access', value: 'access' },
  { label: 'Email', value: 'email' },
  { label: 'Other', value: 'other' },
];

export default function TicketListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TicketStatus | 'all'>('all');
  const [priority, setPriority] = useState<TicketPriority | 'all'>('all');
  const [category, setCategory] = useState<TicketCategory | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('updatedAt');
  const [page, setPage] = useState(1);

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tickets
      .filter((ticket) => {
        const matchesSearch =
          !query ||
          ticket.id.toLowerCase().includes(query) ||
          ticket.subject.toLowerCase().includes(query) ||
          ticket.description.toLowerCase().includes(query);

        return (
          matchesSearch &&
          (status === 'all' || ticket.status === status) &&
          (priority === 'all' || ticket.priority === priority) &&
          (category === 'all' || ticket.category === category)
        );
      })
      .sort((a, b) => sortTickets(a, b, sort));
  }, [search, status, priority, category, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedTickets = filteredTickets.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const metrics = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((ticket) => ticket.status === 'open').length;
    const closed = tickets.filter((ticket) => ticket.status === 'closed').length;
    const highPriority = tickets.filter(
      (ticket) => ticket.priority === 'high' || ticket.priority === 'critical'
    ).length;
    const avgConfidence =
      tickets.reduce((sum, ticket) => sum + (ticket.aiConfidence ?? 0), 0) / tickets.length;

    return {
      total,
      open,
      closed,
      highPriority,
      avgConfidence,
    };
  }, []);

  const handleFilterReset = () => {
    setSearch('');
    setStatus('all');
    setPriority('all');
    setCategory('all');
    setSort('updatedAt');
    setPage(1);
  };

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        description="Monitor, triage, and manage support requests across the queue."
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Tickets' },
        ]}
        actions={
          <Button asChild>
            <Link to="/tickets/new">Create Ticket</Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total Tickets"
          value={metrics.total}
          icon={<ClipboardList className="size-4" />}
          description="Across the active queue"
        />
        <MetricCard
          title="Open Tickets"
          value={metrics.open}
          icon={<TicketCheck className="size-4" />}
          description="Waiting for action"
        />
        <MetricCard
          title="Closed Tickets"
          value={metrics.closed}
          icon={<Clock3 className="size-4" />}
          description="Completed work items"
        />
        <MetricCard
          title="High Priority"
          value={metrics.highPriority}
          icon={<TriangleAlert className="size-4" />}
          description={`AI confidence avg ${(metrics.avgConfidence * 100).toFixed(0)}%`}
        />
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 md:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchBar
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Search ticket ID, subject, or description..."
              className="w-full lg:max-w-md"
            />
            <div className="flex items-center gap-2 text-sm text-muted-foreground lg:ml-auto">
              <Users className="size-4" />
              <span>{filteredTickets.length} matching tickets</span>
            </div>
          </div>

          <FilterPanel
            filters={[
              {
                id: 'status',
                label: 'Status',
                options: statusOptions,
                value: status,
                onChange: (value) => {
                  setStatus(value as TicketStatus | 'all');
                  setPage(1);
                },
              },
              {
                id: 'priority',
                label: 'Priority',
                options: priorityOptions,
                value: priority,
                onChange: (value) => {
                  setPriority(value as TicketPriority | 'all');
                  setPage(1);
                },
              },
              {
                id: 'category',
                label: 'Category',
                options: categoryOptions,
                value: category,
                onChange: (value) => {
                  setCategory(value as TicketCategory | 'all');
                  setPage(1);
                },
              },
            ]}
            onReset={handleFilterReset}
            trailing={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <ArrowUpDown className="size-4" />
                    Sort: {sortLabel(sort)}
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48">
                  <DropdownMenuRadioGroup
                    value={sort}
                    onValueChange={(value) => setSort(value as SortKey)}
                  >
                    <DropdownMenuRadioItem value="updatedAt">Most recent</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="createdAt">Oldest first</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="priority">Priority</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="status">Status</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        </CardContent>
      </Card>

      {filteredTickets.length === 0 ? (
        <EmptyState
          title="No tickets found"
          description="Try changing your filters or search terms to see more results."
          action={
            <Button variant="outline" onClick={handleFilterReset}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              columns={[
                {
                  id: 'id',
                  header: 'Ticket ID',
                  cell: (row) => <span className="font-medium">{row.id}</span>,
                },
                {
                  id: 'subject',
                  header: 'Subject',
                  cell: (row) => (
                    <div className="max-w-[320px] space-y-1">
                      <p className="truncate font-medium text-foreground">{row.subject}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{row.description}</p>
                    </div>
                  ),
                  className: 'w-[360px]',
                },
                {
                  id: 'category',
                  header: 'Category',
                  cell: (row) => <CategoryBadge category={row.category} />,
                },
                {
                  id: 'priority',
                  header: 'Priority',
                  cell: (row) => <PriorityBadge priority={row.priority} />,
                },
                {
                  id: 'status',
                  header: 'Status',
                  cell: (row) => <StatusBadge status={row.status} />,
                },
                {
                  id: 'createdAt',
                  header: 'Created At',
                  cell: (row) => formatDate(row.createdAt),
                },
                {
                  id: 'updatedAt',
                  header: 'Updated At',
                  cell: (row) => formatDate(row.updatedAt),
                },
              ]}
              data={paginatedTickets}
              getRowKey={(row) => row.id}
              onRowClick={(row) => navigate(`/tickets/${row.id}`)}
              pagination={{
                page: currentPage,
                totalPages,
                totalItems: filteredTickets.length,
                pageSize,
                onPageChange: handlePageChange,
              }}
            />
          </div>

          <div className="grid gap-3 md:hidden">
            {paginatedTickets.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => navigate(`/tickets/${ticket.id}`)}
                className={cn(
                  'rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors',
                  'hover:border-primary/30 hover:bg-accent/40'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{ticket.id}</p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{ticket.subject}</p>
                  </div>
                  <StatusBadge status={ticket.status} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <CategoryBadge category={ticket.category} />
                  <PriorityBadge priority={ticket.priority} />
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDate(ticket.createdAt)}</span>
                  <span>{formatDate(ticket.updatedAt)}</span>
                </div>
              </button>
            ))}

            {totalPages > 1 && (
              <div className="pt-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))}
                  disabled={currentPage >= totalPages}
                >
                  Load more
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function sortTickets(a: Ticket, b: Ticket, sort: SortKey): number {
  switch (sort) {
    case 'createdAt':
    case 'updatedAt':
      return b[sort].localeCompare(a[sort]);
    case 'priority':
      return priorityRank(b.priority) - priorityRank(a.priority);
    case 'status':
      return statusRank(a.status) - statusRank(b.status);
    default:
      return b.updatedAt.localeCompare(a.updatedAt);
  }
}

function priorityRank(priority: TicketPriority): number {
  return {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  }[priority];
}

function statusRank(status: TicketStatus): number {
  return {
    open: 1,
    in_progress: 2,
    pending_user: 3,
    resolved: 4,
    closed: 5,
  }[status];
}

function sortLabel(sort: SortKey): string {
  return {
    updatedAt: 'Recent',
    createdAt: 'Oldest',
    priority: 'Priority',
    status: 'Status',
  }[sort];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}
