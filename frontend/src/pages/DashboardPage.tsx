import { LayoutDashboard } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="size-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your support operations</p>
        </div>
      </div>

      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">Dashboard will be built in Milestone 1</p>
      </div>
    </div>
  );
}
