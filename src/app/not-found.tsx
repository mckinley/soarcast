import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MapPinOff } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <MapPinOff className="h-16 w-16 text-muted-foreground mb-6" />
      <h1 className="text-3xl font-bold mb-2">Page Not Found</h1>
      <p className="text-muted-foreground mb-6 text-center max-w-md">
        The page you&apos;re looking for doesn&apos;t exist. It may have been moved or deleted.
      </p>
      <div className="flex gap-3">
        <Link href="/">
          <Button size="lg">Go to Dashboard</Button>
        </Link>
        <Link href="/sites">
          <Button variant="outline" size="lg">
            View Sites
          </Button>
        </Link>
      </div>
    </div>
  );
}
