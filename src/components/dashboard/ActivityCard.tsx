import { DailyLog } from '@/lib/types';
import { Footprints, Timer, Flame } from 'lucide-react';

interface ActivityCardProps {
  log: DailyLog;
}

const ActivityCard = ({ log }: ActivityCardProps) => {
  const a = log.activitySummary;

  const items = [
    { label: 'Bước chân', value: a.steps.toLocaleString(), icon: Footprints, color: 'text-readiness-green' },
    { label: 'Vận động', value: `${a.active_minutes}p`, icon: Timer, color: 'text-metric-blue' },
    { label: 'Đốt cháy', value: `${a.active_kcal}`, unit: 'kcal', icon: Flame, color: 'text-metric-orange' },
  ];

  return (
    <div className="metric-card space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Hoạt Động</h3>
      <div className="grid grid-cols-3 gap-3">
        {items.map(item => (
          <div key={item.label} className="flex flex-col items-center gap-1 bg-secondary/50 rounded-lg p-3">
            <item.icon className={`w-5 h-5 ${item.color}`} />
            <span className="text-xl font-mono font-bold">{item.value}</span>
            <span className="text-[10px] text-muted-foreground uppercase">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActivityCard;
