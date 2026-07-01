import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, TicketCheck, LayoutDashboard } from 'lucide-react';
import {
  CategoryBadge,
  DataTable,
  FilterPanel,
  MetricCard,
  MetricCardSkeleton,
  PageHeader,
  PriorityBadge,
  SearchBar,
  StatusBadge,
} from '@/components/shared';
import type { DataTableColumn } from '@/components/shared';
import type { Ticket, TicketCategory, TicketPriority, TicketStatus } from '@/types/ticket';

// ─── Mock data ───────────────────────────────────────

const mockTickets: Ticket[] = [
  {
    id: 'TK-1001',
    subject: 'VPN connection drops intermittently during video calls',
    description: 'Users report VPN dropping during Zoom meetings.',
    category: 'category1',
    priority: 'high',
    status: 'open',
    createdAt: '2026-06-28T09:15:00Z',
    updatedAt: '2026-06-30T14:22:00Z',
    suggestedCategory: 'category1',
    suggestedPriority: 'high',
    aiConfidence: 0.94,
  },
  {
    id: 'TK-1002',
    subject: 'Cannot access SharePoint after password reset',
    description: 'Access denied to SharePoint Online after credential update.',
    category: 'category2',
    priority: 'medium',
    status: 'in_progress',
    createdAt: '2026-06-29T11:30:00Z',
    updatedAt: '2026-06-30T10:45:00Z',
    suggestedCategory: 'category2',
    suggestedPriority: 'medium',
    aiConfidence: 0.87,
  },
  {
    id: 'TK-1003',
    subject: 'Laptop overheating and shutting down unexpectedly',
    description: 'ThinkPad X1 Carbon shuts down after 30 minutes of use.',
    category: 'category3',
    priority: 'critical',
    status: 'open',
    createdAt: '2026-06-30T08:00:00Z',
    updatedAt: '2026-06-30T08:00:00Z',
    suggestedCategory: 'category3',
    suggestedPriority: 'critical',
    aiConfidence: 0.91,
  },
  {
    id: 'TK-1004',
    subject: 'Outlook not syncing calendar events',
    description: 'Calendar events from shared mailbox not appearing in Outlook.',
    category: 'category1',
    priority: 'low',
    status: 'resolved',
    createdAt: '2026-06-25T16:00:00Z',
    updatedAt: '2026-06-29T09:30:00Z',
    suggestedCategory: 'category2',
    suggestedPriority: 'low',
    aiConfidence: 0.72,
  },
  {
    id: 'TK-1005',
    subject: 'Suspicious login attempt detected from unknown IP',
    description: 'Security alert triggered for admin account.',
    category: 'category2',
    priority: 'critical',
    status: 'in_progress',
    createdAt: '2026-06-30T06:45:00Z',
    updatedAt: '2026-06-30T13:00:00Z',
    suggestedCategory: 'category2',
    suggestedPriority: 'critical',
    aiConfidence: 0.98,
  },
];

const ticketColumns: DataTableColumn<Ticket>[] = [
  {
    id: 'id',
    header: 'ID',
    cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.id}</span>,
    className: 'w-[100px]',
    sortable: true,
  },
  {
    id: 'subject',
    header: 'Subject',
    cell: (row) => <span className="line-clamp-1 font-medium">{row.subject}</span>,
    sortable: true,
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
    sortable: true,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <StatusBadge status={row.status} />,
    sortable: true,
  },
];

const statusOptions = [
  { label: 'Open', value: 'open' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' },
];

const priorityOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
];

const categoryOptions = [
  { label: 'Category 1', value: 'category1' },
  { label: 'Category 2', value: 'category2' },
  { label: 'Category 3', value: 'category3' },
];

// ─── Component ───────────────────────────────────────

export default function DashboardPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const filteredTickets = mockTickets.filter((ticket) => {
    if (statusFilter !== 'all' && ticket.status !== (statusFilter as TicketStatus)) return false;
    if (priorityFilter !== 'all' && ticket.priority !== (priorityFilter as TicketPriority))
      return false;
    if (categoryFilter !== 'all' && ticket.category !== (categoryFilter as TicketCategory))
      return false;
    if (search && !ticket.subject.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Overview of your support operations"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Dashboard' }]}
        actions={
          <Link to="/tickets/new">
            <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              <Plus className="size-4" />
              Create Ticket
            </button>
          </Link>
        }
      />

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Tickets"
          value={156}
          icon={<TicketCheck className="size-5" />}
          trend={{ value: '+12%', positive: true }}
          description="vs last month"
        />
        <MetricCard
          title="Open Tickets"
          value={42}
          icon={<LayoutDashboard className="size-5" />}
          trend={{ value: '-5%', positive: true }}
          description="vs last month"
        />
        <MetricCard
          title="Critical"
          value={7}
          trend={{ value: '+3', positive: false }}
          description="needs attention"
        />
        <MetricCardSkeleton />
      </div>

      {/* Recent Tickets */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Recent Tickets</h2>

        <FilterPanel
          filters={[
            {
              id: 'status',
              label: 'Status',
              options: statusOptions,
              value: statusFilter,
              onChange: setStatusFilter,
            },
            {
              id: 'priority',
              label: 'Priority',
              options: priorityOptions,
              value: priorityFilter,
              onChange: setPriorityFilter,
            },
            {
              id: 'category',
              label: 'Category',
              options: categoryOptions,
              value: categoryFilter,
              onChange: setCategoryFilter,
            },
          ]}
          onReset={() => {
            setStatusFilter('all');
            setPriorityFilter('all');
            setCategoryFilter('all');
          }}
          trailing={
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search tickets..."
              className="w-64"
            />
          }
        />

        <DataTable
          columns={ticketColumns}
          data={filteredTickets}
          getRowKey={(row) => row.id}
          emptyState={{
            title: 'No tickets found',
            description: 'Try adjusting your filters or search terms.',
          }}
          pagination={{
            page: 1,
            totalPages: 3,
            totalItems: 15,
            pageSize: 5,
            onPageChange: () => {},
          }}
        />
      </div>
    </div>
  );
}
