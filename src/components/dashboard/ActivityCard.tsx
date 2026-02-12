import { motion } from 'framer-motion';
import { DailyLog } from '@/lib/types';
import { Footprints, Timer, Flame } from 'lucide-react';

interface ActivityCardProps {
  log: DailyLog;
}

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };

const ActivityCard = ({ log }: ActivityCardProps) => {
  const a = log.activitySummary;

  const items = [
    { label: 'Bước chân', value: a.steps.toLocaleString(), icon: Footprints, color: 'text-readiness-green' },
    { label: 'Vận động', value: `${a.active_minutes}p`, icon: Timer, color: 'text-metric-blue' },
    { label: 'Đốt cháy', value: `${a.active_kcal}`, unit: 'kcal', icon: Flame, color: 'text-metric-orange' },
  ];

  return (
    <div className="metric-card space-y-4 relative">
      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Hoạt Động</h3>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...spring, delay: 0.1 + i * 0.08 }}
            className="flex flex-col items-center gap-1.5 bg-secondary/30 rounded-xl p-3.5"
          >
            <item.icon className={`w-5 h-5 ${item.color}`} />
            <span className="text-xl font-mono font-bold">{item.value}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default ActivityCard;
