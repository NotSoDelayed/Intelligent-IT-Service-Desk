import { PageHeader } from '@/components/shared';

export default function MyTicketsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="My Tickets"
        description="View and manage your support tickets"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'My Tickets' }]}
      />

      <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-border py-24">
        <p className="text-sm text-muted-foreground">
          Ticket list will be implemented in a future milestone.
        </p>
      </div>
    </div>
  );
}
