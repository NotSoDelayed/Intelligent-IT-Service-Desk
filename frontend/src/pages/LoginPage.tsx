import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, LogIn } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { useAuth } from '@/providers/AuthProvider';
import { mockLogin } from '@/services/auth';

export default function LoginPage() {
  const { isAuthenticated, login, clearSessionExpired } = useAuth();
  const [searchParams] = useSearchParams();

  const returnTo = searchParams.get('returnTo') || '/';
  const isExpired = searchParams.get('expired') === '1';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Already logged in — redirect away
  if (isAuthenticated) {
    return <Navigate to={returnTo} replace />;
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setLoading(true);

    // Simulate network delay
    setTimeout(() => {
      const user = mockLogin(username.trim(), password);
      clearSessionExpired();
      login(user);
      // Navigation happens via the isAuthenticated check above on re-render
      setLoading(false);
    }, 600);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/40 px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Branding */}
        <div className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground text-lg font-bold">
            S
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Intelligent Service Desk</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        {/* Session expired banner */}
        {isExpired && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertCircle className="size-4 shrink-0" />
            <span>Your session has expired. Please sign in again.</span>
          </div>
        )}

        {/* Login form */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Sign In</CardTitle>
            <CardDescription>Enter your credentials to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <LoadingButton
                type="submit"
                className="w-full"
                loading={loading}
                loadingText="Signing in..."
              >
                <LogIn data-icon="inline-start" className="size-4" />
                Sign In
              </LoadingButton>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          TEMPORARY: Usernames starting with &quot;admin&quot; sign in as administrators.
        </p>
      </div>
    </div>
  );
}
