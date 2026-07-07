import { Menu, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/providers/ThemeProvider';
import { useSidebar } from './SidebarContext';
import { UserAvatar } from '@/components/UserAvatar';

export function Topbar() {
  const { theme, toggleTheme } = useTheme();
  const { toggle, viewport } = useSidebar();

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-border bg-background/95 px-4 backdrop-blur-sm supports-backdrop-filter:bg-background/60">
      {/* Left section */}
      <div className="flex items-center gap-2">
        {/* Hamburger: visible on mobile and tablet */}
        {viewport !== 'desktop' && (
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle navigation">
            <Menu className="size-5" />
          </Button>
        )}
        {/* Desktop: sidebar toggle */}
        {viewport === 'desktop' && (
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle sidebar">
            <Menu className="size-5" />
          </Button>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
        </Button>
        
        <UserAvatar />
      </div>
    </header>
  );
}

