import { useParams } from 'react-router-dom';
import { FileText } from 'lucide-react';

export default function TicketDetailsPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="size-6 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Ticket #{id}</h1>
          <p className="text-sm text-muted-foreground">Ticket details and conversation</p>
        </div>
      </div>

      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">Ticket details will be built in Milestone 4</p>
      </div>
    </div>
  );
}
