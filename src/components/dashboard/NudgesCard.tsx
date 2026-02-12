import { motion } from 'framer-motion';
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

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };

const NudgesCard = ({ nudges }: NudgesCardProps) => {
  const active = nudges.filter(n => n.enabled);

  return (
    <div className="metric-card space-y-4 relative">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nhắc Nhở Thói Quen</h3>
        <span className="text-[10px] text-muted-foreground">{active.length} đang bật</span>
      </div>

      <div className="space-y-2.5">
        {active.map((nudge, i) => {
          const Icon = iconMap[nudge.type] || Heart;
          return (
            <motion.div
              key={nudge.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring, delay: i * 0.06 }}
              className={`flex items-start gap-3 bg-secondary/30 rounded-xl p-3.5 border-l-2 ${priorityBorder[nudge.priority]}`}
            >
              <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm text-foreground leading-snug">{nudge.message}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Cap: {nudge.frequencyCapPerDay}x/day · {nudge.priority}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default NudgesCard;
