import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  AppWindow,
  ArrowLeft,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Fingerprint,
  History,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  User,
  UserCog,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  updateTicket,
  updateTicketStatus,
  addTicketComment,
} from '@/features/tickets/api/tickets';
import type { TicketComment, TicketDetailDto } from '@/features/tickets/types';
import {
  formatBackendCategory,
  toBackendStatus,
  toUiPriority,
  toUiStatus,
} from '@/features/tickets/utils/normalization';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

const REFRESH_INTERVAL_MS = 5000;

const ENGINEER_NAMES = [
  'Alex Tan (Network)',
  'Priya Nair (Hardware)',
  'Daniel Wong (Software)',
  'Farah Aziz (Access & Security)',
  'Marcus Lee (System)',
  'Nurul Hana (General)',
];

export default function TicketDetailsPage({ refreshInterval = REFRESH_INTERVAL_MS }: { refreshInterval?: number }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reanalyzeOpen, setReanalyzeOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [unresolveOpen, setUnresolveOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [unassignOpen, setUnassignOpen] = useState(false);
  const [assigneeName, setAssigneeName] = useState('');

  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        setIsAdmin(user.username?.startsWith('admin_') ?? false);
      }
    } catch {}
  }, []);

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

  const reanalyzeMutation = useMutation({
    mutationFn: () => reanalyzeTicket(id ?? ''),
    onSuccess: async (ticket) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
        queryClient.invalidateQueries({ queryKey: ['ticket-comments', id] }),
      ]);
      queryClient.setQueryData(['ticket', id], ticket);
      toast.success('Ticket re-analysis in progress...');
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

  const assignMutation = useMutation({
    mutationFn: (engineerName: string | null) => updateTicket(id ?? '', { assigned_engineer: engineerName }),
    onSuccess: async (ticket, engineerName) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
        queryClient.invalidateQueries({ queryKey: ['ticket-comments', id] }),
      ]);
      queryClient.setQueryData(['ticket', id], ticket);
      if (engineerName) {
        toast.success(`Ticket assigned to ${ticket.assigned_engineer}.`);
      } else {
        toast.success('Ticket unassigned.');
      }
      setAssignOpen(false);
      setUnassignOpen(false);
      setAssigneeName('');
    },
    onError: () => {
      toast.error('We could not update the assignment. Please try again.');
    },
  });

  const resolveMutation = useMutation({
    mutationFn: () => updateTicketStatus(id ?? '', toBackendStatus('resolved')),
    onSuccess: async (ticket) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
        queryClient.invalidateQueries({ queryKey: ['ticket-comments', id] }),
      ]);
      queryClient.setQueryData(['ticket', id], ticket);
      toast.success('Ticket marked as done.');
      setResolveOpen(false);
    },
    onError: () => {
      toast.error('We could not mark this ticket as done. Please try again.');
    },
  });

  const unresolveMutation = useMutation({
    mutationFn: () => updateTicketStatus(id ?? '', toBackendStatus('open')),
    onSuccess: async (ticket) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
        queryClient.invalidateQueries({ queryKey: ['ticket-comments', id] }),
      ]);
      queryClient.setQueryData(['ticket', id], ticket);
      toast.success('Ticket marked as undone.');
      setUnresolveOpen(false);
    },
    onError: () => {
      toast.error('We could not mark this ticket as undone. Please try again.');
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
            {isAdmin && ticket?.status !== 'Closed' && (
              <Button
                variant="outline"
                onClick={() => setReanalyzeOpen(true)}
                disabled={reanalyzeMutation.isPending || isLoading || (ticket ? !ticket.category : false)}
              >
                <RefreshCw className={cn('size-4', (reanalyzeMutation.isPending || (ticket && !ticket.category)) && 'animate-spin')} />
                Reanalyze
              </Button>
            )}
            {ticket?.status !== 'Resolved' && ticket?.status !== 'Closed' && (
              <>
                {ticket?.assigned_engineer ? (
                  isAdmin && (
                    <Button
                      variant="outline"
                      onClick={() => setUnassignOpen(true)}
                      disabled={assignMutation.isPending || isLoading}
                    >
                      <UserMinus className="size-4" />
                      Unassign
                    </Button>
                  )
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAssigneeName('');
                      setAssignOpen(true);
                    }}
                    disabled={assignMutation.isPending || isLoading}
                  >
                    <UserPlus className="size-4" />
                    Assign to...
                  </Button>
                )}
              </>
            )}
            {isAdmin && ticket?.status !== 'Closed' && (
              ticket?.status === 'Resolved' ? (
                <Button
                  variant="outline"
                  onClick={() => setUnresolveOpen(true)}
                  disabled={unresolveMutation.isPending || isLoading}
                >
                  <RotateCcw className={cn('size-4', unresolveMutation.isPending && 'animate-spin')} />
                  Mark as Undone
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setResolveOpen(true)}
                  disabled={resolveMutation.isPending || isLoading}
                >
                  <CheckCircle2 className="size-4" />
                  Mark as Done
                </Button>
              )
            )}
            {isAdmin && ticket?.status !== 'Closed' && (
              <Button
                variant="outline"
                onClick={() => setCloseOpen(true)}
                disabled={closeMutation.isPending || isLoading}
              >
                <ShieldCheck className="size-4" />
                Close Ticket
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
                disabled={deleteMutation.isPending || isLoading}
              >
                <Trash2 className="size-4" />
                Delete
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
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        title="Mark ticket as done?"
        description="This will mark the ticket as resolved."
        confirmLabel="Mark as Done"
        onConfirm={async () => {
          await resolveMutation.mutateAsync();
        }}
      />
      <ConfirmationDialog
        open={unresolveOpen}
        onOpenChange={setUnresolveOpen}
        title="Mark ticket as undone?"
        description="This will revert the ticket status back to open."
        confirmLabel="Mark as Undone"
        onConfirm={async () => {
          await unresolveMutation.mutateAsync();
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

      <ConfirmationDialog
        open={unassignOpen}
        onOpenChange={setUnassignOpen}
        title="Unassign ticket?"
        description={`This will remove ${ticket?.assigned_engineer} from this ticket.`}
        confirmLabel="Unassign"
        onConfirm={async () => {
          await assignMutation.mutateAsync(null);
        }}
      />

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent
          onKeyDown={(e) => {
            if (e.key === 'Enter' && assigneeName.trim() && !assignMutation.isPending) {
              e.preventDefault();
              assignMutation.mutate(assigneeName);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Assign Ticket</DialogTitle>
            <DialogDescription>
              Select the engineer you want to assign this ticket to.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="assignee">Engineer Username</Label>
              <Select
                value={assigneeName}
                onValueChange={setAssigneeName}
                disabled={assignMutation.isPending}
              >
                <SelectTrigger id="assignee" className="w-full">
                  <SelectValue placeholder="Select an engineer" />
                </SelectTrigger>
                <SelectContent>
                  {ENGINEER_NAMES.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assignMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => assignMutation.mutate(assigneeName)}
              disabled={!assigneeName.trim() || assignMutation.isPending}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MetricCard
            title="SLA Status"
            value={ticket.sla_status ?? 'Unknown'}
            icon={<Clock3 className="size-4" />}
            description={ticket.due_by ? `Due ${formatDateTime(ticket.due_by)}` : 'No due date assigned'}
          />
          <MetricCard
            title="AI Confidence"
            value={ticket.ai_confidence_level ? ticket.ai_confidence_level : 'n/a'}
            icon={<ShieldCheck className="size-4" />}
            description={ticket.ai_summary ? 'Classifier summary available' : 'No summary available'}
          />
        </div>

        <Card>
          <CardHeader className="p-6">
            <CardTitle>Ticket Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm p-6 pt-0">
            <DetailRow icon={<CalendarDays className="size-4" />} label="Created" value={formatDateTime(ticket.created_on)} />
            <DetailRow icon={<Clock3 className="size-4" />} label="Age" value={`${ticket.age} days`} />
            <DetailRow icon={<UserCog className="size-4" />} label="Assigned Engineer" value={ticket.assigned_engineer ?? 'Unassigned'} />
            <DetailRow icon={<UserCog className="size-4" />} label="Assigned Team" value={ticket.assigned_team ?? 'Unassigned'} />
            <DetailRow icon={<AlertTriangle className="size-4" />} label="Severity" value={ticket.severity} />
            <DetailRow icon={<AppWindow className="size-4" />} label="Technology / App" value={ticket.technology_app_item || 'Unknown'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-6">
            <CardTitle>AI Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm p-6 pt-0">
            <DetailRow label="Suggested Category" value={formatBackendCategory(ticket.category)} />
            <DetailRow label="Suggested Priority" value={ticket.priority ?? 'Unknown'} />
            <DetailRow label="Difficulty" value={ticket.difficulty ?? 'Unknown'} />
            <DetailRow label="Confidence" value={ticket.ai_confidence_level ? ticket.ai_confidence_level : 'n/a'} />
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
