import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Moon, Sun } from 'lucide-react';
import api from '@/services/api';
import { useTheme } from '@/providers/ThemeProvider';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setLoading(true);
    try {
      const response = await api.post('/auth/login', { username: username.trim() });
      localStorage.setItem('user', JSON.stringify(response.data));
      navigate('/');
    } catch (error) {
      console.error('Login failed', error);
      // Fallback: manually set localStorage if backend is not running for demo purposes
      localStorage.setItem('user', JSON.stringify({
        username: username.trim(),
        role: username.startsWith('admin') ? 'admin' : username.startsWith('engineer') ? 'engineer' : 'user',
        full_name: username.trim()
      }));
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
        </Button>
      </div>

      <div className="bg-card text-card-foreground p-8 rounded-2xl shadow-xl w-full max-w-md border border-border">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center rotate-3">
            <LogIn className="w-8 h-8 text-primary-foreground -rotate-3" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center mb-2">
          Welcome to Service Desk
        </h1>
        <p className="text-muted-foreground text-center mb-8">
          Enter your username to continue
        </p>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. user_demo"
              className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
              required
            />
          </div>

          {/* <div>
            <label htmlFor="demo-select" className="block text-sm font-medium mb-2 text-muted-foreground">
              Demo Quick Select
            </label>
            <select
              id="demo-select"
              className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none cursor-pointer"
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  setUsername('');
                } else {
                  setUsername(val);
                }
              }}
              value={username ? (['user_demo', 'admin_1', 'engineer_network', 'engineer_hardware', 'engineer_software', 'engineer_access', 'engineer_system', 'engineer_general'].includes(username) ? username : '') : ''}
            >
              <option value="">*Manual input...</option>
              <option value="user_demo">user_demo</option>
              <option value="admin_1">admin_1</option>
              <option value="engineer_network">engineer_network</option>
              <option value="engineer_hardware">engineer_hardware</option>
              <option value="engineer_software">engineer_software</option>
              <option value="engineer_access">engineer_access</option>
              <option value="engineer_system">engineer_system</option>
              <option value="engineer_general">engineer_general</option>
            </select>
          </div> */}

          <Button
            type="submit"
            disabled={loading || !username.trim()}
            className="w-full py-6 text-base"
          >
            {loading ? 'Logging in...' : 'Sign In'}
          </Button>
        </form>

        {/* <div className="mt-8 pt-6 border-t border-border">
          <p className="text-sm text-muted-foreground text-center">
            <strong>Demo Accounts:</strong> Prefix username with <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">admin_</code> or <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">engineer_</code> for special roles.
          </p>
        </div> */}
      </div>
    </div>
  );
}
