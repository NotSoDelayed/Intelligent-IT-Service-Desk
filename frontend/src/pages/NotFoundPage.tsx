import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <div className="space-y-2">
        <h1 className="text-6xl font-bold tracking-tight text-foreground">404</h1>
        <p className="text-lg text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
      </div>

      <Button variant="outline" asChild>
        <Link to="/">
          <ArrowLeft data-icon="inline-start" className="size-4" />
          Back to Dashboard
        </Link>
      </Button>
    </div>
  );
}
