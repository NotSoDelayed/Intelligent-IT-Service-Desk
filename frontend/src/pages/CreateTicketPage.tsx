import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import {
  AppWindow,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Lightbulb,
  PlusCircle,
  RotateCcw,
  ShieldCheck,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { LoadingButton, PageHeader } from '@/components/shared';
import { PriorityBadge } from '@/components/shared/PriorityBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { createTicket, getTicket } from '@/features/tickets/api/tickets';
import type { TicketCreatePayload, TicketDetailDto } from '@/features/tickets/types';
import { formatBackendCategory, toUiPriority, toUiStatus } from '@/features/tickets/utils/normalization';

type FormState = {
  name: string;
  title: string;
  content: string;
  user_priority: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const initialForm: FormState = {
  name: '',
  title: '',
  content: '',
  user_priority: '3',
};

const urgencyOptions = [
  { value: '1', label: '1 - Low', description: 'Minor issue or request' },
  { value: '2', label: '2 - Normal', description: 'Workaround available' },
  { value: '3', label: '3 - Moderate', description: 'Affects regular work' },
  { value: '4', label: '4 - High', description: 'Blocks important work' },
  { value: '5', label: '5 - Critical', description: 'Cannot work or service outage' },
];



function getInitialName(): string {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user.username) {
        return user.username
          .split('_')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
    }
  } catch { }
  return '';
}

export default function CreateTicketPage({ refreshInterval = 5000 }: { refreshInterval?: number }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => ({
    ...initialForm,
    name: getInitialName(),
  }));
  const [errors, setErrors] = useState<FormErrors>({});
  const [createdTicket, setCreatedTicket] = useState<TicketDetailDto | null>(null);

  const polledTicketQuery = useQuery({
    queryKey: ['ticket', createdTicket?.ticket_no],
    queryFn: () => getTicket(createdTicket?.ticket_no ?? ''),
    enabled: Boolean(createdTicket?.ticket_no),
    refetchInterval: (query) => {
      return query.state.data && !query.state.data.category ? refreshInterval : false;
    }
  });

  const ticketToDisplay = polledTicketQuery.data || createdTicket;

  const createMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: async (ticket) => {
      await queryClient.invalidateQueries({ queryKey: ['ticket-list'] });
      queryClient.setQueryData(['ticket', ticket.ticket_no], ticket);
      setCreatedTicket(ticket);
      toast.success(`Ticket ${ticket.ticket_no} created.`);
    },
    onError: (error: any) => {
      let errorMessage = 'We could not create the ticket. Please review the form and try again.';
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        if (Array.isArray(detail) && detail.length > 0 && detail[0].msg) {
          errorMessage = detail[0].msg.replace('Value error, ', '');
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        }
      }
      toast.error(errorMessage);
    },
  });

  const handleChange =
    (field: keyof FormState) =>
      (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm((current) => ({ ...current, [field]: event.target.value }));
        setErrors((current) => ({ ...current, [field]: undefined }));
      };

  const handleBlur = (field: keyof FormState) => () => {
    const nextErrors = validateForm(form);
    setErrors((current) => ({ ...current, [field]: nextErrors[field] }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateForm(form);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const payload: TicketCreatePayload = {
      name: form.name.trim(),
      title: form.title.trim(),
      content: form.content.trim(),
      user_priority: Number(form.user_priority),
    };

    await createMutation.mutateAsync(payload);
  };

  const resetForm = () => {
    setForm({
      ...initialForm,
      name: getInitialName(),
    });
    setErrors({});
    setCreatedTicket(null);
    createMutation.reset();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Ticket"
        description="Submit an issue for AI triage, routing, and SLA planning."
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Tickets', href: '/tickets' },
          { label: 'Create Ticket' },
        ]}
        actions={
          <Button variant="outline" asChild>
            <Link to="/tickets">Back to Tickets</Link>
          </Button>
        }
      />

      {createdTicket && ticketToDisplay ? (
        <TicketCreatedResult ticket={ticketToDisplay} form={form} onCreateAnother={resetForm} />
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pt-3">
                <CardTitle className="flex items-center justify-center gap-1 text-center">
                  <User className="size-6 text-muted-foreground" />
                  User Information
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 p-3 md:grid-cols-2">
                <FormField label="Full name" error={errors.name}>
                  <Input
                    value={form.name}
                    onChange={handleChange('name')}
                    onBlur={handleBlur('name')}
                    placeholder="John Doe"
                    autoComplete="name"
                    aria-invalid={Boolean(errors.name)}
                    disabled={createMutation.isPending}
                  />
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pt-3">
                <CardTitle className="flex items-center justify-center gap-1 text-center">
                  <ClipboardList className="size-6 text-muted-foreground" />
                  Issue Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-3">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Subject" error={errors.title}>
                    <Input
                      value={form.title}
                      onChange={handleChange('title')}
                      onBlur={handleBlur('title')}
                      placeholder="VPN disconnects during client calls"
                      aria-invalid={Boolean(errors.title)}
                      disabled={createMutation.isPending}
                    />
                  </FormField>
                </div>

                <FormField label="Description" error={errors.content}>
                  <div className="relative">
                    <Textarea
                      value={form.content}
                      onChange={handleChange('content')}
                      onBlur={handleBlur('content')}
                      placeholder="Briefly describe the issue with as much supporting evidence as possible (screenshot, error message, etc)"
                      className="min-h-36 pb-6"
                      aria-invalid={Boolean(errors.content)}
                      disabled={createMutation.isPending}
                    />
                    <div className={`absolute bottom-2 right-3 text-xs ${form.content.length < 50 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {form.content.length} / 50 min
                    </div>
                  </div>
                </FormField>

                <FormField label="Urgency" error={errors.user_priority}>
                  <Select
                    value={form.user_priority}
                    onValueChange={(value) => {
                      setForm((current) => ({ ...current, user_priority: value }));
                      setErrors((current) => ({ ...current, user_priority: undefined }));
                    }}
                    disabled={createMutation.isPending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select urgency" />
                    </SelectTrigger>
                    <SelectContent>
                      {urgencyOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <span>{option.label}</span>
                          <span className="text-muted-foreground">{option.description}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                {createMutation.isError && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    Ticket submission failed. Please check the details and try again.
                  </div>
                )}

                <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForm}
                    disabled={createMutation.isPending}
                  >
                    <RotateCcw className="size-4" />
                    Reset
                  </Button>
                  <LoadingButton
                    type="submit"
                    loading={createMutation.isPending}
                    loadingText="Submitting..."
                  >
                    <PlusCircle className="size-4" />
                    Submit Ticket
                  </LoadingButton>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card>
              <CardHeader className="pt-3 pl-3">
                <CardTitle className="flex items-center gap-2">
                  <Bot className="size-4 text-muted-foreground" />
                  AI Processing
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 text-sm text-muted-foreground">
                <p>The classifier will review the issue, estimate priority and difficulty, route the ticket, and calculate the SLA target.</p>
                <p>For easier issues, the response may also include Self-Diagnosis steps the requester can try while the ticket is tracked.</p>
              </CardContent>
            </Card>
          </aside>
        </form>
      )}
    </div>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function TicketCreatedResult({
  ticket,
  form,
  onCreateAnother,
}: {
  ticket: TicketDetailDto;
  form: FormState;
  onCreateAnother: () => void;
}) {
  const hasSelfHelp = Boolean(ticket.user_self_help_steps?.length || ticket.self_help_note);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="p-6">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
              Ticket Created
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-6 pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-2xl p-4">
                {ticket.ticket_no}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={toUiStatus(ticket.status)} />
              {ticket.priority && <PriorityBadge priority={toUiPriority(ticket.priority)} />}
              {ticket.sla_status && <Badge variant="secondary">{ticket.sla_status}</Badge>}
            </div>

            <div>
              <h2 className="text-xl font-semibold tracking-tight">Title: {ticket.title}</h2>
              {/* <p className="mt-1 text-sm text-muted-foreground">{ticket.ai_summary ?? ticket.content}</p> */}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <ResultItem label="Category" value={formatBackendCategory(ticket.category)} />
              <ResultItem label="Severity" value={ticket.severity} />
              <ResultItem label="Difficulty" value={ticket.difficulty ?? 'Unknown'} />
              <ResultItem label="Assigned Team" value={ticket.assigned_team ?? 'Unassigned'} />
              <ResultItem label="Assigned Engineer" value={ticket.assigned_engineer ?? 'Unassigned'} />
              <ResultItem
                label="AI Confidence"
                value={ticket.ai_confidence !== null ? `${ticket.ai_confidence}%` : 'n/a'}
              />
              <ResultItem label="Due By" value={ticket.due_by ? formatDateTime(ticket.due_by) : 'Not scheduled'} />
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
              <Button asChild>
                <Link to={`/tickets/${ticket.ticket_no}`}>
                  View Ticket
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button type="button" variant="outline" onClick={onCreateAnother}>
                <PlusCircle className="size-4" />
                Create Another
              </Button>
            </div>
          </CardContent>
        </Card>

        {hasSelfHelp && (
          <Card>
            <CardHeader className="p-6">
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="size-4 text-muted-foreground" />
                Self Help
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-6 pt-0">
              {ticket.self_help_note && <p className="text-sm text-muted-foreground">{ticket.self_help_note}</p>}
              {ticket.user_self_help_steps && ticket.user_self_help_steps.length > 0 && (
                <ol className="space-y-2 pl-5 text-sm text-foreground list-decimal">
                  {ticket.user_self_help_steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader className="p-6">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              Routing Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm p-6 pt-0">
            <ResultItem label="Requester" value={form.name} icon={<User className="size-4" />} />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function ResultItem({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function validateForm(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (form.name.trim().length < 2) {
    errors.name = 'Enter at least 2 characters.';
  }
  if (form.title.trim().length < 10) {
    errors.title = 'Enter at least 10 characters.';
  }
  if (form.content.trim().length < 50) {
    errors.content = 'Enter at least 50 characters.';
  }
  if (!['1', '2', '3', '4', '5'].includes(form.user_priority)) {
    errors.user_priority = 'Select an urgency level.';
  }

  return errors;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
