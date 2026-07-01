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

const tickets: Ticket[] = [
  {
    id: 'TCK-2026-0012',
    subject: 'VPN access drops after 15 minutes on corporate laptop',
    description:
      'Several users report the VPN session disconnecting shortly after login when using the standard corporate image.',
    category: 'network',
    priority: 'high',
    status: 'open',
    createdAt: '2026-06-30T09:15:00Z',
    updatedAt: '2026-07-01T01:20:00Z',
    suggestedCategory: 'network',
    suggestedPriority: 'high',
    aiConfidence: 0.91,
  },
  {
    id: 'TCK-2026-0011',
    subject: 'Shared mailbox permission missing for finance analyst',
    description:
      'The finance analyst cannot open the AP shared mailbox after the latest permission review.',
    category: 'email',
    priority: 'medium',
    status: 'in_progress',
    createdAt: '2026-06-30T04:40:00Z',
    updatedAt: '2026-07-01T00:05:00Z',
    suggestedCategory: 'email',
    suggestedPriority: 'medium',
    aiConfidence: 0.87,
  },
  {
    id: 'TCK-2026-0010',
    subject: 'Endpoint protection flagged browser add-on as risky',
    description:
      'CrowdStrike flagged a browser extension used by the support team and requested a review before approval.',
    category: 'security',
    priority: 'critical',
    status: 'resolved',
    createdAt: '2026-06-29T17:50:00Z',
    updatedAt: '2026-07-01T00:10:00Z',
    suggestedCategory: 'security',
    suggestedPriority: 'critical',
    aiConfidence: 0.95,
  },
  {
    id: 'TCK-2026-0009',
    subject: 'Printer queue stuck on warehouse floor 2',
    description:
      'Print jobs remain in the queue after the device rebooted following a power outage.',
    category: 'hardware',
    priority: 'medium',
    status: 'closed',
    createdAt: '2026-06-29T12:15:00Z',
    updatedAt: '2026-06-30T16:30:00Z',
    suggestedCategory: 'hardware',
    suggestedPriority: 'medium',
    aiConfidence: 0.84,
  },
  {
    id: 'TCK-2026-0008',
    subject: 'Software installation blocked for data science workstation',
    description:
      'User needs approval to install approved analytics tooling on a managed workstation.',
    category: 'software',
    priority: 'low',
    status: 'open',
    createdAt: '2026-06-28T08:10:00Z',
    updatedAt: '2026-06-29T11:20:00Z',
    suggestedCategory: 'software',
    suggestedPriority: 'low',
    aiConfidence: 0.77,
  },
  {
    id: 'TCK-2026-0007',
    subject: 'Access request for HR onboarding workspace',
    description:
      'New hire requires access to the HR onboarding workspace and document repository before start date.',
    category: 'access',
    priority: 'medium',
    status: 'open',
    createdAt: '2026-06-27T13:25:00Z',
    updatedAt: '2026-06-28T09:30:00Z',
    suggestedCategory: 'access',
    suggestedPriority: 'medium',
    aiConfidence: 0.82,
  },
  {
    id: 'TCK-2026-0006',
    subject: 'Conference room camera not detected in Teams',
    description:
      'The room camera appears offline in Teams Rooms after the latest firmware update.',
    category: 'hardware',
    priority: 'high',
    status: 'in_progress',
    createdAt: '2026-06-26T15:45:00Z',
    updatedAt: '2026-06-27T08:55:00Z',
    suggestedCategory: 'hardware',
    suggestedPriority: 'high',
    aiConfidence: 0.89,
  },
  {
    id: 'TCK-2026-0005',
    subject: 'Email signature template missing branding header',
    description:
      'A recent signature update removed the company logo from new Outlook signatures.',
    category: 'email',
    priority: 'low',
    status: 'closed',
    createdAt: '2026-06-25T10:05:00Z',
    updatedAt: '2026-06-25T18:30:00Z',
    suggestedCategory: 'email',
    suggestedPriority: 'low',
    aiConfidence: 0.74,
  },
  {
    id: 'TCK-2026-0004',
    subject: 'Firewall rule review needed for vendor connection',
    description:
      'Security team is reviewing an inbound rule request for a new ERP vendor integration.',
    category: 'security',
    priority: 'high',
    status: 'resolved',
    createdAt: '2026-06-24T11:40:00Z',
    updatedAt: '2026-06-26T07:15:00Z',
    suggestedCategory: 'security',
    suggestedPriority: 'high',
    aiConfidence: 0.93,
  },
  {
    id: 'TCK-2026-0003',
    subject: 'Unsupported browser warning on procurement portal',
    description:
      'Procurement portal shows unsupported browser warning on managed devices even though Chrome is installed.',
    category: 'software',
    priority: 'medium',
    status: 'open',
    createdAt: '2026-06-23T14:20:00Z',
    updatedAt: '2026-06-24T09:05:00Z',
    suggestedCategory: 'software',
    suggestedPriority: 'medium',
    aiConfidence: 0.8,
  },
  {
    id: 'TCK-2026-0002',
    subject: 'Unable to connect to finance shared drive from home network',
    description:
      'Remote finance users can access email but receive a timeout when mounting the shared drive over VPN.',
    category: 'network',
    priority: 'critical',
    status: 'closed',
    createdAt: '2026-06-22T18:00:00Z',
    updatedAt: '2026-06-23T05:45:00Z',
    suggestedCategory: 'network',
    suggestedPriority: 'critical',
    aiConfidence: 0.96,
  },
  {
    id: 'TCK-2026-0001',
    subject: 'Reset MFA enrollment for executive account',
    description:
      'Executive could not complete a new MFA enrollment after switching to a replacement phone.',
    category: 'access',
    priority: 'high',
    status: 'resolved',
    createdAt: '2026-06-21T07:30:00Z',
    updatedAt: '2026-06-21T10:05:00Z',
    suggestedCategory: 'access',
    suggestedPriority: 'high',
    aiConfidence: 0.9,
  },
];

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
    resolved: 3,
    closed: 4,
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
