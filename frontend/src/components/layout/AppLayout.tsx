import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { SidebarProvider, useSidebar } from './SidebarContext';
import { Topbar } from './Topbar';

function PageLoader() {
  return (
    <div className="flex h-48 items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
    </div>
  );
}

function LayoutContent() {
  const { isCollapsed, viewport } = useSidebar();

  // Calculate content margin based on sidebar state
  const contentMargin = viewport === 'mobile' ? 'ml-0' : isCollapsed ? 'ml-16' : 'ml-64';

  return (
    <div className="flex min-h-screen flex-col">
      <Sidebar />
      <div
        className={cn(
          'flex min-h-screen flex-1 flex-col transition-[margin-left] duration-200 ease-out',
          contentMargin
        )}
      >
        <Topbar />
        <main className="flex-1 p-4 md:p-6">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export function AppLayout() {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
}
