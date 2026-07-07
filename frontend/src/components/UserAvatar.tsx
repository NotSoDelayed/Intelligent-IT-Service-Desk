import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import api from '@/services/api';

export function UserAvatar() {
  const [username, setUsername] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [roleLabel, setRoleLabel] = useState<string>('U');
  const [role, setRole] = useState<string>('user');
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUsername(user.username || '');
        setFullName(user.full_name || user.username || '');
        setRole(user.role || 'user');
        
        if (user.role === 'admin') {
          setRoleLabel('A');
        } else if (user.role === 'engineer') {
          setRoleLabel('E');
        } else {
          setRoleLabel('U');
        }
      } catch (e) {
        console.error('Failed to parse user', e);
      }
    }
  }, []);

  const handleLogout = async () => {
    try {
      // The backend in mock-auth state doesn't have a logout endpoint by default, 
      // but we can just clear local storage.
      await api.post('/auth/logout').catch(() => {});
    } catch (e) {
      console.error('Logout failed', e);
    }
    localStorage.removeItem('user');
    setShowLogoutDialog(false);
    navigate('/login');
  };

  if (!username) return null;

  const displayName = role === 'engineer' ? fullName : username;

  return (
    <>
      <TooltipProvider>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 focus-visible:ring-0 focus-visible:ring-offset-0 select-none">
                  <span className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                    {roleLabel}
                  </span>
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>{displayName}</p>
            </TooltipContent>
          </Tooltip>

          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{displayName}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {role === 'admin' ? 'Administrator' : role === 'engineer' ? 'Engineer' : 'User'}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowLogoutDialog(true)} className="text-destructive focus:text-destructive cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipProvider>

      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Logout</DialogTitle>
            <DialogDescription>
              Are you sure you want to log out? You will need to sign in again to access the dashboard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogoutDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              Log out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
