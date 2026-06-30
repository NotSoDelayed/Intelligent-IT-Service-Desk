import { PlusCircle } from 'lucide-react';

export default function CreateTicketPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <PlusCircle className="size-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Create Ticket</h1>
          <p className="text-sm text-muted-foreground">Submit a new support request</p>
        </div>
      </div>

      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">
          Ticket creation form will be built in Milestone 5
        </p>
      </div>
    </div>
  );
}
