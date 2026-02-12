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

const priorityGradient: Record<string, string> = {
  high: 'from-[hsl(0,84%,60%)] to-[hsl(340,100%,55%)]',
  medium: 'from-[hsl(43,96%,56%)] to-[hsl(25,95%,58%)]',
  low: 'from-[hsl(160,84%,39%)] to-[hsl(190,95%,50%)]',
};

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };

const NudgesCard = ({ nudges }: NudgesCardProps) => {
  const active = nudges.filter(n => n.enabled);

  return (
    <div className="metric-card card-shimmer space-y-4 relative overflow-hidden">
      <div className="flex items-center justify-between relative">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nhắc Nhở Thói Quen</h3>
        <span className="text-[10px] text-muted-foreground font-mono">{active.length} đang bật</span>
      </div>

      <div className="space-y-2.5 relative">
        {active.map((nudge, i) => {
          const Icon = iconMap[nudge.type] || Heart;
          const gradient = priorityGradient[nudge.priority] || priorityGradient.low;
          return (
            <motion.div
              key={nudge.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring, delay: i * 0.06 }}
              className="flex items-start gap-3 bg-secondary/15 rounded-xl p-3.5 border border-border/20 relative overflow-hidden"
            >
              {/* Gradient left accent */}
              <div className={`absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b ${gradient}`} />
              
              <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0 ml-2" />
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
