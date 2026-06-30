import { TicketCheck } from 'lucide-react';

export default function TicketListPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <TicketCheck className="size-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
          <p className="text-sm text-muted-foreground">View and manage support tickets</p>
        </div>
      </div>

      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">Ticket list will be built in Milestone 3</p>
      </div>
    </div>
  );
}
