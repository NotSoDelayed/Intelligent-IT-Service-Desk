import { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, LayoutDashboard, Settings, TicketCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from './SidebarContext';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Tickets', href: '/tickets', icon: TicketCheck },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'Settings', href: '/settings', icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href);
}

export function Sidebar() {
  const { isOpen, isCollapsed, viewport, close } = useSidebar();
  const { pathname } = useLocation();

  const handleNavClick = useCallback(() => {
    // Close drawer on mobile after navigation
    if (viewport === 'mobile') {
      close();
    }
  }, [viewport, close]);

  // Mobile: render as an overlay drawer
  if (viewport === 'mobile') {
    return (
      <>
        {/* Backdrop */}
        {isOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200"
            onClick={close}
            aria-hidden="true"
          />
        )}

        {/* Drawer */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 ease-out',
            isOpen ? 'translate-x-0' : '-translate-x-full'
          )}
          role="navigation"
          aria-label="Main navigation"
        >
          <SidebarHeader showClose onClose={close} />
          <NavList
            items={navItems}
            pathname={pathname}
            collapsed={false}
            onNavClick={handleNavClick}
          />
        </aside>
      </>
    );
  }

  // Desktop / Tablet: fixed sidebar
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 flex flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out',
        isCollapsed ? 'w-16' : 'w-64'
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      <SidebarHeader collapsed={isCollapsed} />
      <NavList
        items={navItems}
        pathname={pathname}
        collapsed={isCollapsed}
        onNavClick={handleNavClick}
      />
    </aside>
  );
}

// --- Sub-components ---

function SidebarHeader({
  collapsed = false,
  showClose = false,
  onClose,
}: {
  collapsed?: boolean;
  showClose?: boolean;
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        'flex h-14 shrink-0 items-center border-b border-sidebar-border px-4',
        collapsed ? 'justify-center' : 'justify-between'
      )}
    >
      {collapsed ? (
        <span className="text-lg font-bold text-sidebar-foreground">S</span>
      ) : (
        <Link to="/" className="flex items-center gap-2 text-sidebar-foreground">
          <TicketCheck className="size-5 text-primary" />
          <span className="text-base font-semibold tracking-tight">ServiceDesk AI</span>
        </Link>
      )}

      {showClose && (
        <button
          onClick={onClose}
          className="rounded-md p-1 text-sidebar-foreground hover:bg-sidebar-accent"
          aria-label="Close navigation"
        >
          <X className="size-5" />
        </button>
      )}
    </div>
  );
}

function NavList({
  items,
  pathname,
  collapsed,
  onNavClick,
}: {
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
  onNavClick: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                to={item.href}
                onClick={onNavClick}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                  collapsed ? 'justify-center' : 'gap-3',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <item.icon className="size-[18px] shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
