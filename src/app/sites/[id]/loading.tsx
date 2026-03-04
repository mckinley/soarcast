import { Skeleton } from '@/components/ui/skeleton';

export default function SiteDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Back button */}
      <Skeleton className="h-10 w-24" />

      {/* Site header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-5 w-96" />
          </div>
          <Skeleton className="h-10 w-10" />
        </div>

        {/* Map */}
        <Skeleton className="h-[300px] rounded-lg" />
      </div>

      {/* Daily scores grid */}
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-[200px] rounded-lg" />
          ))}
        </div>
      </div>

      {/* Hourly forecast */}
      <div className="space-y-4">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </div>
    </div>
  );
}
