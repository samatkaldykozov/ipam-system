import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { getNetworkCapacity } from '@/lib/cidr-utils';

interface NetworkUtilizationProps {
  cidr: string;
  childCount: number;
  ipAddressCount: number;
  className?: string;
}

// Address-space usage for a single network. Only meaningful for a leaf
// network (no children) — a network that's been subnetted further doesn't
// have individually assignable addresses of its own, since that space now
// belongs to its children instead, so showing a used/free count for it
// would be misleading either way.
export function NetworkUtilization({
  cidr,
  childCount,
  ipAddressCount,
  className,
}: NetworkUtilizationProps) {
  if (childCount > 0) {
    return (
      <span className={cn('text-sm text-muted-foreground', className)}>
        Subnetted ({childCount})
      </span>
    );
  }

  const capacity = getNetworkCapacity(cidr);
  if (capacity === null || capacity <= 0) {
    return (
      <span className={cn('text-sm text-muted-foreground', className)}>—</span>
    );
  }

  const used = Math.min(ipAddressCount, capacity);
  const free = Math.max(capacity - ipAddressCount, 0);
  const percent = Math.min(100, Math.round((ipAddressCount / capacity) * 100));

  return (
    <div className={cn('min-w-[140px] space-y-1', className)}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {used.toLocaleString()} / {capacity.toLocaleString()} used
        </span>
        <span>{free.toLocaleString()} free</span>
      </div>
      <Progress value={percent} className="h-1.5" />
    </div>
  );
}
