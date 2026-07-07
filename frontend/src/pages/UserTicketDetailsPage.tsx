import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AppWindow,
  ArrowLeft,
  Bot,
  CalendarDays,
  History,
  Lightbulb,
  ShieldCheck,
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
  PageHeader,
} from '@/components/shared';
import { PriorityBadge } from '@/components/shared/PriorityBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { cn } from '@/lib/utils';
import {
  getTicket,
  getTicketComments,
  updateTicketStatus,
  addTicketComment,
} from '@/features/tickets/api/tickets';
import type { TicketComment, TicketDetailDto } from '@/features/tickets/types';
import {
  toBackendStatus,
  toUiPriority,
  toUiStatus,
} from '@/features/tickets/utils/normalization';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

export default function UserTicketDetailsPage({ refreshInterval = 5000 }: { refreshInterval?: number }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [closeOpen, setCloseOpen] = useState(false);

  const ticketQuery = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getTicket(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      return query.state.data && !query.state.data.category ? refreshInterval : false;
    }
  });

  const commentsQuery = useQuery({
    queryKey: ['ticket-comments', id],
    queryFn: () => getTicketComments(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: () => {
      const t = queryClient.getQueryData<TicketDetailDto>(['ticket', id]);
      return t && !t.category ? refreshInterval : false;
    }
  });

  const previousCategory = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (previousCategory.current === null && ticketQuery.data?.category) {
      queryClient.invalidateQueries({ queryKey: ['ticket-comments', id] });
    }
    previousCategory.current = ticketQuery.data?.category;
  }, [ticketQuery.data?.category, queryClient, id]);



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



  const addCommentMutation = useMutation({
    mutationFn: (message: string) => addTicketComment(id ?? '', { message }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ticket-comments', id] });
      toast.success('Comment added successfully.');
    },
    onError: () => {
      toast.error('We could not add your comment. Please try again.');
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
            {ticket?.status !== 'Closed' && (
              <Button
                variant="outline"
                onClick={() => setCloseOpen(true)}
                disabled={closeMutation.isPending || isLoading}
              >
                <ShieldCheck className="size-4" />
                Close Ticket
              </Button>
            )}
          </>
        }
      />

      {isLoading ? <TicketDetailsSkeleton /> : ticket && (
        <TicketDetailsContent
          ticket={ticket}
          timeline={timeline}
          onAddComment={(msg) => addCommentMutation.mutateAsync(msg)}
          isAddingComment={addCommentMutation.isPending}
        />
      )}

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
    </div>
  );
}

function TicketDetailsContent({
  ticket,
  timeline,
  onAddComment,
  isAddingComment,
}: {
  ticket: TicketDetailDto;
  timeline: TimelineEvent[];
  onAddComment: (msg: string) => Promise<any>;
  isAddingComment: boolean;
}) {
  const [newComment, setNewComment] = useState('');

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      await onAddComment(newComment);
      setNewComment('');
    } catch {
      // Error is handled in the mutation
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="space-y-4 p-6">
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
                  <User className="size-3.5" />
                  {ticket.author}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="p-6">
            <CardTitle>Conversation & Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6 pt-0">
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-2">
              <Textarea
                placeholder="Type your comment here..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                disabled={isAddingComment}
                className="min-h-[100px] resize-none bg-background"
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || isAddingComment}
                >
                  Add Comment
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm font-medium text-foreground pt-2">
              <History className="size-4 text-muted-foreground" />
              Activity History
            </div>

            <div className="flex flex-col gap-2">
              {timeline.map((event) => (
                <div key={event.id} className="flex gap-4 rounded-xl border border-border p-2">
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
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm font-medium text-foreground">{event.title}</p>
                      <span className="text-xs text-muted-foreground">{formatDateTime(event.timestamp)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{event.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="p-6">
            <CardTitle>Ticket Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm p-6 pt-0">
            <DetailRow icon={<CalendarDays className="size-4" />} label="Created" value={formatDateTime(ticket.created_on)} />
            <DetailRow icon={<User className="size-4" />} label="Requester" value={ticket.author} />
            <DetailRow icon={<UserCog className="size-4" />} label="Assigned Engineer" value={ticket.assigned_engineer ?? 'Unassigned'} />
            <DetailRow icon={<AppWindow className="size-4" />} label="Technology / App" value={ticket.technology_app_item || 'Unknown'} />
            <DetailRow icon={<ShieldCheck className="size-4" />} label="AI Confidence" value={ticket.ai_confidence_level ? ticket.ai_confidence_level : 'n/a'} />
          </CardContent>
        </Card>

        {(ticket.self_help_note || (ticket.user_self_help_steps && ticket.user_self_help_steps.length > 0)) && (
          <Card>
            <CardHeader className="p-6">
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="size-4 text-muted-foreground" />
                Self Help Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm p-6 pt-0">
              {ticket.self_help_note && <p className="text-muted-foreground">{ticket.self_help_note}</p>}
              {ticket.user_self_help_steps && ticket.user_self_help_steps.length > 0 && (
                <ol className="mt-3 space-y-2 pl-5 text-foreground list-decimal">
                  {ticket.user_self_help_steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        )}
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
        <Card>
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-10/12" />
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
      body: `Submitted by ${ticket.author}.`,
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
      title: comment.is_system ? 'System' : comment.author_name,
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
