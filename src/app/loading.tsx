import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Table Skeleton */}
      <div className="space-y-3">
        {/* Table Header */}
        <div className="flex gap-2">
          <Skeleton className="h-12 w-40" />
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-24" />
          ))}
        </div>

        {/* Table Rows */}
        {Array.from({ length: 3 }).map((_, rowIdx) => (
          <div key={rowIdx} className="flex gap-2">
            <Skeleton className="h-16 w-40" />
            {Array.from({ length: 7 }).map((_, colIdx) => (
              <Skeleton key={colIdx} className="h-16 w-24" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
