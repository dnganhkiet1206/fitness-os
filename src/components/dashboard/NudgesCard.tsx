import type { HabitNudge } from '@/lib/types';
import { Moon, Droplets, Beef, Footprints, Heart } from 'lucide-react';

interface NudgesCardProps {
  nudges: HabitNudge[];
}

const iconMap: Record<string, React.ElementType> = {
  sleep: Moon,
  hydration: Droplets,
  protein: Beef,
  steps: Footprints,
  recovery: Heart,
};

const priorityBorder: Record<string, string> = {
  high: 'border-l-readiness-red',
  medium: 'border-l-readiness-yellow',
  low: 'border-l-primary',
};

const NudgesCard = ({ nudges }: NudgesCardProps) => {
  const active = nudges.filter(n => n.enabled);

  return (
    <div className="metric-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Habit Nudges</h3>
        <span className="text-[10px] text-muted-foreground">{active.length} active</span>
      </div>

      <div className="space-y-2">
        {active.map(nudge => {
          const Icon = iconMap[nudge.type] || Heart;
          return (
            <div
              key={nudge.id}
              className={`flex items-start gap-2.5 bg-secondary/50 rounded-lg p-3 border-l-2 ${priorityBorder[nudge.priority]}`}
            >
              <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm text-foreground leading-snug">{nudge.message}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Cap: {nudge.frequencyCapPerDay}x/day · {nudge.priority}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NudgesCard;
