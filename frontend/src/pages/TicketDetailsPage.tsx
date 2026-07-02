import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CalendarDays,
  Clock3,
  Fingerprint,
  History,
  RefreshCw,
  ShieldCheck,
  Trash2,
  User,
  UserCog,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ConfirmationDialog,
  ErrorState,
  MetricCard,
  MetricCardSkeleton,
  PageHeader,
} from '@/components/shared';
import { PriorityBadge } from '@/components/shared/PriorityBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { cn } from '@/lib/utils';
import {
  deleteTicket,
  getTicket,
  getTicketComments,
  reanalyzeTicket,
  updateTicketStatus,
} from '@/features/tickets/api/tickets';
import type { TicketComment, TicketDetailDto } from '@/features/tickets/types';
import {
  formatBackendCategory,
  toBackendStatus,
  toUiPriority,
  toUiStatus,
} from '@/features/tickets/utils/normalization';
import { Skeleton } from '@/components/ui/skeleton';

export default function TicketDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reanalyzeOpen, setReanalyzeOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const ticketQuery = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getTicket(id ?? ''),
    enabled: Boolean(id),
  });

  const commentsQuery = useQuery({
    queryKey: ['ticket-comments', id],
    queryFn: () => getTicketComments(id ?? ''),
    enabled: Boolean(id),
  });

  const reanalyzeMutation = useMutation({
    mutationFn: () => reanalyzeTicket(id ?? ''),
    onSuccess: async (ticket) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
        queryClient.invalidateQueries({ queryKey: ['ticket-comments', id] }),
      ]);
      queryClient.setQueryData(['ticket', id], ticket);
      toast.success('Ticket reanalyzed successfully.');
      setReanalyzeOpen(false);
    },
    onError: () => {
      toast.error('We could not reanalyze this ticket. Please try again.');
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => updateTicketStatus(id ?? '', toBackendStatus('closed')),
    onSuccess: async (ticket) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
        queryClient.invalidateQueries({ queryKey: ['ticket-comments', id] }),
      ]);
      queryClient.setQueryData(['ticket', id], ticket);
      toast.success('Ticket closed successfully.');
      setCloseOpen(false);
    },
    onError: () => {
      toast.error('We could not close this ticket. Please try again.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTicket(id ?? ''),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ticket-list'] }),
        queryClient.removeQueries({ queryKey: ['ticket', id] }),
        queryClient.removeQueries({ queryKey: ['ticket-comments', id] }),
      ]);
      toast.success('Ticket deleted.');
      setDeleteOpen(false);
      navigate('/tickets');
    },
    onError: () => {
      toast.error('We could not delete this ticket. Please try again.');
    },
  });

  const ticket = ticketQuery.data;
  const comments = commentsQuery.data ?? [];
  const isLoading = ticketQuery.isLoading || commentsQuery.isLoading;
  const isError = ticketQuery.isError;

  const timeline = useMemo(() => buildTimeline(ticket, comments), [ticket, comments]);

  if (!id) {
    return (
      <ErrorState
        title="Ticket not found"
        message="The ticket identifier is missing from the route."
        onRetry={() => navigate('/tickets')}
      />
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Unable to load ticket"
        message="We couldn’t load the ticket details right now. Please try again."
        onRetry={() => ticketQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isLoading ? `Ticket #${id}` : `Ticket #${ticket?.ticket_no ?? id}`}
        description="Review the full case record, timeline, and AI guidance."
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Tickets', href: '/tickets' },
          { label: `Ticket #${id}` },
        ]}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/tickets">
                <ArrowLeft className="size-4" />
                Back to Tickets
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => setReanalyzeOpen(true)}
              disabled={reanalyzeMutation.isPending || isLoading}
            >
              <RefreshCw className={cn('size-4', reanalyzeMutation.isPending && 'animate-spin')} />
              Reanalyze
            </Button>
            <Button
              variant="outline"
              onClick={() => setCloseOpen(true)}
              disabled={closeMutation.isPending || isLoading || ticket?.status === 'Closed'}
            >
              <ShieldCheck className="size-4" />
              Close Ticket
            </Button>
            <Button
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={deleteMutation.isPending || isLoading}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </>
        }
      />

      {isLoading ? <TicketDetailsSkeleton /> : ticket && <TicketDetailsContent ticket={ticket} comments={comments} timeline={timeline} />}

      <ConfirmationDialog
        open={reanalyzeOpen}
        onOpenChange={setReanalyzeOpen}
        title="Reanalyze ticket?"
        description="This will re-run the AI classifier and update the suggested category, priority, and SLA fields."
        confirmLabel="Reanalyze"
        onConfirm={async () => {
          await reanalyzeMutation.mutateAsync();
        }}
      />
      <ConfirmationDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Close ticket?"
        description="This will mark the ticket as closed and stamp the close time on the record."
        confirmLabel="Close Ticket"
        onConfirm={async () => {
          await closeMutation.mutateAsync();
        }}
      />
      <ConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete ticket?"
        description="This action cannot be undone. The ticket and its related data will be removed."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          await deleteMutation.mutateAsync();
        }}
      />
    </div>
  );
}

function TicketDetailsContent({
  ticket,
  comments,
  timeline,
}: {
  ticket: TicketDetailDto;
  comments: TicketComment[];
  timeline: TimelineEvent[];
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={toUiStatus(ticket.status)} />
                  <PriorityBadge priority={toUiPriority(ticket.priority)} />
                  {ticket.sla_status && <Badge variant="secondary">{ticket.sla_status}</Badge>}
                </div>
                <CardTitle className="text-2xl">{ticket.title}</CardTitle>
                <p className="max-w-3xl text-sm text-muted-foreground">{ticket.content}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline" className="gap-1.5">
                  <Fingerprint className="size-3.5" />
                  {ticket.ticket_no}
                </Badge>
                <Badge variant="outline" className="gap-1.5">
                  <User className="size-3.5" />
                  {ticket.author}
                </Badge>
                <Badge variant="outline">{ticket.author_email}</Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversation & Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {timeline.map((event) => (
              <div key={event.id} className="flex gap-4 rounded-xl border border-border p-4">
                <div
                  className={cn(
                    'mt-1 flex size-9 shrink-0 items-center justify-center rounded-full',
                    event.kind === 'system'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {event.kind === 'system' ? <Bot className="size-4" /> : <UserCog className="size-4" />}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{event.title}</p>
                    <span className="text-xs text-muted-foreground">{formatDateTime(event.timestamp)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{event.body}</p>
                </div>
              </div>
            ))}

            {comments.length > 0 && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <History className="size-4 text-muted-foreground" />
                  Comments
                </div>
                {comments.map((comment) => (
                  <div key={comment.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-foreground">{comment.author_name}</span>
                      <span className="text-muted-foreground">{formatDateTime(comment.created_at)}</span>
                      {comment.is_system ? <Badge variant="secondary">System</Badge> : null}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{comment.message}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MetricCard
            title="SLA Status"
            value={ticket.sla_status ?? 'Unknown'}
            icon={<Clock3 className="size-4" />}
            description={ticket.due_by ? `Due ${formatDateTime(ticket.due_by)}` : 'No due date assigned'}
          />
          <MetricCard
            title="AI Confidence"
            value={ticket.ai_confidence !== null ? `${ticket.ai_confidence}%` : 'n/a'}
            icon={<ShieldCheck className="size-4" />}
            description={ticket.ai_summary ? 'Classifier summary available' : 'No summary available'}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ticket Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <DetailRow icon={<CalendarDays className="size-4" />} label="Created" value={formatDateTime(ticket.created_on)} />
            <DetailRow icon={<Clock3 className="size-4" />} label="Age" value={`${ticket.age} days`} />
            <DetailRow icon={<User className="size-4" />} label="Department" value={ticket.department} />
            <DetailRow icon={<User className="size-4" />} label="Requester Email" value={ticket.author_email} />
            <DetailRow icon={<UserCog className="size-4" />} label="Assigned Engineer" value={ticket.assigned_engineer ?? 'Unassigned'} />
            <DetailRow icon={<UserCog className="size-4" />} label="Assigned Team" value={ticket.assigned_team ?? 'Unassigned'} />
            <DetailRow icon={<AlertTriangle className="size-4" />} label="Severity" value={ticket.severity} />
            <DetailRow icon={<ShieldCheck className="size-4" />} label="Technology / App" value={ticket.technology_app_item} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <DetailRow label="Suggested Category" value={formatBackendCategory(ticket.category)} />
            <DetailRow label="Suggested Priority" value={ticket.priority ?? 'Unknown'} />
            <DetailRow label="Difficulty" value={ticket.difficulty ?? 'Unknown'} />
            <DetailRow label="Confidence" value={ticket.ai_confidence !== null ? `${ticket.ai_confidence}%` : 'n/a'} />
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Summary</p>
              <p className="mt-2 text-sm text-foreground">
                {ticket.ai_summary ?? 'No AI summary is available for this ticket yet.'}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommended Steps</p>
              {ticket.ai_recommended_steps && ticket.ai_recommended_steps.length > 0 ? (
                <ol className="mt-3 space-y-2 pl-5 text-sm text-foreground list-decimal">
                  {ticket.ai_recommended_steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No recommended steps available.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TicketDetailsSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>
        <Card>
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-10/12" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon?: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-right font-medium text-foreground">{value}</div>
    </div>
  );
}

type TimelineEvent = {
  id: string;
  kind: 'system' | 'comment';
  title: string;
  body: string;
  timestamp: string;
};

function buildTimeline(ticket?: TicketDetailDto, comments: TicketComment[] = []): TimelineEvent[] {
  if (!ticket) return [];

  const events: TimelineEvent[] = [
    {
      id: `created-${ticket.ticket_no}`,
      kind: 'system',
      title: 'Ticket created',
      body: `Submitted by ${ticket.author} for ${ticket.technology_app_item}.`,
      timestamp: ticket.created_on,
    },
  ];

  if (ticket.ticket_start_date) {
    events.push({
      id: `started-${ticket.ticket_no}`,
      kind: 'system',
      title: 'Work started',
      body: ticket.assigned_engineer
        ? `Assigned engineer ${ticket.assigned_engineer} began work on the ticket.`
        : 'Work began on this ticket.',
      timestamp: ticket.ticket_start_date,
    });
  }

  comments.forEach((comment) => {
    events.push({
      id: `comment-${comment.id}`,
      kind: comment.is_system ? 'system' : 'comment',
      title: comment.is_system ? 'System note' : comment.author_name,
      body: comment.message,
      timestamp: comment.created_at,
    });
  });

  if (ticket.ticket_closed_date) {
    events.push({
      id: `closed-${ticket.ticket_no}`,
      kind: 'system',
      title: 'Ticket closed',
      body: ticket.closed_ticket ? `Closed by ${ticket.closed_ticket}.` : 'The ticket was closed.',
      timestamp: ticket.ticket_closed_date,
    });
  }

  return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
