import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { statusConfig } from '@/types/account';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function MapLegend() {
  const statusEntries = Object.entries(statusConfig);

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              aria-label="Legend"
              className="h-9 w-9 rounded-md bg-background/90 backdrop-blur-sm shadow-lg border inline-flex items-center justify-center hover:bg-background transition"
            >
              <Info className="h-4 w-4" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={4}>Legend</TooltipContent>
      </Tooltip>
      <PopoverContent side="left" align="start" sideOffset={8} className="w-48 p-2">
        <div className="text-xs font-medium px-1 pb-1.5">Key</div>
        <ul className="space-y-1">
          {statusEntries.map(([status, config]) => (
            <li key={status} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className="inline-block w-3 h-3 rounded-full border border-white/70 shadow-sm shrink-0"
                style={{ backgroundColor: config.color }}
              />
              <span className="text-foreground truncate">{config.label}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
