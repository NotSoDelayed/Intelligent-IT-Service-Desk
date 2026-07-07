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
import { useQuery } from '@tanstack/react-query';
import { listTickets } from '@/features/tickets/api/tickets';
import {
  toBackendStatus,
  toBackendPriority,
  toBackendCategory,
  toUiCategory,
  toUiPriority,
  toUiStatus,
} from '@/features/tickets/utils/normalization';
import type { TicketCategory, TicketPriority, TicketStatus } from '@/types/ticket';
import type { TicketSort } from '@/features/tickets/types';

type SortKey = TicketSort;



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

export default function UserTicketListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TicketStatus | 'all'>('all');
  const [priority, setPriority] = useState<TicketPriority | 'all'>('all');
  const [category, setCategory] = useState<TicketCategory | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);

  const hasFilters = search.trim() !== '' || status !== 'all' || priority !== 'all' || category !== 'all';

  const { data } = useQuery({
    queryKey: ['ticket-list', { search, status, priority, category, sort, page }],
    queryFn: () => listTickets({
      search: search.trim() || undefined,
      status: status === 'all' ? undefined : toBackendStatus(status),
      priority: priority === 'all' ? undefined : toBackendPriority(priority),
      category: category === 'all' ? undefined : toBackendCategory(category),
      sort,
      page,
      limit: pageSize,
    }),
  });

  const filteredTickets = data?.tickets ?? [];
  const totalItems = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const currentPage = data?.page ?? 1;


  const handleFilterReset = () => {
    setSearch('');
    setStatus('all');
    setPriority('all');
    setCategory('all');
    setSort('newest');
    setPage(1);
  };

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Tickets"
        description="Monitor and track the support requests you have created."
        breadcrumbs={[
          { label: 'My Tickets' },
        ]}
        actions={
          <Button asChild>
            <Link to="/tickets/new">Create Ticket</Link>
          </Button>
        }
      />

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
              <span>{totalItems} matching tickets</span>
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
                    <DropdownMenuRadioItem value="newest">Most recent</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="queue">Queue (SLA Deadline)</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        </CardContent>
      </Card>

      {filteredTickets.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No tickets found" : "No tickets available"}
          description={
            hasFilters
              ? "Try changing your filters or search terms to see more results."
              : "Your queue is currently empty. New tickets will appear here."
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={handleFilterReset}>
                Clear filters
              </Button>
            ) : undefined
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
                  cell: (row) => <span className="font-medium">{row.ticket_no}</span>,
                },
                {
                  id: 'subject',
                  header: 'Subject',
                  cell: (row) => (
                    <div className="max-w-[320px] space-y-1">
                      <p className="truncate font-medium text-foreground">{row.title}</p>
                    </div>
                  ),
                  className: 'w-[360px]',
                },
                {
                  id: 'category',
                  header: 'Category',
                  cell: (row) => <CategoryBadge category={toUiCategory(row.category)} />,
                },
                {
                  id: 'priority',
                  header: 'Priority',
                  cell: (row) => <PriorityBadge priority={toUiPriority(row.priority)} />,
                },
                {
                  id: 'status',
                  header: 'Status',
                  cell: (row) => <StatusBadge status={toUiStatus(row.status)} />,
                },
                {
                  id: 'createdAt',
                  header: 'Created At',
                  cell: (row) => formatDate(row.created_on),
                },
              ]}
              data={filteredTickets}
              getRowKey={(row) => row.ticket_no}
              onRowClick={(row) => navigate(`/tickets/${row.ticket_no}`)}
              pagination={{
                page: currentPage,
                totalPages,
                totalItems: totalItems,
                pageSize,
                onPageChange: handlePageChange,
              }}
            />
          </div>

          <div className="grid gap-3 md:hidden">
            {filteredTickets.map((ticket) => (
              <button
                key={ticket.ticket_no}
                onClick={() => navigate(`/tickets/${ticket.ticket_no}`)}
                className={cn(
                  'rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors',
                  'hover:border-primary/30 hover:bg-accent/40'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{ticket.ticket_no}</p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{ticket.title}</p>
                  </div>
                  <StatusBadge status={toUiStatus(ticket.status)} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <CategoryBadge category={toUiCategory(ticket.category)} />
                  <PriorityBadge priority={toUiPriority(ticket.priority)} />
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDate(ticket.created_on)}</span>
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

function sortLabel(sort: SortKey): string {
  return {
    newest: 'Recent',
    queue: 'Queue',
  }[sort];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}
