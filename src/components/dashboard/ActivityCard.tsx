import { motion } from 'framer-motion';
import { DailyLog } from '@/lib/types';
import ActivityRings from './ActivityRings';

interface ActivityCardProps {
  log: DailyLog;
}

const ActivityCard = ({ log }: ActivityCardProps) => {
  const a = log.activitySummary;

  return (
    <div className="metric-card relative overflow-hidden">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ background: 'radial-gradient(ellipse at top right, hsl(0 100% 60%), transparent 60%)' }} />
      
      <div className="relative space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Hoạt Động</h3>
        <ActivityRings
          move={{ current: a.active_kcal, target: 600 }}
          exercise={{ current: a.active_minutes, target: 30 }}
          stand={{ current: a.steps, target: 10000 }}
          size={160}
        />
      </div>
    </div>
  );
};

export default ActivityCard;
