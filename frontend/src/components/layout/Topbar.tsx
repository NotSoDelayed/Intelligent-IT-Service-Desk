import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useSidebar } from './SidebarContext';

export function Topbar() {
  const { theme, toggleTheme } = useTheme();
  const { toggle } = useSidebar();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const userInitial = user?.name?.charAt(0).toUpperCase() ?? 'U';

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-border bg-background/95 px-4 backdrop-blur-sm supports-backdrop-filter:bg-background/60">
      {/* Left section */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle navigation">
          <Menu className="size-5" />
        </Button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right section */}
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
        </Button>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="ml-2 flex size-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground transition-opacity hover:opacity-80"
              aria-label="User menu"
            >
              {userInitial}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{user?.name}</span>
                <span className="text-xs text-muted-foreground">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
