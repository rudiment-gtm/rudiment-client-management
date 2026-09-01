import { useAppStore } from '@/store/appStore';
import { cn } from '@/lib/utils';

interface RouteStopBadgeProps {
  accountId: string;
}

export default function RouteStopBadge({ accountId }: RouteStopBadgeProps) {
  const { routeStops, isRouteModeActive } = useAppStore();
  
  if (!isRouteModeActive) return null;
  
  const stopIndex = routeStops.findIndex((s) => s.kind === 'account' && s.id === accountId);
  if (stopIndex === -1) return null;
  
  return (
    <div className={cn(
      "absolute -top-2 -right-2 z-10",
      "w-6 h-6 rounded-full bg-primary text-primary-foreground",
      "flex items-center justify-center",
      "text-xs font-bold shadow-md",
      "animate-scale-in"
    )}>
      {stopIndex + 1}
    </div>
  );
}
